import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HOLD_EXPIRED_REASON } from "@/lib/domain/hold";
import { transferMemo } from "@/lib/domain/order-code";
import type { Role } from "@/lib/domain/roles";
import { vnInstant, type ISODate } from "@/lib/domain/time";
import type { PlaceOrderInput } from "@/lib/order-contract";
import { SepayPayload } from "@/lib/payments";
import { closeDb, getDb } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { seed } from "@/lib/server/db/seed";
import { advanceOrdersCore } from "@/lib/server/dal/admin";
import { loadCatalog, type Catalog } from "@/lib/server/dal/catalog";
import { productFeedback, submitFeedbackCore } from "@/lib/server/dal/feedback";
import { releaseExpiredHolds } from "@/lib/server/dal/holds";
import { loadKitchenDay } from "@/lib/server/dal/kitchen";
import { getOrderView, placeOrderCore } from "@/lib/server/dal/orders";
import { cancelWithRefundCore, loadHandovers, loadOvenLock, pauseOvenCore, recordHandoverCore, resumeOvenCore, type SaleActor } from "@/lib/server/dal/sale-day";
import { getOvenSnapshot } from "@/lib/server/dal/schedule";
import { upsertStaff } from "@/lib/server/dal/staff";
import { handleTelegramUpdate, type TelegramUpdate } from "@/lib/server/ops/telegram-bot";
import { recordSepayCore } from "@/lib/server/payments/sepay";

// Gói "Ngày bán" (§18, M9.5). Thứ Sáu 27/11/2026 — mẻ 17/18/19h, chốt 15:30, 4 khay + 4 BBQ mỗi mẻ (file khác dùng ngày khác).

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const FRI = "2026-11-27" as ISODate;
const at = (hhmm: string, day: ISODate = FRI) => vnInstant(day, hhmm);
const NOW = at("10:00");
const plus = (min: number, from = NOW) => new Date(from.getTime() + min * 60_000);
const db = getDb();
let catalog: Catalog;
let n = 0;
let txn = 50_000;
const people: Record<"owner" | "kitchen" | "shipper" | "barista" | "manager", SaleActor> = {} as never;

const batchAt = async (hhmm: string) =>
  (await db.select().from(t.batches).where(and(eq(t.batches.serviceDate, FRI), eq(t.batches.readyAt, at(hhmm)))))[0];
const order = async (id: string) => (await db.select().from(t.orders).where(eq(t.orders.id, id)))[0];

/** `risky` = khách từng bom hàng → bắt buộc trả trước → đơn CK có hạn giữ suất. */
async function place(opts: { risky?: boolean; pay?: "cod" | "transfer"; hhmm?: string; now?: Date; pickup?: boolean } = {}) {
  const phone = `09555${String(10000 + n++).slice(-5)}`;
  if (opts.risky) await db.insert(t.customers).values({ phone, name: "Khách rủi ro", noShowCount: 1, completedCount: 2 });
  const b = await batchAt(opts.hhmm ?? "18:00");
  const input: PlaceOrderInput = {
    idempotencyKey: randomUUID(),
    batchId: b.id,
    lines: [{ productId: "pepperoni-pan", qty: 1, addons: [{ productId: "sauce-garlic-butter", qty: 2 }] }],
    customer: { phone, name: "Khách", remember: false },
    fulfillment: opts.pickup ? { type: "pickup", pickupPointId: 1 } : { type: "delivery", zoneId: 2, addressText: "Nhà mái tôn xanh cạnh tạp hoá" },
    paymentMethod: opts.pay ?? "transfer",
    startedAt: 0,
  };
  const out = await placeOrderCore(input, phone, { now: opts.now ?? NOW, catalog, db });
  return out;
}
async function placed(opts: Parameters<typeof place>[0] = {}) {
  const { result } = await place(opts);
  if (!result.ok) throw new Error(result.reason);
  return (await db.select().from(t.orders).where(eq(t.orders.code, result.code)))[0];
}

