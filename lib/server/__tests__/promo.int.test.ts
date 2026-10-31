import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { vnInstant, type ISODate } from "@/lib/domain/time";
import type { PlaceOrderInput } from "@/lib/order-contract";
import { closeDb, getDb } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { seed } from "@/lib/server/db/seed";
import { advanceOrdersCore } from "@/lib/server/dal/admin";
import { loadCatalog, type Catalog } from "@/lib/server/dal/catalog";
import { submitFeedbackCore } from "@/lib/server/dal/feedback";
import { requestStaffAccessCore, reviewStaffRequestCore } from "@/lib/server/dal/ops";
import { cancelOrderByTokenCore, placeOrderCore } from "@/lib/server/dal/orders";
import { ensureMember, loadAccount, redeemPointsCore, resolvePromo, type Member } from "@/lib/server/dal/promo";
import { getOvenSnapshot } from "@/lib/server/dal/schedule";
import { verifyStaffPin } from "@/lib/server/dal/staff";

// M12 (§19): cà phê ship theo khung, nước kèm, thành viên — quà chào mừng, mã đánh giá, giới thiệu, điểm; nhân viên qua Clerk.

const FRI = "2026-11-06" as ISODate;
const at = (hhmm: string) => vnInstant(FRI, hhmm);
const NOW = at("09:00");
const db = getDb();
let catalog: Catalog;
const OWNER = { id: 0, name: "Chủ", roles: ["owner" as const] };
const KITCHEN = ["owner" as const];

async function reset() {
  await db.delete(t.vouchers);
  await db.delete(t.pointMoves);
  await db.delete(t.orders);
  await db.delete(t.members);
  await db.delete(t.customers);
  await db.delete(t.rateLimits);
  await db.update(t.batches).set({ usedPan: 0, usedBbq: 0, status: "open" });
  await db.update(t.serviceDays).set({ orderSeq: 0, status: "open" });
}

const batch = async (segment: "pizza" | "cafe", hhmm: string) => {
  const [b] = await db
    .select()
    .from(t.batches)
    .where(and(eq(t.batches.serviceDate, FRI), eq(t.batches.segment, segment), eq(t.batches.readyAt, at(hhmm))));
  return b;
};

function order(batchId: number, patch: Partial<PlaceOrderInput> = {}): PlaceOrderInput {
  return {
    idempotencyKey: randomUUID(),
    batchId,
    lines: [{ productId: "pepperoni-pan", qty: 1, addons: [{ productId: "drink-pepsi", qty: 2 }] }],
    customer: { phone: "0912000001", name: "Lê Thu Hà", remember: false },
    fulfillment: { type: "delivery", zoneId: 2, addressText: "Nhà mái tôn xanh, cạnh tạp hoá Cô Ba" },
    paymentMethod: "cod",
    startedAt: 0,
    ...patch,
  };
}
const place = (input: PlaceOrderInput, member: Member | null = null, now = NOW) =>
  placeOrderCore(input, input.customer.phone, { now, catalog, db, member });
const complete = async (code: string) => {
  const [o] = await db.select().from(t.orders).where(eq(t.orders.code, code));
  for (const to of ["confirmed", "baking", "ready", "delivering", "completed"] as const) {
    await advanceOrdersCore([o.id], to, { actor: { id: 1, roles: KITCHEN }, now: at("19:30"), db });
  }
  return o;
};

beforeAll(async () => {
  await seed(db, at("08:00"));
  catalog = await loadCatalog(db);
});
beforeEach(reset);
afterAll(async () => {
  await reset();
  await db.delete(t.stockMoves); // "Ra lò" trừ kho — không để lại cho metrics.int
  await db.delete(t.staff);
  await db.delete(t.serviceDays).where(eq(t.serviceDays.date, FRI));
  await closeDb();
});

