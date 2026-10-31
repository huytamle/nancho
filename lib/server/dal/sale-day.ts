import "server-only";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { isAffected, pauseCancelReason, pauseMessage, pauseReasonOf } from "@/lib/domain/oven-lock";
import { hasRole, orderRoles, type Role } from "@/lib/domain/roles";
import { addDays, vnDateOf, vnDayLabel, vnTimeLabel, type ISODate } from "@/lib/domain/time";
import type { DayStatus, OrderStatus, PaymentStatus } from "@/lib/domain/types";
import { getDb, type Db, type Executor } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { advanceOrdersInTx } from "@/lib/server/dal/admin";
import { loadSettings } from "@/lib/server/dal/settings";
import { handoverText, ovenPausedText, ovenResumedText, refundText, type AffectedOrder } from "@/lib/server/notify/messages";

// Gói "Ngày bán" (§18): khoá lò 1 chạm, đơn bị ảnh hưởng + ghi hoàn tiền, bàn giao tiền COD của shipper.
// Server Action/bot lo xác thực; quyền nghiệp vụ kiểm ở đây để integration test gọi thẳng.

/** Ai được khoá/mở lò, huỷ đơn vì khoá lò, ghi hoàn tiền, nhận bàn giao COD. */
export const SALE_DAY_ROLES: Role[] = ["owner", "manager", "kitchen"];

export type SaleActor = { id: number; name: string; roles: Role[] };
type Ctx = { actor: SaleActor; now: Date; db?: Db };
type Fail<R extends string> = { ok: false; reason: R };

const tag = (a: SaleActor) => `staff:${a.id}`;
const allowed = (a: SaleActor) => hasRole(a.roles, SALE_DAY_ROLES);

// ── Khoá lò (§18.1) ──

export type AffectedView = {
  id: string;
  seq: number;
  name: string;
  phone: string;
  serviceDate: ISODate;
  readyLabel: string;
  dayLabel: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  /** Tiền khách đã trả (0 = COD/chưa trả). */
  paid: number;
  total: number;
};

export type OvenLockView = {
  today: ISODate;
  /** null = hôm nay không có lịch bán. */
  status: DayStatus | null;
  reason: string;
  /** Ngày mai cũng đang khoá. */
  tomorrowPaused: boolean;
  /** Ngày mai có lịch bán (để hiện tuỳ chọn "cả ngày mai"). */
  tomorrowOpen: boolean;
  affected: AffectedView[];
  /** Đơn đã huỷ nhưng khách đã trả → cần ghi hoàn tiền (2 ngày gần nhất trở đi). */
  refunds: AffectedView[];
};

async function ordersView(where: ReturnType<typeof and>, now: Date, db: Executor): Promise<AffectedView[]> {
  const rows = await db
    .select({ o: t.orders, readyAt: t.batches.readyAt })
    .from(t.orders)
    .innerJoin(t.batches, eq(t.batches.id, t.orders.batchId))
    .where(where)
    .orderBy(asc(t.orders.serviceDate), asc(t.batches.readyAt), asc(t.orders.seq));
  const today = vnDateOf(now);
  return rows.map(({ o, readyAt }) => ({
    id: o.id,
    seq: o.seq,
    name: o.customerName,
    phone: o.customerPhone,
    serviceDate: o.serviceDate,
    readyLabel: vnTimeLabel(readyAt),
    dayLabel: o.serviceDate === today ? "" : vnDayLabel(o.serviceDate, today),
    status: o.status,
    paymentStatus: o.paymentStatus,
    paid: o.paymentStatus === "paid" ? o.total : 0,
    total: o.total,
  }));
}

/** Đơn chưa kết thúc của các ngày đang khoá. */
async function affectedOn(dates: ISODate[], now: Date, db: Executor) {
  if (dates.length === 0) return [];
  const list = await ordersView(and(inArray(t.orders.serviceDate, dates), inArray(t.orders.status, ACTIVE)), now, db);
  return list.filter((o) => isAffected(o.status));
}
const ACTIVE: OrderStatus[] = ["placed", "confirmed", "baking", "ready", "delivering"];