const sepay = (o: t.Order, amount = o.total) =>
  SepayPayload.parse({
    id: txn++,
    gateway: "TPBank",
    transactionDate: "2026-11-27 10:20:00",
    accountNumber: "1012345678",
    code: null,
    content: `CK ${transferMemo(o.serviceDate, o.seq)}`,
    transferType: "in",
    transferAmount: amount,
    referenceCode: `FT${txn}`,
    description: "BankAPINotify",
  });

const orderActor = (a: SaleActor, roles: ("owner" | "kitchen" | "shipper")[]) => ({ id: a.id, roles });

async function deliver(ids: string[], shipper: SaleActor) {
  for (const to of ["confirmed", "baking", "ready"] as const) await advanceOrdersCore(ids, to, { actor: orderActor(people.owner, ["owner"]), now: NOW, db });
  await advanceOrdersCore(ids, "delivering", { actor: orderActor(shipper, ["shipper"]), now: NOW, db });
  await advanceOrdersCore(ids, "completed", { actor: orderActor(shipper, ["shipper"]), now: NOW, db });
}

async function reset() {
  await db.delete(t.cashHandovers);
  await db.delete(t.feedback);
  await db.delete(t.orders);
  await db.delete(t.customers);
  await db.delete(t.payments);
  await db.delete(t.rateLimits);
  await db.delete(t.telegramUpdates);
  await db.update(t.batches).set({ usedPan: 0, usedBbq: 0, status: "open", capPan: 4, capBbq: 4 });
  await db.update(t.serviceDays).set({ orderSeq: 0, status: "open", pauseMessage: null });
}

beforeAll(async () => {
  await seed(db, at("09:00"));
  catalog = await loadCatalog(db);
  await db.delete(t.cashHandovers);
  await db.delete(t.staff);
  const mk = async (name: string, roles: Role[], tg: number) => {
    const id = await upsertStaff({ name, roles, pin: "123456" }, db);
    await db.update(t.staff).set({ telegramUserId: tg }).where(eq(t.staff.id, id));
    return { id, name, roles };
  };
  people.owner = await mk("Chủ", ["owner"], 7001);
  people.kitchen = await mk("Bếp Vy", ["kitchen"], 7002);
  people.shipper = await mk("Ship Tài", ["shipper"], 7003);
  people.barista = await mk("Pha chế Lan", ["barista"], 7004);
  people.manager = await mk("Quản lý Minh", ["manager", "shipper"], 7005);
});
beforeEach(reset);
afterAll(async () => {
  await reset();
  await db.delete(t.opsEvents);
  await db.delete(t.staff);
  await db.delete(t.serviceDays).where(gte(t.serviceDays.date, FRI));
  await closeDb();
});

