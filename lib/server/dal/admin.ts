import "server-only";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { canTransition, releasesCapacity, type StaffRole } from "@/lib/domain/order-status";
import type { ISODate } from "@/lib/domain/time";
import type { DayStatus, OrderStatus, PaymentMethod } from "@/lib/domain/types";
import { getDb, type Db } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";

// Thao tác của Kitchen Dashboard (§8.2, §10). Server Action lo zod + requireStaff; nghiệp vụ ở đây để
// integration test gọi thẳng. Mọi thao tác ghi order_events với actor = "staff:<id>".

export type StaffActor = { id: number; role: StaffRole };
type Ctx = { actor: StaffActor; now: Date; db?: Db };

const tag = (a: StaffActor) => `staff:${a.id}`;

export type Skip = { id: string; reason: "invalid_transition" | "forbidden" | "too_late" | "reason_required" | "not_found" };
export type AdvanceResult = { updated: string[]; skipped: Skip[] };

/**
 * Đổi trạng thái hàng loạt. Mỗi đơn đi qua canTransition; đơn không hợp lệ bị bỏ qua (không làm hỏng cả lô).
 * Huỷ trả suất đúng một lần; completed/no_show cập nhật bộ đếm của khách (tự xác nhận & trả trước dựa vào đó).
 */
export async function advanceOrdersCore(ids: string[], to: OrderStatus, ctx: Ctx & { reason?: string }): Promise<AdvanceResult> {
  const db = ctx.db ?? getDb();
  const reason = ctx.reason?.trim() || undefined;
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ order: t.orders, cutoffAt: t.batches.cutoffAt })
      .from(t.orders)
      .innerJoin(t.batches, eq(t.batches.id, t.orders.batchId))
      .where(inArray(t.orders.id, ids))
      .orderBy(t.orders.id) // khoá theo thứ tự cố định → hai lô chồng nhau không deadlock
      .for("update", { of: t.orders });

    const result: AdvanceResult = { updated: [], skipped: [] };
    const found = new Set(rows.map((r) => r.order.id));
    for (const id of ids) if (!found.has(id)) result.skipped.push({ id, reason: "not_found" });

    for (const { order: o, cutoffAt } of rows) {
      const check = canTransition(o.status, to, {
        actor: { type: "staff", role: ctx.actor.role },
        fulfillment: o.fulfillment,
        now: ctx.now,
        cutoffAt,
        reason,
      });
      if (!check.ok) {
        result.skipped.push({ id: o.id, reason: check.reason });
        continue;
      }
      await tx
        .update(t.orders)
        .set({ status: to, updatedAt: ctx.now, ...(to === "cancelled" ? { cancelReason: reason ?? null } : {}) })
        .where(eq(t.orders.id, o.id));
      if (releasesCapacity(o.status, to)) {
        await tx
          .update(t.batches)
          .set({ usedPan: sql`${t.batches.usedPan} - ${o.panUnits}`, usedBbq: sql`${t.batches.usedBbq} - ${o.bbqUnits}` })
          .where(eq(t.batches.id, o.batchId));
      }
      if (to === "completed" || to === "no_show") {
        await tx
          .update(t.customers)
          .set(
            to === "completed"
              ? { completedCount: sql`${t.customers.completedCount} + 1` }
              : { noShowCount: sql`${t.customers.noShowCount} + 1` },
          )
          .where(eq(t.customers.id, o.customerId));
      }
      await tx.insert(t.orderEvents).values({
        orderId: o.id,
        type: to === "cancelled" ? "cancelled" : "status_changed",
        actor: tag(ctx.actor),
        data: { from: o.status, to, ...(reason ? { reason } : {}) },
        createdAt: ctx.now,
      });
      result.updated.push(o.id);
    }
    return result;
  });
}

/** [Đút lò] confirmed → baking, [Ra lò] baking → ready cho cả mẻ (§10.3). Đơn còn `placed` không vào lò. */
export async function advanceBatchCore(batchId: number, to: "baking" | "ready", ctx: Ctx) {
  const db = ctx.db ?? getDb();
  const from: OrderStatus = to === "baking" ? "confirmed" : "baking";
  const ids = await db
    .select({ id: t.orders.id })
    .from(t.orders)
    .where(and(eq(t.orders.batchId, batchId), eq(t.orders.status, from)));
  const res = await advanceOrdersCore(
    ids.map((r) => r.id),
    to,
    { ...ctx, db },
  );
  if (res.updated.length > 0) {
    await db
      .update(t.batches)
      .set({ status: to === "baking" ? "baking" : "done" })
      .where(eq(t.batches.id, batchId));
  }
  const [{ waiting }] = await db
    .select({ waiting: sql<number>`count(*)::int` })
    .from(t.orders)
    .where(and(eq(t.orders.batchId, batchId), eq(t.orders.status, "placed")));
  return { updated: res.updated.length, unconfirmed: waiting };
}