export async function loadOvenLock(now: Date, db: Executor = getDb()): Promise<OvenLockView> {
  const today = vnDateOf(now);
  const tomorrow = addDays(today, 1);
  const days = await db.select().from(t.serviceDays).where(inArray(t.serviceDays.date, [today, tomorrow]));
  const d0 = days.find((d) => d.date === today);
  const d1 = days.find((d) => d.date === tomorrow);
  const paused = days.filter((d) => d.status === "paused").map((d) => d.date);
  const [affected, refunds] = await Promise.all([
    affectedOn(paused, now, db),
    ordersView(and(eq(t.orders.status, "cancelled"), eq(t.orders.paymentStatus, "paid"), gte(t.orders.serviceDate, addDays(today, -2))), now, db),
  ]);
  return {
    today,
    status: d0?.status ?? null,
    reason: pauseReasonOf(d0?.pauseMessage ?? d1?.pauseMessage ?? null),
    tomorrowPaused: d1?.status === "paused",
    tomorrowOpen: d1?.status === "open",
    affected,
    refunds,
  };
}

const daysLabel = (dates: ISODate[], today: ISODate) => dates.map((d) => (d === today ? "hôm nay" : vnDayLabel(d, today))).join(" + ");

const toNotice = (o: AffectedView): AffectedOrder => ({ seq: o.seq, name: o.name, phone: o.phone, readyLabel: o.readyLabel, dayLabel: o.dayLabel, paid: o.paid });

export type PauseOutcome = { ok: true; dates: ISODate[]; affected: AffectedView[]; telegram: string } | Fail<"forbidden" | "not_found">;

/** Khoá hôm nay (tuỳ chọn cả ngày mai). Ngày không có lịch bán thì bỏ qua; không có ngày nào → not_found. */
export async function pauseOvenCore(input: { reason: string; tomorrow: boolean }, ctx: Ctx): Promise<PauseOutcome> {
  if (!allowed(ctx.actor)) return { ok: false, reason: "forbidden" };
  const db = ctx.db ?? getDb();
  const today = vnDateOf(ctx.now);
  const wanted = input.tomorrow ? [today, addDays(today, 1)] : [today];
  const reason = input.reason.trim().slice(0, 80);
  const rows = await db
    .update(t.serviceDays)
    .set({ status: "paused", pauseMessage: pauseMessage(reason) })
    .where(inArray(t.serviceDays.date, wanted))
    .returning({ date: t.serviceDays.date });
  if (rows.length === 0) return { ok: false, reason: "not_found" };
  const dates = rows.map((r) => r.date).sort();
  await db.insert(t.opsEvents).values({ type: "oven_paused", actor: tag(ctx.actor), data: { dates, reason }, createdAt: ctx.now });
  const affected = await affectedOn(dates, ctx.now, db);
  return {
    ok: true,
    dates,
    affected,
    telegram: ovenPausedText({ by: ctx.actor.name, reason, days: daysLabel(dates, today), orders: affected.map(toNotice) }),
  };
}

export type ResumeOutcome = { ok: true; dates: ISODate[]; telegram: string | null } | Fail<"forbidden">;

/** Mở lại hôm nay + ngày mai nếu đang khoá. Ngày đang `closed` giữ nguyên. */
export async function resumeOvenCore(ctx: Ctx): Promise<ResumeOutcome> {
  if (!allowed(ctx.actor)) return { ok: false, reason: "forbidden" };
  const db = ctx.db ?? getDb();
  const today = vnDateOf(ctx.now);
  const rows = await db
    .update(t.serviceDays)
    .set({ status: "open", pauseMessage: null })
    .where(and(inArray(t.serviceDays.date, [today, addDays(today, 1)]), eq(t.serviceDays.status, "paused")))
    .returning({ date: t.serviceDays.date });
  const dates = rows.map((r) => r.date).sort();
  if (dates.length > 0) await db.insert(t.opsEvents).values({ type: "oven_resumed", actor: tag(ctx.actor), data: { dates }, createdAt: ctx.now });
  return { ok: true, dates, telegram: dates.length > 0 ? ovenResumedText({ by: ctx.actor.name, days: daysLabel(dates, today) }) : null };
}

// ── Huỷ vì khoá lò & ghi hoàn tiền ──

export type Refund = { amount: number; method: "transfer" | "cash"; note?: string | null };