describe("cà phê ship & nước kèm", () => {
  it("snapshot có khung cà phê riêng; pizza không lẫn khung cà phê", async () => {
    const snap = await getOvenSnapshot(NOW, db);
    expect(snap.cafe[0].slots.map((s) => [s.readyLabel, s.level])).toEqual([
      ["08:00–10:30", "plenty"],
      ["13:30–15:30", "plenty"],
    ]);
    expect(snap.days[0].slots.map((s) => s.readyLabel)).toEqual(["17:00", "18:00", "19:00"]);
  });

  it("đơn cà phê vào khung cà phê, không tốn khay; không vào được mẻ pizza", async () => {
    const cafe = await batch("cafe", "10:30");
    const lines = [{ productId: "cafe-sua-da", qty: 2 }];
    const { result } = await place(order(cafe.id, { lines }));
    expect(result).toMatchObject({ ok: true, readyLabel: "08:00–10:30", etaLabel: "trong khung 08:00–10:30", total: 60_000 });
    const pizza = await batch("pizza", "17:00");
    expect((await place(order(pizza.id, { lines }))).result).toMatchObject({ ok: false });
    expect((await place(order(cafe.id))).result).toMatchObject({ ok: false }); // pizza không vào khung cà phê
  });

  it("nước lon gắn vào pizza theo giá kèm; mua riêng bị từ chối", async () => {
    const b = await batch("pizza", "17:00");
    expect((await place(order(b.id))).result).toMatchObject({ ok: true, total: 159_000 + 20_000 + 10_000 });
    expect((await place(order(b.id, { lines: [{ productId: "drink-pepsi", qty: 1 }] }))).result).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("thành viên & mã ưu đãi", () => {
  const profile = (n: number) => ({ clerkUserId: `user_test${n}`, name: `Khách ${n}`, email: null });

  it("tạo thành viên một lần, kèm quà chào mừng chỉ cho đơn đầu tiên của SĐT", async () => {
    const [m1, m2] = await Promise.all([ensureMember(profile(1), NOW), ensureMember(profile(1), NOW)]);
    expect(m1.id).toBe(m2.id);
    const [welcome] = await db.select().from(t.vouchers).where(eq(t.vouchers.memberId, m1.id));
    expect(welcome).toMatchObject({ kind: "welcome", amount: 15_000 });

    const b = await batch("pizza", "17:00");
    const ok = await place(order(b.id, { promoCode: welcome.code.toLowerCase() }), m1);
    expect(ok.result).toMatchObject({ ok: true, discount: 15_000, total: 189_000 - 15_000, points: 17 });
    // Mã đã dùng
    const again = await place(order(b.id, { promoCode: welcome.code, customer: { phone: "0912000002", name: "Lê Thu Hà", remember: false } }), m1);
    expect(again.result).toMatchObject({ ok: false, reason: "promo", promo: "used" });
  });

  it("huỷ đơn → trả mã; người khác không dùng được mã của mình", async () => {
    const m = await ensureMember(profile(2), NOW);
    const [w] = await db.select().from(t.vouchers).where(eq(t.vouchers.memberId, m.id));
    const b = await batch("pizza", "17:00");
    expect((await place(order(b.id, { promoCode: w.code }), null)).result).toMatchObject({ ok: false, promo: "not_yours" });
    const { result } = await place(order(b.id, { promoCode: w.code }), m);
    if (!result.ok) throw new Error(JSON.stringify(result));
    await cancelOrderByTokenCore(result.trackingPath.slice(3), { now: NOW, db });
    const [back] = await db.select().from(t.vouchers).where(eq(t.vouchers.id, w.id));
    expect(back.usedOrderId).toBeNull();
  });

  it("hoàn tất → cộng điểm một lần; đổi 50 điểm → mã 20.000đ, không đổi quá số dư", async () => {
    const m = await ensureMember(profile(3), NOW);
    const b = await batch("pizza", "19:00");
    const lines = [{ productId: "combo-doi", qty: 2, comboChoices: { pizza: "pepperoni-pan", bbq: "ribs-sv" } }];
    const { result } = await place(order(b.id, { lines }), m);
    expect(result).toMatchObject({ ok: true, total: 588_000 });
    const o = await complete((result as { code: string }).code);
    await advanceOrdersCore([o.id], "completed", { actor: { id: 1, roles: KITCHEN }, now: at("20:00"), db }); // lặp → bỏ qua
    let acc = await loadAccount(m, at("20:00"), db);
    expect(acc.points).toMatchObject({ balance: 58, earned: 58 });
    expect(acc.orders[0]).toMatchObject({ status: "completed", points: 58, segment: "pizza" });

    const [r1, r2] = await Promise.all([redeemPointsCore(m.id, at("20:00"), db), redeemPointsCore(m.id, at("20:00"), db)]);
    expect([r1.ok, r2.ok].sort()).toEqual([false, true]);
    acc = await loadAccount(m, at("20:00"), db);
    expect(acc.points.balance).toBe(8);
    expect(acc.vouchers.find((v) => v.kind === "points")).toMatchObject({ amount: 20_000, usable: true });
  });

  it("mã giới thiệu: bạn mới giảm 20.000đ ở đơn đầu; người giới thiệu nhận mã khi đơn hoàn tất", async () => {
    const ref = await ensureMember(profile(4), NOW);
    const b = await batch("pizza", "18:00");
    const friend = { phone: "0912000009", name: "Bạn Mới", remember: false };
    const own = await resolvePromo(ref.referralCode, { phone: friend.phone, member: ref, subtotal: 189_000, now: NOW }, db);
    expect(own).toMatchObject({ ok: false, reason: "own_code" });

    const { result } = await place(order(b.id, { customer: friend, promoCode: ref.referralCode }));
    expect(result).toMatchObject({ ok: true, discount: 20_000 });
    await complete((result as { code: string }).code);
    const vs = await db.select().from(t.vouchers).where(and(eq(t.vouchers.memberId, ref.id), eq(t.vouchers.kind, "referral")));
    expect(vs).toHaveLength(1);
    // Không phải đơn đầu nữa
    expect((await place(order(b.id, { customer: friend, promoCode: ref.referralCode }))).result).toMatchObject({ promo: "first_order_only" });
  });

  it("đánh giá món sau khi hoàn tất → một mã cảm ơn gắn SĐT, dùng được ở đơn sau (khách vãng lai)", async () => {
    const b = await batch("pizza", "17:00");
    const { result } = await place(order(b.id));
    if (!result.ok) throw new Error();
    const o = await complete(result.code);
    const fb = { ratings: { "pepperoni-pan": 3 as const }, tags: {}, comment: "" };
    const r1 = await submitFeedbackCore(o.trackingToken, fb, { now: at("20:00"), db });
    const r2 = await submitFeedbackCore(o.trackingToken, fb, { now: at("20:05"), db });
    if (!r1.ok || !r2.ok) throw new Error();
    expect(r1.voucher).toMatch(/^TH/);
    expect(r2.voucher).toBe(r1.voucher);
    const next = await place(order(b.id, { promoCode: r1.voucher! }), null, at("10:00"));
    expect(next.result).toMatchObject({ ok: true, discount: 10_000 });
  });
});

describe("nhân viên đăng ký qua Clerk", () => {
  it("chờ duyệt → không đăng nhập PIN được; quản lý không duyệt được vai quản lý, chủ quán thì được", async () => {
    await db.delete(t.staff);
    const [owner] = await db.insert(t.staff).values({ name: "Chủ", roles: ["owner"], pinHash: "x" }).returning();
    const [mgr] = await db.insert(t.staff).values({ name: "Quản lý", roles: ["manager"], pinHash: "x" }).returning();
    expect(await requestStaffAccessCore({ clerkUserId: "user_a", name: "Bếp A", roles: ["kitchen"], pin: "111111" }, NOW, db)).toEqual({ ok: true });
    expect(await requestStaffAccessCore({ clerkUserId: "user_b", name: "Lan", roles: ["manager"], pin: "222222" }, NOW, db)).toEqual({ ok: true });
    expect(await requestStaffAccessCore({ clerkUserId: "user_a", name: "Bếp A2", roles: ["kitchen"], pin: "111111" }, NOW, db)).toMatchObject({ reason: "duplicate" });
    const [a] = await db.select().from(t.staff).where(eq(t.staff.clerkUserId, "user_a"));
    const [lan] = await db.select().from(t.staff).where(eq(t.staff.clerkUserId, "user_b"));
    expect(await verifyStaffPin(a.id, "111111", db)).toBeNull();

    const asMgr = { actor: { id: mgr.id, name: mgr.name, roles: mgr.roles }, now: NOW, db };
    expect(await reviewStaffRequestCore({ staffId: lan.id, decision: "approve", roles: ["manager"] }, asMgr)).toMatchObject({ reason: "forbidden" });
    expect(await reviewStaffRequestCore({ staffId: lan.id, decision: "reject", roles: [] }, asMgr)).toMatchObject({ reason: "forbidden" });
    expect(await reviewStaffRequestCore({ staffId: a.id, decision: "approve", roles: ["kitchen", "shipper"] }, asMgr)).toEqual({ ok: true });
    expect(await verifyStaffPin(a.id, "111111", db)).toMatchObject({ roles: ["kitchen", "shipper"] });

    const asOwner = { actor: { ...OWNER, id: owner.id }, now: NOW, db };
    expect(await reviewStaffRequestCore({ staffId: lan.id, decision: "approve", roles: ["manager"] }, asOwner)).toEqual({ ok: true });
  });
});
