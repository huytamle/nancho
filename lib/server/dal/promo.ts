import "server-only";
import { and, count, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { customerStage, type CustomerStage } from "@/lib/domain/order-status";
import {
  addDaysTo,
  checkReferral,
  checkVoucher,
  makeCode,
  normalizeCode,
  pointsFor,
  PROMO,
  tierOf,
  type PromoCheck,
  type PromoError,
  type VoucherKind,
} from "@/lib/domain/promo";
import { vnDateOf, vnDayLabel, vnTimeLabel, type ISODate } from "@/lib/domain/time";
import type { OrderStatus, Segment } from "@/lib/domain/types";
import { getDb, type Db, type Executor } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";

// Thành viên, điểm & mã ưu đãi (§19, M12). Quy tắc thuần ở lib/domain/promo.ts; file này lo khoá dòng & ghi sổ.

export type Member = typeof t.members.$inferSelect;

const rand = () => randomBytes(1)[0];
const isUnique = (err: unknown) => {
  const e = err as { code?: string; cause?: { code?: string } };
  return (e?.cause?.code ?? e?.code) === "23505";
};

/** Thêm mã với code ngẫu nhiên; trùng code (rất hiếm) thì sinh lại. Trùng (đơn nguồn, loại) → null (đã phát). */
async function issueVoucher(
  db: Executor,
  v: { kind: VoucherKind; amount: number; minSubtotal: number; days: number; memberId?: string | null; customerId?: string | null; sourceOrderId?: string | null },
  now: Date,
): Promise<string | null> {
  for (let i = 0; i < 4; i++) {
    const code = makeCode("TH", 6, rand);
    const rows = await db
      .insert(t.vouchers)
      .values({
        code,
        kind: v.kind,
        amount: v.amount,
        minSubtotal: v.minSubtotal,
        memberId: v.memberId ?? null,
        customerId: v.customerId ?? null,
        sourceOrderId: v.sourceOrderId ?? null,
        expiresAt: addDaysTo(now, v.days),
        createdAt: now,
      })
      .onConflictDoNothing({ target: [t.vouchers.sourceOrderId, t.vouchers.kind] })
      .returning({ code: t.vouchers.code })
      .catch((err: unknown) => {
        if (isUnique(err)) return null; // code trùng → thử lại
        throw err;
      });
    if (rows === null) continue;
    return rows[0]?.code ?? null;
  }
  throw new Error("Không sinh được mã ưu đãi");
}

/** Thành viên của tài khoản Clerk; lần đầu → tạo + quà chào mừng. Idempotent khi gọi song song. */
export async function ensureMember(profile: { clerkUserId: string; name: string; email: string | null }, now: Date, db: Db = getDb()): Promise<Member> {
  const [found] = await db.select().from(t.members).where(eq(t.members.clerkUserId, profile.clerkUserId)).limit(1);
  if (found) return found;
  return db.transaction(async (tx) => {
    for (let i = 0; i < 4; i++) {
      const [created] = await tx
        .insert(t.members)
        .values({
          clerkUserId: profile.clerkUserId,
          name: profile.name.trim().slice(0, 40) || "Bạn",
          email: profile.email,
          referralCode: makeCode("HEAT", 4, rand),
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning();
      if (created) {
        await issueVoucher(tx, { ...PROMO.welcome, kind: "welcome", memberId: created.id }, now);
        return created;
      }
      const [again] = await tx.select().from(t.members).where(eq(t.members.clerkUserId, profile.clerkUserId)).limit(1);
      if (again) return again; // request song song đã tạo trước
    }
    throw new Error("Không tạo được thành viên");
  });
}

/** SĐT chưa có đơn nào (trừ đơn đã huỷ) — điều kiện của quà chào mừng & mã giới thiệu. */
async function isFirstOrder(phone: string, db: Executor): Promise<boolean> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(t.orders)
    .where(and(eq(t.orders.customerPhone, phone), ne(t.orders.status, "cancelled")));
  return n === 0;
}

export type ResolvedPromo =
  | { ok: true; amount: number; voucherId: number | null; referrerId: string | null; label: string }
  | { ok: false; reason: PromoError; minSubtotal?: number };

/**
 * Mã khách gõ: mã ưu đãi (của chính thành viên, hoặc của SĐT đơn này) hoặc mã giới thiệu của thành viên khác.
 * Chỉ kiểm tra — giữ mã thật nằm trong transaction đặt đơn (`consumeVoucher`).
 */
export async function resolvePromo(
  raw: string,
  ctx: { phone: string; member: Pick<Member, "id"> | null; subtotal: number; now: Date },
  db: Executor = getDb(),
): Promise<ResolvedPromo> {
  const code = normalizeCode(raw);
  if (code.length < 4) return { ok: false, reason: "not_found" };
  const [v] = await db.select().from(t.vouchers).where(eq(t.vouchers.code, code)).limit(1);
  const firstOrder = await isFirstOrder(ctx.phone, db);
  const done = (r: PromoCheck, extra: { voucherId: number | null; referrerId: string | null; label: string }): ResolvedPromo =>
    r.ok ? { ok: true, amount: r.amount, ...extra } : r;

  if (v) {
    const [owner] = v.customerId ? await db.select({ phone: t.customers.phone }).from(t.customers).where(eq(t.customers.id, v.customerId)).limit(1) : [];
    const mine = (v.memberId !== null && v.memberId === ctx.member?.id) || owner?.phone === ctx.phone;
    if (!mine) return { ok: false, reason: "not_yours" };
    return done(checkVoucher(v, { subtotal: ctx.subtotal, now: ctx.now, firstOrder }), { voucherId: v.id, referrerId: null, label: code });
  }
  const [ref] = await db.select({ id: t.members.id }).from(t.members).where(eq(t.members.referralCode, code)).limit(1);
  if (!ref) return { ok: false, reason: "not_found" };
  return done(checkReferral({ subtotal: ctx.subtotal, firstOrder, ownCode: ref.id === ctx.member?.id }), {
    voucherId: null,
    referrerId: ref.id,
    label: code,
  });
}

/** Gắn mã vào đơn trong transaction đặt đơn. false = vừa bị đơn khác dùng (hai thiết bị cùng lúc). */
export async function consumeVoucher(tx: Executor, voucherId: number, orderId: string): Promise<boolean> {
  const rows = await tx
    .update(t.vouchers)
    .set({ usedOrderId: orderId })
    .where(and(eq(t.vouchers.id, voucherId), isNull(t.vouchers.usedOrderId)))
    .returning({ id: t.vouchers.id });
  return rows.length === 1;
}

/** Đơn bị huỷ → trả mã lại cho khách (vẫn theo hạn cũ). */
export async function releaseVouchers(tx: Executor, orderIds: string[]) {
  if (orderIds.length === 0) return;
  await tx.update(t.vouchers).set({ usedOrderId: null }).where(inArray(t.vouchers.usedOrderId, orderIds));
}

/** Đơn hoàn tất: cộng điểm cho thành viên; thưởng người giới thiệu (tối đa `monthlyCap` lần/tháng). Mỗi đơn một lần. */
export async function rewardCompleted(tx: Executor, o: Pick<t.Order, "id" | "memberId" | "referrerId" | "total">, now: Date) {
  const pts = pointsFor(o.total);
  if (o.memberId && pts > 0) {
    await tx.insert(t.pointMoves).values({ memberId: o.memberId, delta: pts, reason: "order", orderId: o.id, createdAt: now }).onConflictDoNothing();
  }
  if (o.referrerId) {
    const since = addDaysTo(now, -30);
    const [{ n }] = await tx
      .select({ n: count() })
      .from(t.vouchers)
      .where(and(eq(t.vouchers.memberId, o.referrerId), eq(t.vouchers.kind, "referral"), gte(t.vouchers.createdAt, since)));
    if (n < PROMO.referral.monthlyCap) await issueVoucher(tx, { ...PROMO.referral, kind: "referral", memberId: o.referrerId, sourceOrderId: o.id }, now);
  }
}

/** Cảm ơn đánh giá món trong app: một mã cho đơn sau, mỗi đơn một lần. Trả mã (mới hoặc đã phát). */
export async function rewardReview(o: Pick<t.Order, "id" | "memberId" | "customerId" | "status">, now: Date, db: Executor = getDb()) {
  if (o.status !== "completed") return null;
  const issued = await issueVoucher(
    db,
    { ...PROMO.review, kind: "review", memberId: o.memberId, customerId: o.customerId, sourceOrderId: o.id },
    now,
  );
  if (issued) return issued;
  const [v] = await db
    .select({ code: t.vouchers.code })
    .from(t.vouchers)
    .where(and(eq(t.vouchers.sourceOrderId, o.id), eq(t.vouchers.kind, "review")))
    .limit(1);
  return v?.code ?? null;
}

export type RedeemOutcome = { ok: true; code: string } | { ok: false; reason: "not_enough" };

/** Đổi điểm → mã. Khoá dòng thành viên để hai lần bấm không trừ điểm hai lần. */
export async function redeemPointsCore(memberId: string, now: Date, db: Db = getDb()): Promise<RedeemOutcome> {
  return db.transaction(async (tx) => {
    await tx.select({ id: t.members.id }).from(t.members).where(eq(t.members.id, memberId)).for("update");
    const [{ balance }] = await tx
      .select({ balance: sql<number>`coalesce(sum(${t.pointMoves.delta}), 0)::int` })
      .from(t.pointMoves)
      .where(eq(t.pointMoves.memberId, memberId));
    const p = PROMO.points;
    if (balance < p.cost) return { ok: false, reason: "not_enough" } as const;
    await tx.insert(t.pointMoves).values({ memberId, delta: -p.cost, reason: "redeem", createdAt: now });
    const code = await issueVoucher(tx, { kind: "points", amount: p.amount, minSubtotal: p.minSubtotal, days: p.days, memberId }, now);
    return { ok: true, code: code! } as const;
  });
}

// ── Trang tài khoản ──

export type AccountVoucher = { code: string; kind: VoucherKind; amount: number; minSubtotal: number; expiresAt: string; usable: boolean; usedAt: string | null };
export type AccountOrder = {
  code: string;
  trackingPath: string;
  dayLabel: string;
  timeLabel: string;
  segment: Segment;
  status: OrderStatus;
  stage: CustomerStage;
  active: boolean;
  total: number;
  discount: number;
  summary: string;
  points: number;
};
export type AccountView = {
  name: string;
  referralCode: string;
  points: { balance: number; earned: number; history: { delta: number; reason: "order" | "redeem"; at: string }[] };
  tier: ReturnType<typeof tierOf>;
  vouchers: AccountVoucher[];
  orders: AccountOrder[];
  referrals: { completed: number };
};

const ACTIVE: OrderStatus[] = ["placed", "confirmed", "baking", "ready", "delivering"];

export async function loadAccount(member: Member, now: Date, db: Executor = getDb()): Promise<AccountView> {
  const [moves, vouchers, orderRows, [{ referred }]] = await Promise.all([
    db.select().from(t.pointMoves).where(eq(t.pointMoves.memberId, member.id)).orderBy(desc(t.pointMoves.createdAt)),
    db
      .select()
      .from(t.vouchers)
      .where(eq(t.vouchers.memberId, member.id))
      .orderBy(desc(t.vouchers.createdAt))
      .limit(30),
    db
      .select({ order: t.orders, batch: t.batches })
      .from(t.orders)
      .innerJoin(t.batches, eq(t.batches.id, t.orders.batchId))
      .where(eq(t.orders.memberId, member.id))
      .orderBy(desc(t.orders.createdAt))
      .limit(20),
    db
      .select({ referred: count() })
      .from(t.orders)
      .where(and(eq(t.orders.referrerId, member.id), eq(t.orders.status, "completed"))),
  ]);
  const items = orderRows.length
    ? await db
        .select({ orderId: t.orderItems.orderId, name: t.orderItems.name, qty: t.orderItems.qty, parent: t.orderItems.parentItemId, isGift: t.orderItems.isGift })
        .from(t.orderItems)
        .where(inArray(t.orderItems.orderId, orderRows.map((r) => r.order.id)))
    : [];
  const today = vnDateOf(now);
  const earnedByOrder = new Map(moves.filter((m) => m.reason === "order" && m.orderId).map((m) => [m.orderId!, m.delta]));
  const balance = moves.reduce((s, m) => s + m.delta, 0);
  const earned = moves.filter((m) => m.delta > 0).reduce((s, m) => s + m.delta, 0);
  const usedIn = new Map(orderRows.map((r) => [r.order.id, r.order.createdAt.toISOString()] as const));

  return {
    name: member.name,
    referralCode: member.referralCode,
    points: { balance, earned, history: moves.slice(0, 15).map((m) => ({ delta: m.delta, reason: m.reason, at: m.createdAt.toISOString() })) },
    tier: tierOf(earned),
    vouchers: vouchers.map((v) => ({
      code: v.code,
      kind: v.kind,
      amount: v.amount,
      minSubtotal: v.minSubtotal,
      expiresAt: v.expiresAt.toISOString(),
      usable: !v.usedOrderId && v.expiresAt > now,
      usedAt: v.usedOrderId ? (usedIn.get(v.usedOrderId) ?? v.createdAt.toISOString()) : null,
    })),
    orders: orderRows.map(({ order: o, batch: b }) => {
      const own = items.filter((i) => i.orderId === o.id && i.parent === null && !i.isGift);
      return {
        code: o.code,
        trackingPath: `/o/${o.trackingToken}`,
        dayLabel: vnDayLabel(o.serviceDate as ISODate, today),
        timeLabel: b.segment === "cafe" ? `${vnTimeLabel(b.ovenAt)}–${vnTimeLabel(b.readyAt)}` : vnTimeLabel(b.readyAt),
        segment: b.segment,
        status: o.status,
        stage: customerStage(o.status, o.fulfillment),
        active: ACTIVE.includes(o.status),
        total: o.total,
        discount: o.discount,
        summary: own.map((i) => `${i.qty}× ${i.name}`).join(", "),
        points: earnedByOrder.get(o.id) ?? (o.status === "completed" ? 0 : pointsFor(o.total)),
      };
    }),
    referrals: { completed: referred },
  };
}

/** Mã còn dùng được của thành viên — chip "Ví ưu đãi" ở bước chốt đơn. */
export async function usableVouchers(memberId: string, now: Date, db: Executor = getDb()) {
  return db
    .select({ code: t.vouchers.code, kind: t.vouchers.kind, amount: t.vouchers.amount, minSubtotal: t.vouchers.minSubtotal, expiresAt: t.vouchers.expiresAt })
    .from(t.vouchers)
    .where(and(eq(t.vouchers.memberId, memberId), isNull(t.vouchers.usedOrderId), sql`${t.vouchers.expiresAt} > ${now.toISOString()}::timestamptz`))
    .orderBy(desc(t.vouchers.amount));
}