async function refundInTx(tx: Executor, o: t.Order, refund: Refund, ctx: Omit<Ctx, "db">) {
  const note = refund.note?.trim() || null;
  await tx.insert(t.payments).values({
    orderId: o.id,
    provider: "refund",
    providerTxnId: `refund:${o.id}`,
    amount: -refund.amount,
    memo: [refund.method === "cash" ? "Tiền mặt" : "CK", note].filter(Boolean).join(" · "),
    createdAt: ctx.now,
  });
  await tx.update(t.orders).set({ paymentStatus: "refunded", updatedAt: ctx.now }).where(eq(t.orders.id, o.id));
  await tx.insert(t.orderEvents).values({
    orderId: o.id,
    type: "refunded",
    actor: tag(ctx.actor),
    data: { amount: refund.amount, method: refund.method, note },
    createdAt: ctx.now,
  });
}

export type CancelPausedOutcome =
  | { ok: true; telegram: string | null }
  | Fail<"forbidden" | "not_found" | "too_late" | "refund_required" | "invalid">;

/**
 * [Huỷ — quán tạm ngưng]: huỷ như huỷ thường (trả suất qua advanceOrdersInTx) và — nếu khách đã trả — ghi hoàn tiền
 * trong **cùng** transaction. Đơn đã huỷ mà đã trả (vd. huỷ ở chỗ khác, CK đến muộn) → chỉ ghi hoàn tiền.
 */
export async function cancelWithRefundCore(orderId: string, refund: Refund | null, ctx: Ctx): Promise<CancelPausedOutcome> {
  if (!allowed(ctx.actor)) return { ok: false, reason: "forbidden" };
  const db = ctx.db ?? getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ o: t.orders, pauseMessage: t.serviceDays.pauseMessage })
      .from(t.orders)
      .innerJoin(t.serviceDays, eq(t.serviceDays.date, t.orders.serviceDate))
      .where(eq(t.orders.id, orderId))
      .limit(1)
      .for("update", { of: t.orders });
    if (!row) return { ok: false, reason: "not_found" } as const;
    const { o } = row;
    const paid = o.paymentStatus === "paid";
    if (paid && !refund) return { ok: false, reason: "refund_required" } as const;
    if (refund && (!paid || refund.amount <= 0 || refund.amount > o.total)) return { ok: false, reason: "invalid" } as const;

    if (o.status !== "cancelled") {
      const res = await advanceOrdersInTx(tx, [o.id], "cancelled", {
        actor: { id: ctx.actor.id, roles: orderRoles(ctx.actor.roles) },
        now: ctx.now,
        reason: pauseCancelReason(pauseReasonOf(row.pauseMessage)),
      });
      if (res.updated.length === 0) {
        const r = res.skipped[0]?.reason;
        return { ok: false, reason: r === "forbidden" || r === "reason_required" ? "forbidden" : "too_late" } as const;
      }
    }
    if (!refund) return { ok: true, telegram: null } as const;
    await refundInTx(tx, o, refund, ctx);
    return {
      ok: true,
      telegram: refundText({ seq: o.seq, amount: refund.amount, method: refund.method, by: ctx.actor.name, note: refund.note?.trim() || null }),
    } as const;
  });
}

// ── Bàn giao tiền COD của shipper (§18.4) ──

export type HandoverView = {
  /** Đơn COD đã giao, chưa bàn giao — theo người bấm "Đã giao". */
  pending: { shipperId: number; shipperName: string; orders: { id: string; seq: number; name: string }[]; expected: number }[];
  done: { id: number; shipperName: string; receiverName: string; orders: number; expected: number; received: number; at: string; note: string | null }[];
};

/** Đơn giao COD hoàn tất trong ngày + người bấm Đã giao (order_events mới nhất → completed). */
async function codDelivered(date: ISODate, db: Executor, ids?: string[]) {
  const rows = await db
    .select({ id: t.orders.id, seq: t.orders.seq, name: t.orders.customerName, total: t.orders.total, actor: t.orderEvents.actor })
    .from(t.orders)
    .innerJoin(
      t.orderEvents,
      and(eq(t.orderEvents.orderId, t.orders.id), eq(t.orderEvents.type, "status_changed"), sql`${t.orderEvents.data}->>'to' = 'completed'`),
    )
    .where(
      and(
        eq(t.orders.serviceDate, date),
        eq(t.orders.fulfillment, "delivery"),
        eq(t.orders.status, "completed"),
        eq(t.orders.paymentStatus, "unpaid"),
        ids ? inArray(t.orders.id, ids) : undefined,
        sql`NOT EXISTS (SELECT 1 FROM ${t.cashHandovers} h WHERE ${t.orders.id} = ANY(h.order_ids))`,
      ),
    )
    .orderBy(asc(t.orders.seq), desc(t.orderEvents.id));
  // Một đơn chỉ có một lần → completed (trạng thái cuối); vẫn lấy dòng mới nhất cho chắc.
  const seen = new Set<string>();
  return rows
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .map((r) => ({ ...r, shipperId: /^staff:(\d+)$/.test(r.actor) ? Number(r.actor.slice(6)) : null }));
}

