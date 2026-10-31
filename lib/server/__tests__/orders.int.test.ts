import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/domain/types";
import { vnInstant, type ISODate } from "@/lib/domain/time";
import type { PlaceOrderInput } from "@/lib/order-contract";
import { signAddress } from "@/lib/server/customer-cookie";
import { closeDb, getDb } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { seed } from "@/lib/server/db/seed";
import { loadCatalog, type Catalog } from "@/lib/server/dal/catalog";
import { lookupCustomer } from "@/lib/server/dal/customers";
import { cancelOrderByTokenCore, getOrderView, placeOrderCore } from "@/lib/server/dal/orders";
import { rateLimit } from "@/lib/server/rate-limit";

// placeOrder thật (§8.1, §14): giữ suất, idempotency, đua tranh, huỷ trả suất đúng một lần, quyền riêng tư khi tra SĐT.
// Thứ Sáu 06/11/2026 — mẻ 17/18/19h, chốt 15:30, mỗi mẻ 4 khay + 4 BBQ.

const FRI = "2026-11-06" as ISODate;
const at = (date: ISODate, hhmm: string) => vnInstant(date, hhmm);
const NOW = at(FRI, "10:00");
const db = getDb();
let catalog: Catalog;
const batchAt = async (hhmm: string, date = FRI) => {
  const [b] = await db
    .select()
    .from(t.batches)
    .where(and(eq(t.batches.serviceDate, date), eq(t.batches.readyAt, at(date, hhmm))));
  return b;
};

async function reset() {
  await db.delete(t.orders);
  await db.delete(t.customers);
  await db.delete(t.rateLimits);
  await db.update(t.batches).set({ usedPan: 0, usedBbq: 0, status: "open" });
  await db.update(t.serviceDays).set({ orderSeq: 0, status: "open" });
}

let phoneN = 0;
const nextPhone = () => `09123${String(10000 + phoneN++).slice(-5)}`;

function order(batchId: number, patch: Partial<PlaceOrderInput> = {}): PlaceOrderInput {
  return {
    idempotencyKey: randomUUID(),
    batchId,
    lines: [{ productId: "pepperoni-pan", qty: 1, addons: [{ productId: "sauce-garlic-butter", qty: 1 }] }],
    customer: { phone: "0912345678", name: "Nguyễn Văn Tuấn", remember: false },
    fulfillment: { type: "delivery", zoneId: 2, addressText: "Nhà mái tôn xanh, cạnh tạp hoá Cô Ba" },
    paymentMethod: "cod",
    startedAt: 0,
    ...patch,
  };
}

const place = (input: PlaceOrderInput, now = NOW) =>
  placeOrderCore(input, input.customer.phone, { now, catalog, db });

beforeAll(async () => {
  await seed(db, at(FRI, "09:00"));
  catalog = await loadCatalog(db);
});
beforeEach(reset);
afterAll(async () => {
  await reset();
  // Bỏ ngày Thứ Sáu đã tạo để db.int.test (đếm service_days) không phụ thuộc thứ tự chạy file.
  await db.delete(t.serviceDays).where(eq(t.serviceDays.date, FRI));
  await closeDb();
});

