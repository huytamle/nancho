import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { vnInstant, type ISODate } from "@/lib/domain/time";
import type { PlaceOrderInput } from "@/lib/order-contract";
import { decrypt, encrypt } from "@/lib/server/auth/session";
import { closeDb, getDb } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { seed } from "@/lib/server/db/seed";
import {
  advanceBatchCore,
  advanceOrdersCore,
  markPaidCore,
  moveOrderCore,
  setDayStatusCore,
  updateBatchCore,
  type StaffActor,
} from "@/lib/server/dal/admin";
import { loadCatalog, type Catalog } from "@/lib/server/dal/catalog";
import { loadKitchenDay, runDaily } from "@/lib/server/dal/kitchen";
import { placeOrderCore } from "@/lib/server/dal/orders";
import { upsertStaff, verifyStaffPin } from "@/lib/server/dal/staff";

// Kitchen Dashboard (§8.2, §10): đổi trạng thái theo canTransition, bộ đếm khách, suất lò, đơn nhanh, cron.
// Thứ Bảy 07/11/2026 (file khác dùng Thứ Sáu) — mẻ 17/18/19h, chốt 15:30, mỗi mẻ 4 khay + 4 BBQ.

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const SAT = "2026-11-07" as ISODate;
const at = (hhmm: string) => vnInstant(SAT, hhmm);
const NOW = at("10:00");
const db = getDb();
let catalog: Catalog;
const OWNER: StaffActor = { id: 1, roles: ["owner"] };
const KITCHEN: StaffActor = { id: 2, roles: ["kitchen"] };
const SHIPPER: StaffActor = { id: 3, roles: ["shipper"] };

const batchAt = async (hhmm: string) => {
  const [b] = await db.select().from(t.batches).where(and(eq(t.batches.serviceDate, SAT), eq(t.batches.readyAt, at(hhmm))));
  return b;
};
const orderById = async (id: string) => (await db.select().from(t.orders).where(eq(t.orders.id, id)))[0];
const customerOf = async (id: string) => {
  const o = await orderById(id);
  return (await db.select().from(t.customers).where(eq(t.customers.id, o.customerId)))[0];
};

let n = 0;
async function place(hhmm: string, patch: Partial<PlaceOrderInput> = {}, now = NOW) {
  const b = await batchAt(hhmm);
  const phone = `09333${String(10000 + n++).slice(-5)}`;
  const input: PlaceOrderInput = {
    idempotencyKey: randomUUID(),
    batchId: b.id,
    lines: [{ productId: "combo-doi", qty: 1, comboChoices: { pizza: "pepperoni-pan", bbq: "ribs-sv" } }],
    customer: { phone, name: "Khách Thử", remember: false },
    fulfillment: { type: "delivery", zoneId: 2, addressText: "Nhà mái tôn xanh cạnh tạp hoá" },
    paymentMethod: "cod",
    startedAt: 0,
    ...patch,
  };
  const { result } = await placeOrderCore(input, phone, { now, catalog, db });
  if (!result.ok) throw new Error(result.reason);
  const [o] = await db.select().from(t.orders).where(eq(t.orders.code, result.code));
  return o;
}

async function reset() {
  await db.delete(t.orders);
  await db.delete(t.customers);
  await db.delete(t.payments);
  await db.update(t.batches).set({ usedPan: 0, usedBbq: 0, status: "open" });
  await db.update(t.serviceDays).set({ orderSeq: 0, status: "open", summarySentAt: null });
}

beforeAll(async () => {
  await seed(db, at("09:00"));
  catalog = await loadCatalog(db);
});
beforeEach(reset);
afterAll(async () => {
  await reset();
  await db.delete(t.staff);
  await db.delete(t.serviceDays).where(eq(t.serviceDays.date, SAT));
  await closeDb();
});