export async function loadHandovers(date: ISODate, db: Executor = getDb()): Promise<HandoverView> {
  const [orders, done, people] = await Promise.all([
    codDelivered(date, db),
    db.select().from(t.cashHandovers).where(eq(t.cashHandovers.serviceDate, date)).orderBy(asc(t.cashHandovers.id)),
    db.select({ id: t.staff.id, name: t.staff.name }).from(t.staff),
  ]);
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const by = new Map<number, HandoverView["pending"][number]>();
  for (const o of orders) {
    if (o.shipperId === null) continue;
    const g = by.get(o.shipperId) ?? { shipperId: o.shipperId, shipperName: nameOf.get(o.shipperId) ?? `#${o.shipperId}`, orders: [], expected: 0 };
    g.orders.push({ id: o.id, seq: o.seq, name: o.name });
    g.expected += o.total;
    by.set(o.shipperId, g);
  }
  return {
    pending: [...by.values()],
    done: done.map((h) => ({
      id: h.id,
      shipperName: nameOf.get(h.shipperId) ?? "",
      receiverName: nameOf.get(h.receivedBy) ?? "",
      orders: h.orderIds.length,
      expected: h.expected,
      received: h.received,
      at: h.createdAt.toISOString(),
      note: h.note,
    })),
  };
}

export type HandoverOutcome =
  | { ok: true; expected: number; received: number; telegram: string | null }
  | Fail<"forbidden" | "self_review" | "duplicate" | "invalid">;

/**
 * Người nhận (≠ shipper) nhập số tiền đếm thật. Khoá dòng đơn → hai người nhận cùng lúc thì người sau thấy
 * đơn đã bàn giao (`duplicate`). Lệch ≠ 0 → Telegram (vượt `cashTolerance` → ⚠).
 */
export async function recordHandoverCore(
  input: { date: ISODate; shipperId: number; orderIds: string[]; received: number; note?: string | null },
  ctx: Ctx,
): Promise<HandoverOutcome> {
  if (!allowed(ctx.actor)) return { ok: false, reason: "forbidden" };
  if (input.shipperId === ctx.actor.id) return { ok: false, reason: "self_review" };
  const ids = [...new Set(input.orderIds)];
  const db = ctx.db ?? getDb();
  return db.transaction(async (tx) => {
    await tx.select({ id: t.orders.id }).from(t.orders).where(inArray(t.orders.id, ids)).orderBy(t.orders.id).for("update");
    const orders = await codDelivered(input.date, tx, ids);
    if (orders.length !== ids.length) {
      const [already] = await tx
        .select({ id: t.cashHandovers.id })
        .from(t.cashHandovers)
        .where(sql`${t.cashHandovers.orderIds} && ARRAY[${sql.join(ids.map((i) => sql`${i}`), sql`, `)}]::uuid[]`)
        .limit(1);
      return { ok: false, reason: already ? "duplicate" : "invalid" } as const;
    }
    if (orders.some((o) => o.shipperId !== input.shipperId)) return { ok: false, reason: "invalid" } as const;
    const expected = orders.reduce((s, o) => s + o.total, 0);
    const note = input.note?.trim() || null;
    await tx.insert(t.cashHandovers).values({
      serviceDate: input.date,
      shipperId: input.shipperId,
      orderIds: ids,
      expected,
      received: input.received,
      receivedBy: ctx.actor.id,
      note,
      createdAt: ctx.now,
    });
    if (input.received === expected) return { ok: true, expected, received: input.received, telegram: null } as const;
    const [{ ops }, [shipper]] = await Promise.all([
      loadSettings(tx),
      tx.select({ name: t.staff.name }).from(t.staff).where(eq(t.staff.id, input.shipperId)),
    ]);
    return {
      ok: true,
      expected,
      received: input.received,
      telegram: handoverText({
        shipper: shipper?.name ?? "",
        receiver: ctx.actor.name,
        expected,
        received: input.received,
        orders: ids.length,
        tolerance: ops.cashTolerance,
      }),
    } as const;
  });
}