/** Đánh dấu đã trả tiền (owner). Ghi payments (manual, idempotent) và tự xác nhận đơn `placed` (§7.5). */
export async function markPaidCore(orderId: string, method: PaymentMethod, ctx: Ctx) {
  const db = ctx.db ?? getDb();
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(t.orders).where(eq(t.orders.id, orderId)).limit(1).for("update");
    if (!o) return { ok: false as const, reason: "not_found" as const };
    if (o.paymentStatus === "paid") return { ok: true as const };
    const confirm = o.status === "placed";
    await tx
      .update(t.orders)
      .set({ paymentStatus: "paid", paymentMethod: method, updatedAt: ctx.now, ...(confirm ? { status: "confirmed" as const } : {}) })
      .where(eq(t.orders.id, orderId));
    await tx
      .insert(t.payments)
      .values({ orderId, provider: "manual", providerTxnId: `manual:${orderId}`, amount: o.total, createdAt: ctx.now })
      .onConflictDoNothing();
    await tx.insert(t.orderEvents).values([
      { orderId, type: "paid", actor: tag(ctx.actor), data: { method, amount: o.total }, createdAt: ctx.now },
      ...(confirm
        ? [{ orderId, type: "status_changed" as const, actor: "system", data: { from: "placed", to: "confirmed" }, createdAt: ctx.now }]
        : []),
    ]);
    return { ok: true as const };
  });
}

/** Đổi mẻ trong cùng ngày (§10.4): chỉ đơn chưa vào lò; giữ suất mẻ mới có điều kiện rồi trả suất mẻ cũ. */
export async function moveOrderCore(orderId: string, toBatchId: number, ctx: Ctx) {
  const db = ctx.db ?? getDb();
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(t.orders).where(eq(t.orders.id, orderId)).limit(1).for("update");
    if (!o) return { ok: false as const, reason: "not_found" as const };
    if (o.batchId === toBatchId) return { ok: true as const };
    if (o.status !== "placed" && o.status !== "confirmed") return { ok: false as const, reason: "too_late" as const };
    const [held] = await tx
      .update(t.batches)
      .set({ usedPan: sql`${t.batches.usedPan} + ${o.panUnits}`, usedBbq: sql`${t.batches.usedBbq} + ${o.bbqUnits}` })
      .where(
        and(
          eq(t.batches.id, toBatchId),
          eq(t.batches.serviceDate, o.serviceDate),
          inArray(t.batches.status, ["open", "closed"]),
          lte(sql`${t.batches.usedPan} + ${o.panUnits}`, t.batches.capPan),
          lte(sql`${t.batches.usedBbq} + ${o.bbqUnits}`, t.batches.capBbq),
        ),
      )
      .returning({ id: t.batches.id });
    if (!held) return { ok: false as const, reason: "slot_full" as const };
    await tx
      .update(t.batches)
      .set({ usedPan: sql`${t.batches.usedPan} - ${o.panUnits}`, usedBbq: sql`${t.batches.usedBbq} - ${o.bbqUnits}` })
      .where(eq(t.batches.id, o.batchId));
    await tx.update(t.orders).set({ batchId: toBatchId, updatedAt: ctx.now }).where(eq(t.orders.id, orderId));
    await tx.insert(t.orderEvents).values({
      orderId,
      type: "edited",
      actor: tag(ctx.actor),
      data: { batchFrom: o.batchId, batchTo: toBatchId },
      createdAt: ctx.now,
    });
    return { ok: true as const };
  });
}

export async function updateNoteCore(orderId: string, note: string, ctx: Ctx) {
  const db = ctx.db ?? getDb();
  const value = note.trim() || null;
  const [row] = await db.update(t.orders).set({ note: value, updatedAt: ctx.now }).where(eq(t.orders.id, orderId)).returning({ id: t.orders.id });
  if (!row) return { ok: false as const, reason: "not_found" as const };
  await db.insert(t.orderEvents).values({ orderId, type: "edited", actor: tag(ctx.actor), data: { note: value }, createdAt: ctx.now });
  return { ok: true as const };
}

/** Sức chứa / mở-đóng mẻ (owner). Không cho sức chứa thấp hơn số đã giữ (§8.2). */
export async function updateBatchCore(input: { batchId: number; capPan?: number; capBbq?: number; status?: "open" | "closed" }, db: Db = getDb()) {
  const set: Partial<typeof t.batches.$inferInsert> = {};
  if (input.capPan !== undefined) set.capPan = input.capPan;
  if (input.capBbq !== undefined) set.capBbq = input.capBbq;
  if (input.status) set.status = input.status;
  const [row] = await db
    .update(t.batches)
    .set(set)
    .where(
      and(
        eq(t.batches.id, input.batchId),
        input.capPan !== undefined ? lte(t.batches.usedPan, input.capPan) : undefined,
        input.capBbq !== undefined ? lte(t.batches.usedBbq, input.capBbq) : undefined,
        // Mẻ đã vào lò không mở/đóng lại được.
        input.status ? inArray(t.batches.status, ["open", "closed"]) : undefined,
      ),
    )
    .returning({ id: t.batches.id });
  return row ? { ok: true as const } : { ok: false as const, reason: "below_used" as const };
}

export async function setDayStatusCore(date: ISODate, status: DayStatus, pauseMessage: string | null, db: Db = getDb()) {
  const [row] = await db
    .update(t.serviceDays)
    .set({ status, pauseMessage: status === "paused" ? pauseMessage?.trim() || null : null })
    .where(eq(t.serviceDays.date, date))
    .returning({ date: t.serviceDays.date });
  return row ? { ok: true as const } : { ok: false as const, reason: "not_found" as const };
}

export async function toggleProductCore(productId: string, isAvailable: boolean, db: Db = getDb()) {
  const [row] = await db.update(t.products).set({ isAvailable }).where(eq(t.products.id, productId)).returning({ id: t.products.id });
  return row ? { ok: true as const } : { ok: false as const, reason: "not_found" as const };
}