describe("giữ suất có hạn (§18.2)", () => {
  it("chỉ đơn bắt buộc trả trước có hạn 15′, không tự xác nhận dù khách quen; Telegram ghi giờ hết hạn", async () => {
    const { result, created } = await place({ risky: true });
    expect(result).toMatchObject({ ok: true, status: "placed", holdUntil: plus(15).toISOString() });
    expect(created?.telegram[0]).toContain("⏳ Giữ suất đến 10:15");
    // CK tự nguyện & COD không có hạn.
    expect((await place()).result).toMatchObject({ ok: true, holdUntil: null });
    expect((await place({ pay: "cod" })).result).toMatchObject({ ok: true, holdUntil: null });
    expect((await place({ risky: true, pay: "cod" })).result).toEqual({ ok: false, reason: "prepay_required" });
  });

  it("hết hạn: nhiều request song song trả suất đúng một lần; sự kiện actor system", async () => {
    const a = await placed({ risky: true });
    const b = await placed({ risky: true });
    expect((await batchAt("18:00")).usedPan).toBe(2);
    expect(await releaseExpiredHolds(plus(15), db)).toEqual([]); // đúng mốc chưa hết
    const runs = await Promise.all(Array.from({ length: 6 }, () => releaseExpiredHolds(plus(16), db)));
    expect(runs.flat().map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
    expect((await batchAt("18:00")).usedPan).toBe(0);
    expect(await order(a.id)).toMatchObject({ status: "cancelled", cancelReason: HOLD_EXPIRED_REASON });
    const events = await db.select().from(t.orderEvents).where(and(inArray(t.orderEvents.orderId, [a.id, b.id]), eq(t.orderEvents.type, "cancelled")));
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ actor: "system", data: { from: "placed", reason: "hold_expired" } });
  });

  it("không cần cron: placeOrder & Oven Bar tự trả suất hết hạn; trang đơn hiện đếm ngược rồi 'hết giờ'", async () => {
    const b = await batchAt("18:00");
    await db.update(t.batches).set({ capPan: 1 }).where(eq(t.batches.id, b.id));
    const held = await placed({ risky: true });
    expect((await place({ now: plus(5) })).result).toMatchObject({ ok: false, reason: "slot_full" });

    const view = await getOrderView(held.trackingToken, plus(3), db);
    expect(view).toMatchObject({ holdUntil: plus(15).toISOString(), holdExpired: false });
    expect((await loadKitchenDay(FRI, plus(3), db)).orders[0].holdUntil).toBe(plus(15).toISOString());

    const snap = await getOvenSnapshot(plus(20), db);
    expect(snap.days.flatMap((d) => d.slots).find((s) => s.batchId === b.id)?.remainingPan).toBe(1);
    expect((await place({ now: plus(21) })).result).toMatchObject({ ok: true });
    expect(await getOrderView(held.trackingToken, plus(22), db)).toMatchObject({ status: "cancelled", holdUntil: null, holdExpired: true });
  });

  it("đã trả trong hạn → không bị huỷ", async () => {
    const o = await placed({ risky: true });
    expect(await recordSepayCore(sepay(o), { now: plus(5), db })).toMatchObject({ status: "paid" });
    expect(await releaseExpiredHolds(plus(30), db)).toEqual([]);
    expect(await order(o.id)).toMatchObject({ status: "confirmed", paymentStatus: "paid" });
  });

  it("CK đến sau khi hết hạn: mẻ còn suất → mở lại & xác nhận; hết suất → giữ huỷ, ghi tiền, ⚠ cần hoàn", async () => {
    const a = await placed({ risky: true });
    await releaseExpiredHolds(plus(16), db);
    const late = await recordSepayCore(sepay(a), { now: plus(20), db });
    expect(late).toMatchObject({ status: "late_reopened" });
    if (late.status !== "late_reopened") throw new Error();
    expect(late.telegram).toContain("đã mở lại");
    expect(await order(a.id)).toMatchObject({ status: "confirmed", paymentStatus: "paid", cancelReason: null });
    expect((await batchAt("18:00")).usedPan).toBe(1);

    const b = await batchAt("18:00");
    const c = await placed({ risky: true });
    await releaseExpiredHolds(plus(16), db);
    await db.update(t.batches).set({ capPan: 1 }).where(eq(t.batches.id, b.id)); // mẻ đã kín (đơn a)
    const full = await recordSepayCore(sepay(c), { now: plus(20), db });
    expect(full).toMatchObject({ status: "late_refund" });
    if (full.status !== "late_refund") throw new Error();
    expect(full.telegram).toContain("cần hoàn hoặc chuyển mẻ");
    expect(await order(c.id)).toMatchObject({ status: "cancelled", paymentStatus: "paid" });
    expect((await batchAt("18:00")).usedPan).toBe(1);
    // Hiện ở "Cần hoàn tiền" → ghi hoàn.
    expect((await loadOvenLock(plus(21), db)).refunds.map((r) => r.id)).toEqual([c.id]);
    expect(await cancelWithRefundCore(c.id, { amount: c.total, method: "transfer" }, { actor: people.kitchen, now: plus(30), db })).toMatchObject({ ok: true });
    expect(await order(c.id)).toMatchObject({ status: "cancelled", paymentStatus: "refunded" });
  });
});