describe("advanceOrders", () => {
  it("đi hết vòng đời; completed/no_show cập nhật bộ đếm khách", async () => {
    const a = await place("17:00");
    const b = await place("17:00");
    for (const to of ["confirmed", "baking", "ready", "delivering"] as const) {
      const r = await advanceOrdersCore([a.id, b.id], to, { actor: OWNER, now: NOW, db });
      expect(r.updated).toHaveLength(2);
    }
    await advanceOrdersCore([a.id], "completed", { actor: SHIPPER, now: NOW, db });
    await advanceOrdersCore([b.id], "no_show", { actor: SHIPPER, now: NOW, db });
    expect(await customerOf(a.id)).toMatchObject({ completedCount: 1, noShowCount: 0 });
    expect(await customerOf(b.id)).toMatchObject({ completedCount: 0, noShowCount: 1 });
    // no_show giữ suất (lò đã dùng).
    expect(await batchAt("17:00")).toMatchObject({ usedPan: 2, usedBbq: 2 });
    const events = await db.select().from(t.orderEvents).where(eq(t.orderEvents.orderId, a.id));
    expect(events.filter((e) => e.actor === "staff:3")).toHaveLength(1);
  });

  it("quyền theo canTransition: bếp không giao, shipper không nướng; lô sai không làm hỏng lô đúng", async () => {
    const a = await place("17:00");
    await advanceOrdersCore([a.id], "confirmed", { actor: OWNER, now: NOW, db });
    expect((await advanceOrdersCore([a.id], "baking", { actor: SHIPPER, now: NOW, db })).skipped).toEqual([{ id: a.id, reason: "forbidden" }]);
    const b = await place("17:00");
    const r = await advanceOrdersCore([a.id, b.id], "baking", { actor: KITCHEN, now: NOW, db });
    expect(r.updated).toEqual([a.id]);
    expect(r.skipped).toEqual([{ id: b.id, reason: "invalid_transition" }]); // b còn "placed"
    await advanceOrdersCore([a.id], "ready", { actor: KITCHEN, now: NOW, db });
    expect((await advanceOrdersCore([a.id], "delivering", { actor: KITCHEN, now: NOW, db })).skipped[0].reason).toBe("forbidden");
  });

  it("huỷ trả suất đúng một lần; sau khi nướng cần owner + lý do", async () => {
    const a = await place("18:00");
    await advanceOrdersCore([a.id], "cancelled", { actor: KITCHEN, now: NOW, db, reason: "Khách đổi ý" });
    await advanceOrdersCore([a.id], "cancelled", { actor: KITCHEN, now: NOW, db, reason: "lần hai" });
    expect(await batchAt("18:00")).toMatchObject({ usedPan: 0, usedBbq: 0 });
    expect(await orderById(a.id)).toMatchObject({ status: "cancelled", cancelReason: "Khách đổi ý" });

    const b = await place("18:00");
    await advanceOrdersCore([b.id], "confirmed", { actor: OWNER, now: NOW, db });
    await advanceOrdersCore([b.id], "baking", { actor: OWNER, now: NOW, db });
    expect((await advanceOrdersCore([b.id], "cancelled", { actor: KITCHEN, now: NOW, db, reason: "x" })).skipped[0].reason).toBe("forbidden");
    expect((await advanceOrdersCore([b.id], "cancelled", { actor: OWNER, now: NOW, db })).skipped[0].reason).toBe("reason_required");
    expect((await advanceOrdersCore([b.id], "cancelled", { actor: OWNER, now: NOW, db, reason: "Cháy bánh" })).updated).toEqual([b.id]);
  });
});

describe("advanceBatch", () => {
  it("[Đút lò] chỉ đơn đã xác nhận; [Ra lò] đưa cả mẻ sang ready", async () => {
    const a = await place("19:00");
    const b = await place("19:00");
    await advanceOrdersCore([a.id], "confirmed", { actor: OWNER, now: NOW, db });
    const batch = await batchAt("19:00");
    expect(await advanceBatchCore(batch.id, "baking", { actor: KITCHEN, now: NOW, db })).toEqual({ updated: 1, unconfirmed: 1 });
    expect((await batchAt("19:00")).status).toBe("baking");
    expect((await orderById(b.id)).status).toBe("placed");
    expect(await advanceBatchCore(batch.id, "ready", { actor: KITCHEN, now: NOW, db })).toEqual({ updated: 1, unconfirmed: 1 });
    expect((await orderById(a.id)).status).toBe("ready");
    expect((await batchAt("19:00")).status).toBe("done");
  });
});

