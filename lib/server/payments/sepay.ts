import "server-only";
import { and, eq, sql } from "drizzle-orm";
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
  | { status: "paid" | "partial" | "extra" | "unmatched"; orderId: string | null; telegram: string };

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
    const done = (kind: PaymentNotice["kind"], notice: PaymentNotice): SepayOutcome => ({
      status: kind,
      orderId: o.id,
      telegram: paymentText(notice),
    });

    if (o.paymentStatus !== "unpaid" || o.status === "cancelled" || o.status === "no_show") {
      return done("extra", { kind: "extra", seq: o.seq, amount: p.transferAmount, status: o.status === "cancelled" ? "cancelled" : "already_paid" });
    }
    const [{ received }] = await tx
      .select({ received: sql<number>`coalesce(sum(${t.payments.amount}), 0)::int` })
      .from(t.payments)
      .where(and(eq(t.payments.orderId, o.id), eq(t.payments.provider, "sepay")));
    if (received < o.total) {
      return done("partial", { kind: "partial", seq: o.seq, amount: p.transferAmount, received, total: o.total });
    }
    await settlePaid(tx, o, { method: "transfer", actor: "sepay", amount: received, now: ctx.now, data: { txn: p.id } });
    return done("paid", { kind: "paid", seq: o.seq, amount: received });
  });
}