describe("khoá lò (§18.1)", () => {
  it("khoá hôm nay → placeOrder trả paused; danh sách đơn bị ảnh hưởng; chỉ owner/manager/kitchen", async () => {
    const cod = await placed({ pay: "cod" });
    const paid = await placed();
    await recordSepayCore(sepay(paid), { now: NOW, db });
    const done = await placed({ pay: "cod", hhmm: "17:00" });
    await deliver([done.id], people.shipper);

    for (const who of [people.shipper, people.barista]) {
      expect(await pauseOvenCore({ reason: "Mất điện", tomorrow: false }, { actor: who, now: NOW, db })).toEqual({ ok: false, reason: "forbidden" });
    }
    const res = await pauseOvenCore({ reason: "Mất điện", tomorrow: true }, { actor: people.kitchen, now: NOW, db });
    expect(res).toMatchObject({ ok: true, dates: [FRI, "2026-11-28"] });
    if (!res.ok) throw new Error();
    expect(res.affected.map((o) => o.id)).toEqual([cod.id, paid.id]);
    expect(res.affected.map((o) => o.paid)).toEqual([0, paid.total]);
    expect(res.telegram).toContain("⛔ KHOÁ LÒ hôm nay + Mai · Mất điện · Bếp Vy");
    expect(res.telegram).toContain(`#${paid.seq} Khách`);
    expect(res.telegram).toContain("→ cần hoàn");
    expect(await db.select().from(t.serviceDays).where(eq(t.serviceDays.date, FRI))).toMatchObject([
      { status: "paused", pauseMessage: "Quán tạm ngưng nhận đơn — Mất điện. Xin lỗi bạn!" },
    ]);
    expect((await place()).result).toEqual({ ok: false, reason: "paused" });
    expect(await loadOvenLock(NOW, db)).toMatchObject({ status: "paused", reason: "Mất điện", tomorrowPaused: true });

    expect(await resumeOvenCore({ actor: people.barista, now: NOW, db })).toEqual({ ok: false, reason: "forbidden" });
    expect(await resumeOvenCore({ actor: people.owner, now: NOW, db })).toMatchObject({ ok: true, dates: [FRI, "2026-11-28"] });
    expect((await place()).result).toMatchObject({ ok: true });
  });

  it("huỷ đơn đã trả: bắt ghi hoàn → refunded + payments âm + order_events; trả suất; trang đơn hiện lời nhắn, ẩn QR", async () => {
    const paid = await placed();
    await recordSepayCore(sepay(paid), { now: NOW, db });
    const cod = await placed({ pay: "cod" });
    await pauseOvenCore({ reason: "Lò gặp sự cố", tomorrow: false }, { actor: people.owner, now: NOW, db });
    const ctx = { actor: people.kitchen, now: plus(5), db };

    expect(await cancelWithRefundCore(paid.id, null, ctx)).toEqual({ ok: false, reason: "refund_required" });
    expect(await cancelWithRefundCore(paid.id, { amount: paid.total + 1, method: "cash" }, ctx)).toEqual({ ok: false, reason: "invalid" });
    expect(await cancelWithRefundCore(cod.id, { amount: 1000, method: "cash" }, ctx)).toEqual({ ok: false, reason: "invalid" });
    expect(await cancelWithRefundCore(paid.id, { amount: paid.total, method: "transfer", note: "TK cũ" }, { ...ctx, actor: people.barista })).toEqual({ ok: false, reason: "forbidden" });
    const r = await cancelWithRefundCore(paid.id, { amount: paid.total, method: "transfer", note: "TK cũ" }, ctx);
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) throw new Error();
    expect(r.telegram).toContain(`💸 #${paid.seq} đã hoàn`);
    expect(await order(paid.id)).toMatchObject({ status: "cancelled", paymentStatus: "refunded", cancelReason: "Quán tạm ngưng: Lò gặp sự cố" });
    const [refund] = await db.select().from(t.payments).where(and(eq(t.payments.orderId, paid.id), eq(t.payments.provider, "refund")));
    expect(refund).toMatchObject({ amount: -paid.total, providerTxnId: `refund:${paid.id}`, memo: "CK · TK cũ" });
    const types = (await db.select().from(t.orderEvents).where(eq(t.orderEvents.orderId, paid.id))).map((e) => e.type);
    expect(types).toContain("refunded");
    // Bấm lại không ghi hoàn đôi.
    expect(await cancelWithRefundCore(paid.id, { amount: paid.total, method: "transfer" }, ctx)).toEqual({ ok: false, reason: "invalid" });

    expect(await cancelWithRefundCore(cod.id, null, ctx)).toMatchObject({ ok: true, telegram: null });
    expect((await batchAt("18:00")).usedPan).toBe(0);
    expect(await getOrderView(cod.trackingToken, plus(6), db)).toMatchObject({ status: "cancelled", pausedReason: "Lò gặp sự cố" });
    expect((await loadOvenLock(plus(6), db)).affected).toEqual([]);
  });

  it("/khoalo, /molo: người lạ & nhân viên không có quyền bị bỏ qua; bếp khoá được", async () => {
    const calls: { method: string; body: Record<string, unknown> }[] = [];
    let u = 0;
    const deps = {
      api: async <T,>(method: string, body: object) => {
        calls.push({ method, body: body as Record<string, unknown> });
        return { message_id: 1 } as T;
      },
      now: NOW,
      db,
      allowedChats: [-100],
      botUsername: "TheHeatBot",
    };
    const msg = (from: number, text: string): TelegramUpdate => ({
      update_id: 900_000 + ++u,
      message: { message_id: u, from: { id: from }, chat: { id: -100, type: "supergroup" }, text },
    });
    const status = async () => (await db.select().from(t.serviceDays).where(eq(t.serviceDays.date, FRI)))[0].status;
    await placed({ pay: "cod" });

    expect(await handleTelegramUpdate(msg(4242, "/khoalo mất điện"), deps)).toBe("ignored");
    expect(await handleTelegramUpdate(msg(7003, "/khoalo mất điện"), deps)).toBe("ignored"); // shipper
    expect(await handleTelegramUpdate(msg(7004, "/khoalo"), deps)).toBe("ignored"); // barista
    expect(await status()).toBe("open");
    expect(calls).toEqual([]);

    expect(await handleTelegramUpdate(msg(7002, "/khoalo@TheHeatBot mất điện cả khu"), deps)).toBe("handled");
    expect(await status()).toBe("paused");
    expect(calls.at(-1)?.body.text).toContain("⛔ KHOÁ LÒ hôm nay · mất điện cả khu · Bếp Vy");
    expect(calls.at(-1)?.body.text).toContain("Đơn bị ảnh hưởng (1)");

    expect(await handleTelegramUpdate(msg(4242, "/molo"), deps)).toBe("ignored");
    expect(await status()).toBe("paused");
    expect(await handleTelegramUpdate(msg(7005, "/molo"), deps)).toBe("handled"); // quản lý
    expect(await status()).toBe("open");
  });
});

