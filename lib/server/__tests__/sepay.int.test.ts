import { randomUUID } from "node:crypto";
import { and, eq, gte } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { transferMemo } from "@/lib/domain/order-code";
import { addDays, vnInstant, type ISODate } from "@/lib/domain/time";
import type { PlaceOrderInput } from "@/lib/order-contract";
import { SepayPayload } from "@/lib/payments";
import { closeDb, getDb } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { seed } from "@/lib/server/db/seed";
import { loadCatalog, type Catalog } from "@/lib/server/dal/catalog";
import { runDaily } from "@/lib/server/dal/kitchen";
import { placeOrderCore } from "@/lib/server/dal/orders";
import { recordSepayCore } from "@/lib/server/payments/sepay";

// Webhook SePay (§11.2) + dọn địa chỉ cũ của cron (§12). Chủ Nhật 08/11/2026 (file khác dùng T6/T7).

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const SUN = "2026-11-08" as ISODate;
const at = (hhmm: string, day: ISODate = SUN) => vnInstant(day, hhmm);
const NOW = at("10:00");
const db = getDb();
let catalog: Catalog;
let n = 0;
let txn = 1000;

async function place(paymentMethod: "cod" | "transfer" = "transfer") {
  const [b] = await db.select().from(t.batches).where(and(eq(t.batches.serviceDate, SUN), eq(t.batches.readyAt, at("18:00"))));
  const phone = `09444${String(10000 + n++).slice(-5)}`;
  const input: PlaceOrderInput = {
    idempotencyKey: randomUUID(),
    batchId: b.id,
    lines: [{ productId: "pepperoni-pan", qty: 1 }],
    customer: { phone, name: "Khách CK", remember: false },
    fulfillment: { type: "delivery", zoneId: 2, addressText: "Nhà mái tôn xanh cạnh tạp hoá" },
    paymentMethod,
    startedAt: 0,
  };
  const { result } = await placeOrderCore(input, phone, { now: NOW, catalog, db, source: "fb-post" });
  if (!result.ok) throw new Error(result.reason);
  return (await db.select().from(t.orders).where(eq(t.orders.code, result.code)))[0];
}

const payload = (content: string, amount: number, extra: Record<string, unknown> = {}) =>
  SepayPayload.parse({
    id: txn++,
    gateway: "Vietcombank",
    transactionDate: "2026-11-08 10:05:00",
    accountNumber: "1012345678",
    code: null,
    content,
    transferType: "in",
    transferAmount: amount,
    referenceCode: `FT${txn}`,
    description: `BankAPINotify ${content}`,
    ...extra,
  });

const order = async (id: string) => (await db.select().from(t.orders).where(eq(t.orders.id, id)))[0];

async function reset() {
  await db.delete(t.payments);
  await db.delete(t.orders);
  await db.delete(t.customers);
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
  await db.delete(t.serviceDays).where(gte(t.serviceDays.date, SUN));
  await closeDb();
});