describe("placeOrder", () => {
  it("ghi đơn, dòng món (add-on gắn món cha), sự kiện và giữ suất", async () => {
    const b = await batchAt("17:00");
    const { result, created } = await place(order(b.id));
    expect(result).toMatchObject({
      ok: true,
      code: "TH-0611-01",
      seq: 1,
      readyLabel: "17:00",
      dayLabel: "Tối nay",
      etaLabel: "khoảng 17:00–17:20",
      cutoffLabel: "15:30",
      total: 169_000 + 10_000,
      status: "placed",
      payment: { method: "cod" },
    });
    if (!result.ok) throw new Error();
    expect(result.trackingPath).toMatch(/^\/o\/[\w-]{22}$/);
    expect(created?.telegram[0]).toContain("🆕 #1 · Mẻ 17:00 · Nguyễn Văn Tuấn 0912 345 678 · Khu phố 2");
    expect(created?.telegram[0]).toContain("⚠ Khách mới — gọi xác nhận");

    const [o] = await db.select().from(t.orders);
    expect(o).toMatchObject({ panUnits: 1, bbqUnits: 0, subtotal: 169_000, shipFee: 10_000, customerPhone: "0912345678" });
    const items = await db.select().from(t.orderItems).where(eq(t.orderItems.orderId, o.id)).orderBy(t.orderItems.id);
    expect(items.map((i) => [i.productId, i.parentItemId === null])).toEqual([
      ["pepperoni-pan", true],
      ["sauce-garlic-butter", false],
    ]);
    expect(items[1].parentItemId).toBe(items[0].id);
    expect(await db.$count(t.orderEvents, eq(t.orderEvents.orderId, o.id))).toBe(1);
    expect((await batchAt("17:00")).usedPan).toBe(1);
  });

  it("nhận tại Rêu: free ship, có quà; combo tiêu cả khay lẫn BBQ", async () => {
    const b = await batchAt("18:00");
    const { result } = await place(
      order(b.id, {
        lines: [{ productId: "combo-doi", qty: 2, comboChoices: { pizza: "pepperoni-pan", bbq: "ribs-sv" } }],
        fulfillment: { type: "pickup", pickupPointId: 1 },
        paymentMethod: "transfer",
      }),
    );
    expect(result).toMatchObject({ ok: true, total: 578_000, etaLabel: "18:00 tại Cà phê Rêu", payment: { method: "transfer", memo: "TH061101", amount: 578_000 } });
    const items = await db.select().from(t.orderItems);
    expect(items.find((i) => i.isGift)?.productId).toBe("sauce-garlic-butter");
    expect(await batchAt("18:00")).toMatchObject({ usedPan: 2, usedBbq: 2 });
  });

  it("idempotency: gửi lại cùng khoá → cùng đơn, không giữ suất hai lần", async () => {
    const b = await batchAt("17:00");
    const input = order(b.id);
    const first = await place(input);
    const again = await place(input);
    const parallel = await Promise.all([place(input), place(input)]);
    expect(again.result).toEqual(first.result);
    expect(again.created).toBeUndefined();
    for (const p of parallel) expect(p.result).toEqual(first.result);
    expect(await db.$count(t.orders)).toBe(1);
    expect((await batchAt("17:00")).usedPan).toBe(1);
  });

  it("đua tranh: 10 đơn song song vào mẻ còn 3 suất → đúng 3 thành công", async () => {
    const b = await batchAt("18:00");
    await db.update(t.batches).set({ usedPan: 1 }).where(eq(t.batches.id, b.id));
    const results = await Promise.all(
      Array.from({ length: 10 }, () => place(order(b.id, { customer: { phone: nextPhone(), name: "Khách", remember: false } }))),
    );
    const ok = results.filter((r) => r.result.ok);
    expect(ok).toHaveLength(3);
    const seqs = ok.map((r) => (r.result.ok ? r.result.seq : 0)).sort();
    expect(new Set(seqs).size).toBe(3);
    for (const r of results.filter((x) => !x.result.ok)) {
      expect(r.result).toMatchObject({ ok: false, reason: "slot_full" });
      if (r.result.ok || r.result.reason !== "slot_full") throw new Error();
      expect(r.result.alternatives.map((s) => s.batchId)).not.toContain(b.id);
      expect(r.result.alternatives[0].readyLabel).toBe("17:00");
    }
    const after = await batchAt("18:00");
    expect(after.usedPan).toBe(4);
    // Bất biến §6.3-1: used = Σ units của đơn chưa huỷ (+1 khay đặt tay ở trên).
    const [{ sum }] = await db.execute<{ sum: number }>(sql`SELECT coalesce(sum(pan_units), 0)::int AS sum FROM orders WHERE batch_id = ${b.id} AND status <> 'cancelled'`);
    expect(sum + 1).toBe(after.usedPan);
    // Có thông báo "sắp kín lò" đúng một lần (lúc còn 1 khay).
    expect(ok.flatMap((r) => r.created!.telegram).filter((m) => m.startsWith("🔥"))).toHaveLength(1);
  });

  it("sau giờ chốt → cutoff_passed kèm mẻ ngày sau; ngày tạm ngưng → paused", async () => {
    const b = await batchAt("17:00");
    const late = await place(order(b.id), at(FRI, "15:30"));
    expect(late.result).toMatchObject({ ok: false, reason: "cutoff_passed" });
    if (late.result.ok || late.result.reason !== "cutoff_passed") throw new Error();
    expect(late.result.alternatives[0].date).toBe("2026-11-07");

    await db.update(t.serviceDays).set({ status: "paused" }).where(eq(t.serviceDays.date, FRI));
    expect((await place(order(b.id))).result).toEqual({ ok: false, reason: "paused" });
    expect(await db.$count(t.orders)).toBe(0);
  });

  it("khách quen tự xác nhận; khách từng bom hàng phải chuyển khoản; khách bị chặn → contact_us", async () => {
    const b = await batchAt("19:00");
    await db.insert(t.customers).values([
      { phone: "0987000001", name: "Lan", completedCount: 2 },
      { phone: "0987000002", name: "Hùng", completedCount: 1, noShowCount: 1 },
      { phone: "0987000003", name: "Bom", isBlocked: true },
    ]);
    const regular = await place(order(b.id, { customer: { phone: "0987000001", name: "Lan", remember: false } }));
    expect(regular.result).toMatchObject({ ok: true, status: "confirmed" });
    expect(regular.created?.telegram[0]).not.toContain("⚠");
    expect(await db.$count(t.orderEvents)).toBe(2);

    const risky = order(b.id, { customer: { phone: "0987000002", name: "Hùng", remember: false } });
    expect((await place(risky)).result).toEqual({ ok: false, reason: "prepay_required" });
    expect((await place({ ...risky, paymentMethod: "transfer" })).result).toMatchObject({ ok: true, status: "placed" });

    const blocked = await place(order(b.id, { customer: { phone: "0987000003", name: "Bom", remember: false } }));
    expect(blocked.result).toEqual({ ok: false, reason: "contact_us" });
  });

  it("món hết / khu vực lạ / thiếu địa chỉ", async () => {
    const b = await batchAt("17:00");
    expect((await place(order(b.id, { lines: [{ productId: "khong-co", qty: 1 }] }))).result).toEqual({
      ok: false,
      reason: "unavailable",
      productIds: ["khong-co"],
    });
    const soldOut = { ...catalog, products: catalog.products.map((p) => (p.id === "pepperoni-pan" ? { ...p, isAvailable: false } : p)) };
    expect((await placeOrderCore(order(b.id), "0912345678", { now: NOW, catalog: soldOut, db })).result).toMatchObject({ reason: "unavailable" });
    expect((await place(order(b.id, { fulfillment: { type: "delivery", zoneId: 99, addressText: "đâu đó rất xa" } }))).result).toMatchObject({
      fieldErrors: { zone: "zoneRequired" },
    });
    expect((await place(order(b.id, { fulfillment: { type: "delivery", zoneId: 2, savedAddressToken: "giả.mạo" } }))).result).toMatchObject({
      fieldErrors: { address: "addressShort" },
    });
    expect(await db.$count(t.orders)).toBe(0);
  });
});