describe("bàn giao tiền COD (§18.4)", () => {
  it("theo người bấm Đã giao; người nhận ≠ shipper; lệch → Telegram (⚠ khi vượt ngưỡng); mỗi đơn một lần", async () => {
    const a = await placed({ pay: "cod" });
    const b = await placed({ pay: "cod" });
    const paid = await placed();
    await recordSepayCore(sepay(paid), { now: NOW, db });
    const pickup = await placed({ pay: "cod", pickup: true, hhmm: "17:00" });
    const byManager = await placed({ pay: "cod", hhmm: "17:00" });
    await deliver([a.id, b.id, paid.id], people.shipper);
    await deliver([byManager.id], people.manager);
    await advanceOrdersCore([pickup.id], "confirmed", { actor: orderActor(people.owner, ["owner"]), now: NOW, db });

    const view = await loadHandovers(FRI, db);
    expect(view.pending.map((p) => [p.shipperName, p.orders.map((o) => o.id).sort(), p.expected])).toEqual([
      ["Ship Tài", [a.id, b.id].sort(), a.total + b.total],
      ["Quản lý Minh", [byManager.id], byManager.total],
    ]);

    const input = { date: FRI, shipperId: people.shipper.id, orderIds: [a.id, b.id], received: a.total + b.total - 50_000 };
    expect(await recordHandoverCore(input, { actor: people.shipper, now: NOW, db })).toEqual({ ok: false, reason: "forbidden" });
    expect(await recordHandoverCore({ ...input, shipperId: people.manager.id, orderIds: [byManager.id] }, { actor: people.manager, now: NOW, db })).toEqual({
      ok: false,
      reason: "self_review",
    });
    expect(await recordHandoverCore({ ...input, orderIds: [a.id, paid.id] }, { actor: people.kitchen, now: NOW, db })).toEqual({ ok: false, reason: "invalid" });

    const [x, y] = await Promise.all([
      recordHandoverCore(input, { actor: people.kitchen, now: NOW, db }),
      recordHandoverCore(input, { actor: people.owner, now: NOW, db }),
    ]);
    const ok = [x, y].filter((r) => r.ok);
    expect(ok).toHaveLength(1);
    expect([x, y].find((r) => !r.ok)).toEqual({ ok: false, reason: "duplicate" });
    expect(ok[0]).toMatchObject({ expected: a.total + b.total, received: a.total + b.total - 50_000 });
    if (!ok[0].ok) throw new Error();
    expect(ok[0].telegram).toMatch(/^⚠ Bàn giao COD Ship Tài → .+: 2 đơn · đáng có .+ · thiếu 50\.000đ$/);

    const exact = await recordHandoverCore(
      { date: FRI, shipperId: people.manager.id, orderIds: [byManager.id], received: byManager.total },
      { actor: people.owner, now: NOW, db },
    );
    expect(exact).toMatchObject({ ok: true, telegram: null });
    const after = await loadHandovers(FRI, db);
    expect(after.pending).toEqual([]);
    expect(after.done.map((d) => [d.shipperName, d.orders, d.received - d.expected])).toEqual([
      ["Ship Tài", 2, -50_000],
      ["Quản lý Minh", 1, 0],
    ]);
    expect((await loadKitchenDay(FRI, NOW, db)).handovers.done).toHaveLength(2);
  });

  it("lệch nhỏ trong ngưỡng → ℹ", async () => {
    const a = await placed({ pay: "cod" });
    await deliver([a.id], people.shipper);
    const r = await recordHandoverCore({ date: FRI, shipperId: people.shipper.id, orderIds: [a.id], received: a.total + 5_000 }, { actor: people.kitchen, now: NOW, db });
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) throw new Error();
    expect(r.telegram).toContain("ℹ Bàn giao COD");
    expect(r.telegram).toContain("dư 5.000đ");
  });
});