describe("markPaid / moveOrder / updateBatch / setDayStatus", () => {
  it("đã trả tiền: tự xác nhận đơn placed, ghi payments idempotent", async () => {
    const a = await place("17:00", { paymentMethod: "transfer" });
    await markPaidCore(a.id, "transfer", { actor: OWNER, now: NOW, db });
    await markPaidCore(a.id, "transfer", { actor: OWNER, now: NOW, db });
    expect(await orderById(a.id)).toMatchObject({ paymentStatus: "paid", status: "confirmed" });
    expect(await db.select().from(t.payments).where(eq(t.payments.orderId, a.id))).toHaveLength(1);
  });

  it("đổi mẻ: kiểm tra suất mẻ mới, trả suất mẻ cũ", async () => {
    const a = await place("17:00");
    const b18 = await batchAt("18:00");
    await db.update(t.batches).set({ usedPan: 4 }).where(eq(t.batches.id, b18.id));
    expect(await moveOrderCore(a.id, b18.id, { actor: KITCHEN, now: NOW, db })).toEqual({ ok: false, reason: "slot_full" });
    const b19 = await batchAt("19:00");
    expect(await moveOrderCore(a.id, b19.id, { actor: KITCHEN, now: NOW, db })).toEqual({ ok: true });
    expect(await batchAt("17:00")).toMatchObject({ usedPan: 0, usedBbq: 0 });
    expect(await batchAt("19:00")).toMatchObject({ usedPan: 1, usedBbq: 1 });
    expect((await orderById(a.id)).batchId).toBe(b19.id);
  });

  it("sức chứa không thấp hơn số đã nhận; tạm ngưng ngày kèm lời nhắn", async () => {
    await place("17:00");
    await place("17:00");
    const b = await batchAt("17:00");
    expect(await updateBatchCore({ batchId: b.id, capPan: 1 }, db)).toEqual({ ok: false, reason: "below_used" });
    expect(await updateBatchCore({ batchId: b.id, capPan: 2, status: "closed" }, db)).toEqual({ ok: true });
    expect(await batchAt("17:00")).toMatchObject({ capPan: 2, status: "closed" });
    await setDayStatusCore(SAT, "paused", "Lò bảo trì", db);
    expect((await db.select().from(t.serviceDays).where(eq(t.serviceDays.date, SAT)))[0]).toMatchObject({ status: "paused", pauseMessage: "Lò bảo trì" });
    await updateBatchCore({ batchId: b.id, capPan: 4, status: "open" }, db);
  });
});

describe("Thêm đơn nhanh", () => {
  const quick = async (now: Date, overrideCutoff: boolean) => {
    const b = await batchAt("18:00");
    return placeOrderCore(
      {
        idempotencyKey: randomUUID(),
        batchId: b.id,
        lines: [{ productId: "pepperoni-pan", qty: 1 }],
        customer: { phone: "0977000111", name: "Khách gọi", remember: false },
        fulfillment: { type: "pickup", pickupPointId: 1 },
        paymentMethod: "cod",
        startedAt: 0,
      },
      "0977000111",
      { now, catalog, db, staff: { actor: "staff:1", channel: "phone", overrideCutoff } },
    );
  };

  it("kênh nhân viên, xác nhận luôn, không Telegram", async () => {
    const { result, created } = await quick(NOW, false);
    expect(result).toMatchObject({ ok: true, status: "confirmed" });
    expect(created?.telegram).toEqual([]);
    const [o] = await db.select().from(t.orders);
    expect(o).toMatchObject({ channel: "phone", status: "confirmed" });
    const events = await db.select().from(t.orderEvents).where(eq(t.orderEvents.orderId, o.id));
    expect(events.map((e) => e.actor)).toEqual(["staff:1", "staff:1"]);
  });

  it("sau giờ chốt: chỉ nhận khi owner vượt giờ chốt", async () => {
    expect((await quick(at("16:00"), false)).result).toMatchObject({ ok: false, reason: "cutoff_passed" });
    expect((await quick(at("16:00"), true)).result).toMatchObject({ ok: true });
  });
});

