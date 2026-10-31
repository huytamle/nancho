import "server-only";
import { and, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { HOLD_EXPIRED_REASON } from "@/lib/domain/hold";
import { matchTransferMemo } from "@/lib/domain/order-code";
import { sepayText, type SepayPayload } from "@/lib/payments";
import { getDb, type Db } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { settlePaid } from "@/lib/server/dal/admin";
import { paymentText, type PaymentNotice } from "@/lib/server/notify/messages";

// Đối soát giao dịch SePay (§11.2): lưu payments (idempotent theo id giao dịch) → dò mã đơn trong nội dung →
// cộng mọi khoản đã nhận của đơn ≥ total → paid (+ tự xác nhận). Không khớp → order_id = null + cảnh báo Telegram.

export type SepayOutcome =
  | { status: "ignored" | "duplicate" }
  | { status: "paid" | "partial" | "extra" | "unmatched" | "late_reopened" | "late_refund"; orderId: string | null; telegram: string };

export async function recordSepayCore(p: SepayPayload, ctx: { now: Date; db?: Db }): Promise<SepayOutcome> {
  if (p.transferType !== "in" || p.transferAmount <= 0) return { status: "ignored" };
  const db = ctx.db ?? getDb();
  const text = sepayText(p);

  return db.transaction(async (tx) => {
    const [payment] = await tx
      .insert(t.payments)
      .values({ provider: "sepay", providerTxnId: `sepay:${p.id}`, amount: p.transferAmount, memo: text.slice(0, 500), raw: p, createdAt: ctx.now })
      .onConflictDoNothing({ target: t.payments.providerTxnId })
      .returning({ id: t.payments.id });
    if (!payment) return { status: "duplicate" as const };

    const unmatched = (): SepayOutcome => ({
      status: "unmatched",
      orderId: null,
      telegram: paymentText({ kind: "unmatched", amount: p.transferAmount, content: text }),
    });
    const ref = matchTransferMemo(text, ctx.now);
    if (!ref) return unmatched();
    const [o] = await tx
      .select()
      .from(t.orders)
      .where(and(eq(t.orders.serviceDate, ref.serviceDate), eq(t.orders.seq, ref.seq)))
      .limit(1)
      .for("update");
    if (!o) return unmatched();

    await tx.update(t.payments).set({ orderId: o.id }).where(eq(t.payments.id, payment.id));
    const done = (kind: Exclude<PaymentNotice["kind"], "late">, notice: PaymentNotice): SepayOutcome => ({
      status: kind,
      orderId: o.id,
      telegram: paymentText(notice),
    });

    const receivedSoFar = async () => {
      const [{ received }] = await tx
        .select({ received: sql<number>`coalesce(sum(${t.payments.amount}), 0)::int` })
        .from(t.payments)
        .where(and(eq(t.payments.orderId, o.id), eq(t.payments.provider, "sepay")));
      return received;
    };

    // Tiền đến sau khi hết giờ giữ suất (§18.2): mẻ còn chỗ (chưa vào lò) → giữ lại suất & mở lại đơn; hết chỗ → ghi tiền, chờ hoàn.
    if (o.status === "cancelled" && o.cancelReason === HOLD_EXPIRED_REASON && o.paymentStatus === "unpaid") {
      const received = await receivedSoFar();
      if (received < o.total) return done("partial", { kind: "partial", seq: o.seq, amount: p.transferAmount, received, total: o.total });
      const [held] = await tx
        .update(t.batches)
        .set({ usedPan: sql`${t.batches.usedPan} + ${o.panUnits}`, usedBbq: sql`${t.batches.usedBbq} + ${o.bbqUnits}` })
        .where(
          and(
            eq(t.batches.id, o.batchId),
            inArray(t.batches.status, ["open", "closed"]),
            gt(t.batches.ovenAt, ctx.now),
            lte(sql`${t.batches.usedPan} + ${o.panUnits}`, t.batches.capPan),
            lte(sql`${t.batches.usedBbq} + ${o.bbqUnits}`, t.batches.capBbq),
            sql`EXISTS (SELECT 1 FROM ${t.serviceDays} WHERE ${t.serviceDays.date} = ${t.batches.serviceDate} AND ${t.serviceDays.status} = 'open')`,
          ),
        )
        .returning({ id: t.batches.id });
      if (held) {
        await tx.update(t.orders).set({ status: "placed", cancelReason: null, holdUntil: null, updatedAt: ctx.now }).where(eq(t.orders.id, o.id));
        await tx.insert(t.orderEvents).values({
          orderId: o.id,
          type: "status_changed",
          actor: "sepay",
          data: { from: "cancelled", to: "placed", reason: "late_payment" },
          createdAt: ctx.now,
        });
        await settlePaid(tx, { ...o, status: "placed" }, { method: "transfer", actor: "sepay", amount: received, now: ctx.now, data: { txn: p.id } });
        return { status: "late_reopened", orderId: o.id, telegram: paymentText({ kind: "late", seq: o.seq, amount: received, reopened: true }) };
      }
      // Giữ đơn huỷ nhưng ghi đã trả → hiện "cần hoàn" ở màn bếp (ghi hoàn tiền như khoá lò, §18.1).
      await tx.update(t.orders).set({ paymentStatus: "paid", paymentMethod: "transfer", updatedAt: ctx.now }).where(eq(t.orders.id, o.id));
      await tx.insert(t.orderEvents).values({
        orderId: o.id,
        type: "paid",
        actor: "sepay",
        data: { method: "transfer", amount: received, txn: p.id, late: true },
        createdAt: ctx.now,
      });
      return { status: "late_refund", orderId: o.id, telegram: paymentText({ kind: "late", seq: o.seq, amount: received, reopened: false }) };
    }

    if (o.paymentStatus !== "unpaid" || o.status === "cancelled" || o.status === "no_show") {
      return done("extra", { kind: "extra", seq: o.seq, amount: p.transferAmount, status: o.status === "cancelled" ? "cancelled" : "already_paid" });
    }
    const received = await receivedSoFar();
    if (received < o.total) {
      return done("partial", { kind: "partial", seq: o.seq, amount: p.transferAmount, received, total: o.total });
    }
    await settlePaid(tx, o, { method: "transfer", actor: "sepay", amount: received, now: ctx.now, data: { txn: p.id } });
    return done("paid", { kind: "paid", seq: o.seq, amount: received });
  });
}