describe("thẻ nắp hộp trong màn bếp (§18.3)", () => {
  it("THU/CK, add-on, nhận tại Rêu, nhiều hộp", async () => {
    const cod = await placed({ pay: "cod" });
    const paid = await placed();
    await recordSepayCore(sepay(paid), { now: NOW, db });
    const pick = await placed({ pay: "cod", pickup: true });
    const day = await loadKitchenDay(FRI, NOW, db);
    const box = (id: string) => day.orders.find((o) => o.id === id)!.box;
    expect(box(cod.id)).toMatchObject({ code: `${String.fromCodePoint(0x2460 + cod.seq - 1)} T${cod.total / 1000} +2S`, boxes: 1 });
    expect(box(paid.id).parts.slice(1)).toEqual(["CK", "+2S"]);
    // Nhận tại Rêu có quà hũ sốt bơ tỏi → +3S, R ở cuối.
    expect(box(pick.id).parts.slice(1)).toEqual([`T${pick.total / 1000}`, "+3S", "R"]);
  });
});

describe("chấm điểm khẩu vị (§18.5)", () => {
  const input = (ratings: Record<string, number>, tags: Record<string, string[]> = {}, comment = "") => ({ ratings, tags, comment });

  it("chỉ khi completed, trong 7 ngày; một bản mỗi đơn, sửa được trong 24 giờ; Telegram; điểm trung bình", async () => {
    const o = await placed({ pay: "cod" });
    expect(await submitFeedbackCore(o.trackingToken, input({ "pepperoni-pan": 3 }), { now: NOW, db })).toEqual({ ok: false, reason: "closed" });
    expect(await getOrderView(o.trackingToken, NOW, db)).toMatchObject({ feedback: null });
    await deliver([o.id], people.shipper);

    const view = await getOrderView(o.trackingToken, NOW, db);
    expect(view?.feedback).toEqual({ items: [{ productId: "pepperoni-pan", name: "Pan Pizza Pepperoni", kind: "pizza" }], saved: null, editable: true });
    expect(await submitFeedbackCore("x".repeat(22), input({ "pepperoni-pan": 3 }), { now: NOW, db })).toEqual({ ok: false, reason: "not_found" });
    expect(await submitFeedbackCore(o.trackingToken, input({ "ribs-sv": 1 }), { now: NOW, db })).toEqual({ ok: false, reason: "invalid" });

    const first = await submitFeedbackCore(o.trackingToken, input({ "pepperoni-pan": 1 }, { "pepperoni-pan": ["ít dầu", "ngọt hơn"] }, " hơi mặn "), { now: NOW, db });
    expect(first).toEqual({ ok: true, voucher: expect.stringMatching(/^TH/), telegram: `⭐ #${o.seq} Pepperoni 😕 ít dầu — "hơi mặn"` });
    expect(await db.select().from(t.feedback)).toMatchObject([{ ratings: { "pepperoni-pan": 1 }, tags: { "pepperoni-pan": ["ít dầu"] }, comment: "hơi mặn" }]);

    const edit = await submitFeedbackCore(o.trackingToken, input({ "pepperoni-pan": 2 }), { now: plus(60 * 23), db });
    expect(edit).toEqual({ ok: true, voucher: expect.stringMatching(/^TH/), telegram: `⭐ #${o.seq} (sửa) Pepperoni 🙂` });
    expect(await db.$count(t.feedback)).toBe(1);
    expect((await getOrderView(o.trackingToken, plus(60 * 23), db))?.feedback).toMatchObject({ saved: { ratings: { "pepperoni-pan": 2 } }, editable: true });
    expect(await submitFeedbackCore(o.trackingToken, input({ "pepperoni-pan": 3 }), { now: plus(60 * 25), db })).toEqual({ ok: false, reason: "locked" });
    expect((await getOrderView(o.trackingToken, plus(60 * 25), db))?.feedback?.editable).toBe(false);
    expect(await getOrderView(o.trackingToken, at("10:00", "2026-12-05" as ISODate), db)).toMatchObject({ feedback: null });

    expect(await productFeedback("pepperoni-pan", plus(60), db)).toEqual({ average: 2, count: 1, unhappy: 0, tags: [] });
  });

  it("combo tách thành pizza + BBQ đã chọn", async () => {
    const phone = "0955599999";
    const b = await batchAt("19:00");
    const { result } = await placeOrderCore(
      {
        idempotencyKey: randomUUID(),
        batchId: b.id,
        lines: [{ productId: "combo-doi", qty: 1, comboChoices: { pizza: "garlic-cheese-pan", bbq: "ribs-sv" } }],
        customer: { phone, name: "Combo", remember: false },
        fulfillment: { type: "pickup", pickupPointId: 1 },
        paymentMethod: "cod",
        startedAt: 0,
      },
      phone,
      { now: NOW, catalog, db },
    );
    if (!result.ok) throw new Error(result.reason);
    const [o] = await db.select().from(t.orders).where(eq(t.orders.code, result.code));
    for (const to of ["confirmed", "baking", "ready", "completed"] as const) await advanceOrdersCore([o.id], to, { actor: orderActor(people.owner, ["owner"]), now: NOW, db });
    const view = await getOrderView(o.trackingToken, NOW, db);
    expect(view?.feedback?.items.map((i) => [i.productId, i.kind])).toEqual([
      ["garlic-cheese-pan", "pizza"],
      ["ribs-sv", "bbq"],
    ]);
    const r = await submitFeedbackCore(o.trackingToken, input({ "garlic-cheese-pan": 3, "ribs-sv": 1 }, { "ribs-sv": ["ngọt hơn"] }), { now: NOW, db });
    expect(r).toMatchObject({ ok: true, telegram: `⭐ #${o.seq} Phô mai Bơ tỏi 😋 · Sườn heo BBQ Sous-vide 24h 😕 ngọt hơn` });
    expect(await productFeedback("ribs-sv", NOW, db)).toEqual({ average: 1, count: 1, unhappy: 1, tags: [{ tag: "ngọt hơn", n: 1 }] });
  });
});