describe("dashboard & cron", () => {
  it("loadKitchenDay trả DTO gọn kèm Bảng Tổng Hợp", async () => {
    await place("17:00", { lines: [{ productId: "pepperoni-pan", qty: 2, addons: [{ productId: "sauce-garlic-butter", qty: 1 }] }] });
    const day = await loadKitchenDay(SAT, NOW, db);
    expect(day.batches).toHaveLength(3);
    expect(day.orders[0]).toMatchObject({ seq: 1, collect: day.orders[0].total, zoneName: "Khu phố 2", routeId: 1 });
    expect(day.orders[0].items).toEqual([
      { name: "Pan Pizza Pepperoni", qty: 2, isGift: false, choices: null, addons: [{ name: "Hũ Sốt Bơ Tỏi chấm viền bánh", qty: 1 }] },
    ]);
    expect(day.orders[0]).not.toHaveProperty("trackingToken");
    expect(day.prep.totals.mains).toEqual({ pizza: 2, bbq: 0 });
  });

  it("gửi Bảng Tổng Hợp một lần sau giờ chốt; gửi lỗi thì thử lại lần sau", async () => {
    await place("17:00");
    const send = vi.fn(async () => true);
    expect((await runDaily(at("15:00"), send, db)).summarySent).toBe(false);
    const fail = vi.fn(async () => false);
    expect((await runDaily(at("15:45"), fail, db)).summarySent).toBe(false);
    expect((await runDaily(at("15:50"), send, db)).summarySent).toBe(true);
    expect((await runDaily(at("16:00"), send, db)).summarySent).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toEqual([expect.stringContaining("🔒 ĐÃ CHỐT SỔ 15:30 · 1 đơn")]);
  });

  it("dọn rate_limits quá 2 ngày", async () => {
    await db.insert(t.rateLimits).values([
      { key: "old", windowStart: new Date(NOW.getTime() - 3 * 86_400_000), count: 1 },
      { key: "new", windowStart: NOW, count: 1 },
    ]);
    expect((await runDaily(NOW, async () => true, db)).rateLimitsDeleted).toBe(1);
    expect((await db.select().from(t.rateLimits)).map((r) => r.key)).toEqual(["new"]);
    await db.delete(t.rateLimits);
  });
});

describe("nhân viên & phiên", () => {
  it("PIN băm argon2; nhân viên bị khoá không đăng nhập được", async () => {
    const id = await upsertStaff({ name: "Chủ quán", roles: ["owner"], pin: "123456" }, db);
    expect(await verifyStaffPin(id, "123456", db)).toEqual({ id, name: "Chủ quán", roles: ["owner"], role: "owner", orderRoles: ["owner"] });
    expect(await verifyStaffPin(id, "654321", db)).toBeNull();
    const [row] = await db.select().from(t.staff).where(eq(t.staff.id, id));
    expect(row.pinHash).not.toContain("123456");
    await db.update(t.staff).set({ isActive: false }).where(eq(t.staff.id, id));
    expect(await verifyStaffPin(id, "123456", db)).toBeNull();
    await expect(upsertStaff({ name: "X", roles: ["kitchen"], pin: "12" }, db)).rejects.toThrow();
  });

  it("JWT phiên: ký/giải đúng, từ chối token sửa", async () => {
    const token = await encrypt(7);
    expect(await decrypt(token)).toBe(7);
    expect(await decrypt(`${token.slice(0, -2)}xx`)).toBeNull();
    expect(await decrypt(undefined)).toBeNull();
  });
});