describe("recordSepayCore", () => {
  it("đủ tiền → paid, tự xác nhận, ghi payments + events; nguồn ?src= lưu trên đơn", async () => {
    const o = await place();
    expect(o.status).toBe("placed");
    expect(o.source).toBe("fb-post");
    const res = await recordSepayCore(payload(`${transferMemo(SUN, o.seq)} chuyen tien`, o.total), { now: NOW, db });
    expect(res).toMatchObject({ status: "paid", orderId: o.id, telegram: `💰 #${o.seq} đã chuyển khoản ${new Intl.NumberFormat("vi-VN").format(o.total)}đ` });
    expect(await order(o.id)).toMatchObject({ paymentStatus: "paid", status: "confirmed", paymentMethod: "transfer" });
    const pays = await db.select().from(t.payments);
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ orderId: o.id, provider: "sepay", amount: o.total });
    const events = await db.select().from(t.orderEvents).where(eq(t.orderEvents.orderId, o.id));
    expect(events.map((e) => [e.type, e.actor])).toEqual(
      expect.arrayContaining([
        ["paid", "sepay"],
        ["status_changed", "system"],
      ]),
    );
  });

  it("SePay gửi lại cùng id → duplicate, không ghi hai lần (kể cả song song)", async () => {
    const o = await place();
    const p = payload(transferMemo(SUN, o.seq), o.total);
    const results = await Promise.all([recordSepayCore(p, { now: NOW, db }), recordSepayCore(p, { now: NOW, db })]);
    expect(results.map((r) => r.status).sort()).toEqual(["duplicate", "paid"]);
    expect(await db.select().from(t.payments)).toHaveLength(1);
    expect((await db.select().from(t.orderEvents).where(and(eq(t.orderEvents.orderId, o.id), eq(t.orderEvents.type, "paid"))))).toHaveLength(1);
  });

  it("chuyển thiếu → partial; lần sau đủ tổng → paid", async () => {
    const o = await place();
    const memo = transferMemo(SUN, o.seq);
    const first = await recordSepayCore(payload(memo, 100_000), { now: NOW, db });
    expect(first.status).toBe("partial");
    expect((await order(o.id)).paymentStatus).toBe("unpaid");
    const second = await recordSepayCore(payload(memo, o.total - 100_000), { now: NOW, db });
    expect(second.status).toBe("paid");
    expect((await order(o.id)).paymentStatus).toBe("paid");
  });

  it("không tìm thấy mã đơn → lưu với order_id null + cảnh báo", async () => {
    await place();
    const res = await recordSepayCore(payload("chuyen tien an pizza", 50_000), { now: NOW, db });
    expect(res).toMatchObject({ status: "unmatched", orderId: null });
    const ghost = await recordSepayCore(payload(transferMemo(SUN, 99), 50_000), { now: NOW, db });
    expect(ghost.status).toBe("unmatched");
    expect((await db.select().from(t.payments)).every((p) => p.orderId === null)).toBe(true);
  });

  it("tiền ra bỏ qua; đơn đã trả/đã huỷ nhận thêm → extra (không đổi trạng thái)", async () => {
    const o = await place();
    const memo = transferMemo(SUN, o.seq);
    expect((await recordSepayCore(payload(memo, o.total, { transferType: "out" }), { now: NOW, db })).status).toBe("ignored");
    expect(await db.select().from(t.payments)).toHaveLength(0);
    await recordSepayCore(payload(memo, o.total), { now: NOW, db });
    const again = await recordSepayCore(payload(memo, 10_000), { now: NOW, db });
    expect(again.status).toBe("extra");

    const c = await place();
    await db.update(t.orders).set({ status: "cancelled" }).where(eq(t.orders.id, c.id));
    const late = await recordSepayCore(payload(transferMemo(SUN, c.seq), c.total), { now: NOW, db });
    expect(late).toMatchObject({ status: "extra" });
    expect((await order(c.id)).paymentStatus).toBe("unpaid");
  });

  it("khách chọn COD nhưng chuyển khoản đủ → paid, phương thức thành transfer", async () => {
    const o = await place("cod");
    await recordSepayCore(payload(transferMemo(SUN, o.seq), o.total), { now: NOW, db });
    expect(await order(o.id)).toMatchObject({ paymentStatus: "paid", paymentMethod: "transfer" });
  });
});

describe("cron dọn địa chỉ (§12)", () => {
  it("xoá mô tả nhà & toạ độ trên đơn cũ hơn 90 ngày, giữ đơn mới", async () => {
    const o = await place();
    const send = async () => true;
    expect((await runDaily(at("09:00", addDays(SUN, 90)), send, db)).addressesAnonymized).toBe(0);
    expect((await order(o.id)).addressText).not.toBeNull();
    expect((await runDaily(at("09:00", addDays(SUN, 91)), send, db)).addressesAnonymized).toBe(1);
    expect(await order(o.id)).toMatchObject({ addressText: null, lat: null, lng: null });
  });
});