describe("cancelOrderByToken", () => {
  it("trả suất đúng một lần; sau giờ chốt → too_late", async () => {
    const b = await batchAt("17:00");
    const { result } = await place(order(b.id, { lines: [{ productId: "combo-doi", qty: 1, comboChoices: { pizza: "pepperoni-pan", bbq: "ribs-sv" } }] }));
    if (!result.ok) throw new Error();
    const token = result.trackingPath.slice(3);
    expect(await batchAt("17:00")).toMatchObject({ usedPan: 1, usedBbq: 1 });

    expect(await cancelOrderByTokenCore(token, { now: at(FRI, "15:31"), db })).toEqual({ ok: false, reason: "too_late" });
    const [first, second] = await Promise.all([
      cancelOrderByTokenCore(token, { now: NOW, reason: "đổi ý", db }),
      cancelOrderByTokenCore(token, { now: NOW, reason: "đổi ý", db }),
    ]);
    const telegrams = [first, second].map((r) => (r.ok ? r.telegram : "x"));
    expect(telegrams.filter((m) => m === "❌ #1 huỷ bởi khách · trả 2 suất mẻ 17:00")).toHaveLength(1);
    expect(telegrams.filter((m) => m === null)).toHaveLength(1);
    expect(await batchAt("17:00")).toMatchObject({ usedPan: 0, usedBbq: 0 });
    const [o] = await db.select().from(t.orders);
    expect(o).toMatchObject({ status: "cancelled", cancelReason: "đổi ý" });

    expect(await cancelOrderByTokenCore("A".repeat(22), { now: NOW, db })).toEqual({ ok: false, reason: "not_found" });
  });

  it("đơn đã vào lò → too_late, không trả suất", async () => {
    const b = await batchAt("17:00");
    const { result } = await place(order(b.id));
    if (!result.ok) throw new Error();
    await db.update(t.orders).set({ status: "baking" });
    expect(await cancelOrderByTokenCore(result.trackingPath.slice(3), { now: NOW, db })).toEqual({ ok: false, reason: "too_late" });
    expect((await batchAt("17:00")).usedPan).toBe(1);
  });
});

describe("lookupCustomer — quyền riêng tư (§7.7)", () => {
  const payment = DEFAULT_SETTINGS.payment;
  const address = "Nhà mái tôn xanh, cạnh tạp hoá Cô Ba";

  it("SĐT mới → new; thiết bị lạ → chỉ tên gọi + khu vực, KHÔNG lộ mô tả nhà", async () => {
    expect(await lookupCustomer("0912345678", { rememberedId: null, payment, now: NOW, db })).toEqual({ status: "new" });
    const b = await batchAt("17:00");
    await place(order(b.id, { fulfillment: { type: "delivery", zoneId: 2, addressText: address, lat: 15.7, lng: 108.3 } }));

    const res = await lookupCustomer("0912345678", { rememberedId: null, payment, now: NOW, db });
    expect(res).toMatchObject({ status: "known", greetingName: "Tuấn", zoneId: 2, zoneName: "Khu phố 2", requiresPrepay: false });
    const json = JSON.stringify(res);
    for (const secret of ["tôn xanh", "Nguyễn", "15.7", "108.3"]) expect(json).not.toContain(secret);

    // Cookie của người khác không mở được dữ liệu đầy đủ.
    const other = await lookupCustomer("0912345678", { rememberedId: randomUUID(), payment, now: NOW, db });
    expect(other.status).toBe("known");
  });

  it("dùng savedAddressToken: server tự tra địa chỉ thật; token của khách khác/hết hạn bị từ chối", async () => {
    const b = await batchAt("17:00");
    await place(order(b.id, { fulfillment: { type: "delivery", zoneId: 2, addressText: address } }));
    const res = await lookupCustomer("0912345678", { rememberedId: null, payment, now: NOW, db });
    if (res.status !== "known" || !res.savedAddressToken) throw new Error();

    const reuse = await place(order(b.id, { fulfillment: { type: "delivery", zoneId: 2, savedAddressToken: res.savedAddressToken } }));
    expect(reuse.result.ok).toBe(true);
    expect((await db.select({ a: t.orders.addressText }).from(t.orders)).map((r) => r.a)).toEqual([address, address]);

    const stolen = order(b.id, {
      customer: { phone: "0987654321", name: "Kẻ lạ", remember: false },
      fulfillment: { type: "delivery", zoneId: 2, savedAddressToken: res.savedAddressToken },
    });
    expect((await place(stolen)).result).toMatchObject({ ok: false, reason: "invalid" });
    const expired = order(b.id, { fulfillment: { type: "delivery", zoneId: 2, savedAddressToken: res.savedAddressToken } });
    expect((await place(expired, new Date(NOW.getTime() + 31 * 60_000))).result).toMatchObject({ ok: false, reason: "invalid" });
    // Token sai chữ ký.
    const [c] = await db.select().from(t.customers);
    const forged = signAddress(c.id, randomUUID(), NOW).replace(/.$/, (ch) => (ch === "A" ? "B" : "A"));
    expect((await place(order(b.id, { fulfillment: { type: "delivery", zoneId: 2, savedAddressToken: forged } }))).result).toMatchObject({ reason: "invalid" });
  });

  it("thiết bị có cookie ghi nhớ của chính khách → tự điền đầy đủ", async () => {
    const b = await batchAt("17:00");
    const { created } = await place(
      order(b.id, {
        customer: { phone: "0912345678", name: "Nguyễn Văn Tuấn", remember: true },
        fulfillment: { type: "delivery", zoneId: 5, addressText: address, lat: 15.7, lng: 108.3 },
      }),
    );
    const res = await lookupCustomer("0912345678", { rememberedId: created!.customerId, payment, now: NOW, db });
    expect(res).toEqual({ status: "self", name: "Nguyễn Văn Tuấn", zoneId: 5, addressText: address, lat: 15.7, lng: 108.3, requiresPrepay: false });
    expect(await db.$count(t.addresses)).toBe(1);
  });
});

describe("getOrderView", () => {
  it("biên nhận theo token; token lạ → null", async () => {
    const b = await batchAt("17:00");
    const { result } = await place(order(b.id));
    if (!result.ok) throw new Error();
    const view = await getOrderView(result.trackingPath.slice(3), NOW, db);
    expect(view).toMatchObject({
      code: "TH-0611-01",
      stage: "received",
      canCancel: true,
      zoneName: "Khu phố 2",
      ovenLabel: "16:40",
      etaLabel: "17:00–17:20",
      total: 179_000,
      reorder: [{ productId: "pepperoni-pan", qty: 1, addons: [{ productId: "sauce-garlic-butter", qty: 1 }] }],
    });
    expect(view?.items).toHaveLength(2);
    expect(await getOrderView("A".repeat(22), NOW, db)).toBeNull();
    expect(await getOrderView("ngắn", NOW, db)).toBeNull();
  });
});

describe("rateLimit", () => {
  it("cửa sổ cố định: vượt giới hạn → false, sang cửa sổ mới → reset", async () => {
    const rule = [{ key: "test:ip:1", limit: 3, windowSec: 600 }];
    const r = [];
    for (let i = 0; i < 4; i++) r.push(await rateLimit(rule, NOW, db));
    expect(r).toEqual([true, true, true, false]);
    expect(await rateLimit(rule, new Date(NOW.getTime() + 600_000), db)).toBe(true);
    const parallel = await Promise.all(Array.from({ length: 10 }, () => rateLimit([{ key: "test:ip:2", limit: 5, windowSec: 600 }], NOW, db)));
    expect(parallel.filter(Boolean)).toHaveLength(5);
  });
});
