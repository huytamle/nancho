import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, gte } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { seedIngredients, seedPickupPoints, seedProducts, seedRecipes, seedRoutes, seedZones } from "@/data/seed";
import { buildPrepReport } from "@/lib/domain/prep";
import type { Role } from "@/lib/domain/roles";
import { vnInstant, type ISODate } from "@/lib/domain/time";
import { batch as fixtureBatch, orders as appendixB } from "@/lib/domain/__tests__/fixtures";
import { closeDb, getDb } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { seed } from "@/lib/server/db/seed";
import { advanceBatchCore, advanceOrdersCore } from "@/lib/server/dal/admin";
import { loadKitchenDay } from "@/lib/server/dal/kitchen";
import type { OpsActor } from "@/lib/server/dal/ops";
import { upsertStaff } from "@/lib/server/dal/staff";
import {
  cancelBillCore,
  countStockCore,
  loadStockView,
  onHandMap,
  payDebtCore,
  produceCore,
  receiveStockCore,
  recordDebtCore,
  runStockCron,
  saveStockItemCore,
  stockAlerts,
  stockInBillCore,
  wasteCore,
} from "@/lib/server/dal/stock";
import { handleTelegramUpdate, type TelegramUpdate } from "@/lib/server/ops/telegram-bot";

// Kho 2 mức & công nợ NCC (§17.8, M10). Thứ Sáu 11/12/2026 — mẻ 17/18/19h (file khác dùng ngày khác).

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const FRI = "2026-12-11" as ISODate;
const at = (hhmm: string, day: ISODate = FRI) => vnInstant(day, hhmm);
const NOW = at("10:00");
const GROUP = -100_777;
const db = getDb();
const people: Record<"owner" | "manager" | "kitchen" | "barista" | "shipper" | "server", OpsActor> = {} as never;
const ctx = (who: keyof typeof people, now = NOW) => ({ actor: people[who], now, db });
const orderActor = (who: "owner" | "kitchen") => ({ id: people[who].id, roles: [who] as ("owner" | "kitchen")[] });

const stock = async (id: string) => (await onHandMap(db, [id])).get(id) ?? 0;
const avg = async (id: string) => (await db.select({ v: t.ingredients.avgCost }).from(t.ingredients).where(eq(t.ingredients.id, id)))[0].v;
const batchAt = async (hhmm: string) =>
  (await db.select().from(t.batches).where(and(eq(t.batches.serviceDate, FRI), eq(t.batches.readyAt, at(hhmm)))))[0];

/** Phụ lục B (12 đơn) vào mẻ 17/18/19h của FRI + một đơn huỷ trước khi vào lò. Trả id đơn theo seq. */
async function seedAppendixB(status: "confirmed" | "baking" = "baking") {
  const batchIds = new Map<number, number>();
  for (const [fixtureId, hhmm] of [[1, "17:00"], [2, "18:00"], [3, "19:00"]] as const) batchIds.set(fixtureId, (await batchAt(hhmm)).id);
  const extra = { ...appendixB[1], seq: 13, status: "cancelled" as const };
  const ids = new Map<number, string>();
  for (const o of [...appendixB, extra]) {
    const [c] = await db.insert(t.customers).values({ phone: `0977${String(o.seq).padStart(6, "0")}`, name: o.customerName }).onConflictDoNothing().returning({ id: t.customers.id });
    const customerId = c?.id ?? (await db.select().from(t.customers).where(eq(t.customers.phone, `0977${String(o.seq).padStart(6, "0")}`)))[0].id;
    const subtotal = o.items.reduce((n, i) => n + i.lineTotal, 0);
    const [row] = await db
      .insert(t.orders)
      .values({
        code: `S${o.seq}-${randomBytes(3).toString("hex")}`,
        seq: o.seq,
        serviceDate: FRI,
        batchId: batchIds.get(o.batchId)!,
        customerId,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        fulfillment: o.fulfillment,
        zoneId: o.zoneId,
        pickupPointId: o.pickupPointId,
        addressText: o.addressText,
        subtotal,
        shipFee: o.total - subtotal,
        total: o.total,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        status: o.status === "cancelled" ? "cancelled" : status,
        trackingToken: randomBytes(16).toString("base64url"),
        idempotencyKey: randomUUID(),
      })
      .returning({ id: t.orders.id });
    await db.insert(t.orderItems).values(o.items.map((i) => ({ orderId: row.id, ...i })));
    ids.set(o.seq, row.id);
  }
  return ids;
}

/** Tồn đầu = 1.000 cho mọi nguyên liệu Phụ lục A (qua kiểm kê tuần). */
async function opening(qty = 1000) {
  const res = await countStockCore({ kind: "weekly", lines: seedIngredients.map((i) => ({ ingredientId: i.id, counted: qty })) }, ctx("owner"));
  if (!res.ok) throw new Error(res.reason);
}

async function reset() {
  await db.delete(t.stockMoves);
  await db.delete(t.stockCounts);
  await db.update(t.expenses).set({ supplierId: null });
  await db.delete(t.supplierBills);
  await db.delete(t.expenses);
  await db.delete(t.suppliers);
  await db.delete(t.orders).where(eq(t.orders.serviceDate, FRI));
  await db.delete(t.customers);
  await db.delete(t.telegramUpdates);
  await db.delete(t.opsFiles);
  await db.update(t.ingredients).set({ avgCost: 0 });
  await db.update(t.batches).set({ status: "open", usedPan: 0, usedBbq: 0 }).where(eq(t.batches.serviceDate, FRI));
}

beforeAll(async () => {
  await seed(db, at("09:00"));
  await db.delete(t.cashHandovers);
  await reset();
  await db.delete(t.staff);
  const mk = async (name: string, roles: Role[], tg: number) => {
    const id = await upsertStaff({ name, roles, pin: "123456" }, db);
    await db.update(t.staff).set({ telegramUserId: tg }).where(eq(t.staff.id, id));
    return { id, name, roles };
  };
  people.owner = await mk("Chủ", ["owner"], 8001);
  people.manager = await mk("Quản lý Mai", ["manager"], 8002);
  people.kitchen = await mk("Bếp Tâm", ["kitchen"], 8003);
  people.barista = await mk("Pha chế Vy", ["barista"], 8004);
  people.shipper = await mk("Ship Long", ["shipper"], 8005);
  people.server = await mk("Phục vụ An", ["server"], 8006);
});
beforeEach(reset);
afterAll(async () => {
  await reset();
  await db.delete(t.opsEvents);
  await db.delete(t.staff);
  await db.delete(t.serviceDays).where(gte(t.serviceDays.date, FRI));
  await closeDb();
});

describe("trừ kho khi Ra lò (§17.8)", () => {
  it("Phụ lục B: tồn sau ngày = tồn đầu − Bảng Tổng Hợp Chuẩn Bị, khớp từng dòng; Ra lò hai lần chỉ trừ một lần", async () => {
    await opening();
    await seedAppendixB();
    for (const hhmm of ["17:00", "18:00", "19:00"]) {
      const b = await batchAt(hhmm);
      expect((await advanceBatchCore(b.id, "ready", { actor: orderActor("kitchen"), now: at("17:00"), db })).updated).toBeGreaterThan(0);
      expect((await advanceBatchCore(b.id, "ready", { actor: orderActor("kitchen"), now: at("17:01"), db })).updated).toBe(0);
    }
    const prep = buildPrepReport({
      date: appendixB[0].serviceDate,
      now: NOW,
      orders: appendixB,
      products: seedProducts,
      recipes: seedRecipes,
      ingredients: seedIngredients,
      batches: [fixtureBatch(1, "17:00"), fixtureBatch(2, "18:00"), fixtureBatch(3, "19:00")],
      zones: seedZones,
      routes: seedRoutes,
      points: seedPickupPoints,
    });
    const after = await onHandMap(db);
    expect(prep.totals.ingredients.length).toBeGreaterThan(8);
    for (const line of prep.totals.ingredients) expect([line.ingredientId, after.get(line.ingredientId)]).toEqual([line.ingredientId, 1000 - line.qty]);
    // Spot check Phụ lục B: 9 đế pan (5 Pepperoni + 4 Bơ tỏi), 1.620 g mozzarella.
    expect(after.get("pan-dough")).toBe(991);
    expect(after.get("mozzarella")).toBe(1000 - 1620);
    expect(await db.select().from(t.stockMoves).where(eq(t.stockMoves.kind, "sale"))).toHaveLength(
      new Set((await db.select().from(t.stockMoves).where(eq(t.stockMoves.kind, "sale"))).map((m) => `${m.refId}:${m.ingredientId}`)).size,
    );
  });

  it("Ra lò song song trừ đúng một lần; no_show vẫn trừ; huỷ trước khi vào lò không trừ", async () => {
    await opening();
    const ids = await seedAppendixB();
    const b17 = await batchAt("17:00");
    const k = { actor: orderActor("kitchen"), now: at("17:00"), db };
    await Promise.all([advanceBatchCore(b17.id, "ready", k), advanceBatchCore(b17.id, "ready", k), advanceOrdersCore([ids.get(1)!], "ready", k)]);
    // Mẻ 17h: đơn 1–3 = 3 đế + 2 túi sườn.
    expect(await stock("pan-dough")).toBe(997);
    expect(await stock("ribs-bag")).toBe(998);

    // Đơn 8 (nhận tại Rêu) ra lò rồi bom → không hoàn kho.
    await advanceOrdersCore([ids.get(8)!], "ready", k);
    expect(await stock("pan-dough")).toBe(996);
    await advanceOrdersCore([ids.get(8)!], "no_show", { ...k, now: at("19:30") });
    expect(await stock("pan-dough")).toBe(996);

    // Đơn 13 huỷ trước khi vào lò: không có dòng bán.
    const cancelled = await db.select().from(t.stockMoves).where(and(eq(t.stockMoves.kind, "sale"), eq(t.stockMoves.refId, ids.get(13)!)));
    expect(cancelled).toHaveLength(0);
    // Đơn đã nướng bị owner huỷ (có lý do) — bánh đã làm, không cộng lại kho.
    await advanceOrdersCore([ids.get(2)!], "cancelled", { actor: orderActor("owner"), now: at("17:10"), db, reason: "Khách đổi ý" });
    expect(await stock("pan-dough")).toBe(996);
  });

  it("tab Chuẩn bị: tồn & lượng còn cần cho đơn chưa ra lò", async () => {
    await opening(10);
    await seedAppendixB("confirmed");
    const day = await loadKitchenDay(FRI, NOW, db);
    expect(day.stock["pan-dough"]).toEqual({ onHand: 10, need: 9 });
    expect(day.stock["mozzarella"]).toEqual({ onHand: 10, need: 1620 });
    expect(day.stock["pink-ginger"]).toBeUndefined(); // không theo dõi
    const b17 = await batchAt("17:00");
    await db.update(t.orders).set({ status: "baking" }).where(and(eq(t.orders.batchId, b17.id), eq(t.orders.status, "confirmed")));
    await advanceBatchCore(b17.id, "ready", { actor: orderActor("kitchen"), now: at("17:00"), db });
    expect((await loadKitchenDay(FRI, NOW, db)).stock["pan-dough"]).toEqual({ onHand: 7, need: 6 });
  });
});

describe("nhập kho, giá vốn, sản xuất, huỷ", () => {
  it("bình quân gia quyền; nhập song song không lệch; đơn vị mua; chỉ owner/manager nhập", async () => {
    let r = await receiveStockCore({ ingredientId: "mozzarella", qty: 5000, amount: 1_200_000, pay: { kind: "expense", source: "petty" } }, ctx("manager"));
    expect(r).toMatchObject({ ok: true, avgCost: 240 });
    await Promise.all([
      receiveStockCore({ ingredientId: "mozzarella", qty: 5000, amount: 1_300_000, pay: { kind: "expense", source: "bank" } }, ctx("owner")),
      receiveStockCore({ ingredientId: "mozzarella", qty: 10_000, amount: 2_500_000, pay: { kind: "expense", source: "pocket" } }, ctx("manager")),
    ]);
    expect(await stock("mozzarella")).toBe(20_000);
    expect(await avg("mozzarella")).toBe(250);
    const exp = await db.select().from(t.expenses).orderBy(t.expenses.id);
    expect(exp.map((e) => [e.amount, e.category, e.source])).toEqual([
      [1_200_000, "nl-pizza", "petty"],
      expect.any(Array),
      expect.any(Array),
    ]);
    expect(exp[0].description).toBe("Mozzarella 5.000 g");

    // Thùng 24 lon 240.000đ → 10.000đ/lon.
    r = await receiveStockCore({ ingredientId: "pepsi", qty: 24, amount: 240_000, pay: { kind: "expense", source: "petty" } }, ctx("owner"));
    expect(r).toMatchObject({ ok: true, avgCost: 10_000 });
    expect((await db.select().from(t.expenses).orderBy(t.expenses.id)).at(-1)!.category).toBe("nl-cafe");

    for (const who of ["kitchen", "barista", "shipper"] as const) {
      expect(await receiveStockCore({ ingredientId: "pepsi", qty: 1, amount: 1000, pay: { kind: "expense", source: "petty" } }, ctx(who))).toEqual({ ok: false, reason: "forbidden" });
    }
    expect(await receiveStockCore({ ingredientId: "nope", qty: 1, amount: 1000, pay: { kind: "expense", source: "petty" } }, ctx("owner"))).toEqual({ ok: false, reason: "not_found" });
    expect(await receiveStockCore({ ingredientId: "pepsi", qty: 1, amount: null, pay: { kind: "expense", source: "petty" } }, ctx("owner"))).toEqual({ ok: false, reason: "invalid" });
  });

  it("sản xuất 2 mẻ bột: trừ bột & men, cộng 12 đế với giá vốn qua công thức và hạn dùng; bếp làm được, phục vụ không", async () => {
    await receiveStockCore({ ingredientId: "flour", qty: 25_000, amount: 500_000, pay: { kind: "expense", source: "petty" } }, ctx("owner")); // 20đ/g
    await receiveStockCore({ ingredientId: "yeast", qty: 500, amount: 100_000, pay: { kind: "expense", source: "petty" } }, ctx("owner")); // 200đ/g
    expect(await produceCore({ outputId: "pan-dough", runs: 2 }, ctx("kitchen"))).toEqual({ ok: true, qty: 12, unit: "đế", label: "Đế Pan đã ủ" });
    expect(await stock("flour")).toBe(22_000);
    expect(await stock("yeast")).toBe(470);
    expect(await stock("pan-dough")).toBe(12);
    expect(await avg("pan-dough")).toBe(5500);
    const [lot] = await db.select().from(t.stockMoves).where(eq(t.stockMoves.kind, "produce_in"));
    expect(lot.expiresAt).toEqual(new Date(NOW.getTime() + 72 * 3_600_000));
    expect(await produceCore({ outputId: "pan-dough", runs: 1 }, ctx("server"))).toEqual({ ok: false, reason: "forbidden" });
    expect(await produceCore({ outputId: "mozzarella", runs: 1 }, ctx("kitchen"))).toEqual({ ok: false, reason: "not_found" });

    // Huỷ: lý do "khác" phải ghi chú; giá trị theo giá vốn.
    expect(await wasteCore({ ingredientId: "pan-dough", qty: 2, reason: "other" }, ctx("kitchen"))).toEqual({ ok: false, reason: "reason_required" });
    expect(await wasteCore({ ingredientId: "pan-dough", qty: 2, reason: "dropped" }, ctx("barista"))).toEqual({ ok: true, value: 11_000 });
    expect(await wasteCore({ ingredientId: "pan-dough", qty: 1, reason: "expired" }, ctx("shipper"))).toEqual({ ok: false, reason: "forbidden" });
    expect(await stock("pan-dough")).toBe(10);
  });

  it("cảnh báo dưới mức / sắp hết hạn; cron gửi một lần mỗi ngày", async () => {
    await receiveStockCore({ ingredientId: "flour", qty: 3000, amount: 60_000, pay: { kind: "expense", source: "petty" } }, ctx("owner"));
    await receiveStockCore({ ingredientId: "yeast", qty: 500, amount: 100_000, pay: { kind: "expense", source: "petty" } }, ctx("owner"));
    await produceCore({ outputId: "pan-dough", runs: 2 }, ctx("kitchen"));
    const later = new Date(NOW.getTime() + 60 * 3_600_000); // còn 12 giờ là hết hạn đế
    const alerts = await stockAlerts(later, db);
    expect(alerts.find((a) => a.label === "Đế Pan đã ủ")?.flags).toEqual(["expiring"]);
    expect(alerts.find((a) => a.label === "Bột mì")?.flags).toEqual(["below_par"]);
    const sent: string[] = [];
    const send = async (s: string) => (sent.push(s), true);
    expect(await runStockCron(later, send, db)).toEqual({ stockAlertSent: true });
    expect(await runStockCron(later, send, db)).toEqual({ stockAlertSent: false });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("🧊 Kho cần chú ý");
    expect(sent[0]).toContain("Đế Pan đã ủ");
  });
});

describe("kiểm kê & kiểm nhanh ABC (đếm mù)", () => {
  it("kiểm nhanh theo vai trò: lệch → dòng adjust + Telegram; DTO bếp không có số tiền", async () => {
    await opening(1000);
    const kv = (await loadStockView(people.kitchen, NOW, db))!;
    const quick = kv.quick.items.map((i) => i.id);
    expect(quick).toEqual(expect.arrayContaining(["pan-dough", "ribs-bag", "mozzarella"]));
    expect(quick).not.toContain("pepsi");
    expect(quick.length).toBe(3 + 3 + 1); // 3 A pizza + 3 B + sườn sống (A)
    expect(JSON.stringify(kv.quick)).not.toContain("1000"); // đếm mù
    expect(kv.items[0].avgCost).toBeUndefined();
    expect(kv.margins).toEqual([]);
    expect(kv.suppliers).toEqual([]);
    expect(kv.month).toBeNull();
    expect((await loadStockView(people.barista, NOW, db))!.quick.items.map((i) => i.id)).toEqual(expect.arrayContaining(["pepsi", "sting"]));
    expect(await loadStockView(people.shipper, NOW, db)).toBeNull();

    const res = await countStockCore(
      { kind: "quick", lines: [{ ingredientId: "mozzarella", counted: 940 }, { ingredientId: "pan-dough", counted: 1000 }, { ingredientId: "ribs-bag", counted: 998 }] },
      ctx("kitchen"),
    );
    if (!res.ok) throw new Error(res.reason);
    expect(res.lines.map((l) => [l.ingredientId, l.diff, l.over])).toEqual([
      ["mozzarella", -60, true],
      ["pan-dough", 0, false],
      ["ribs-bag", -2, false],
    ]);
    expect(res.value).toBeUndefined();
    expect(res.telegram).toContain("⚠ Kiểm nhanh lệch — Bếp Tâm");
    expect(res.telegram).toContain("Mozzarella");
    expect(res.telegram).not.toContain("Túi sườn");
    expect(await stock("mozzarella")).toBe(940);
    expect(await stock("ribs-bag")).toBe(998);
    // Mục vừa đếm xuống cuối hàng đợi nhóm B; đã kiểm nhanh hôm nay.
    const again = (await loadStockView(people.kitchen, new Date(NOW.getTime() + 60_000), db))!;
    expect(again.quick.lastAt).not.toBeNull();

    expect(await countStockCore({ kind: "quick", lines: [{ ingredientId: "x", counted: 1 }] }, ctx("kitchen"))).toEqual({ ok: false, reason: "not_found" });
    expect(await countStockCore({ kind: "quick", lines: [{ ingredientId: "pan-dough", counted: 1 }, { ingredientId: "pan-dough", counted: 2 }] }, ctx("kitchen"))).toEqual({ ok: false, reason: "invalid" });
    expect(await countStockCore({ kind: "weekly", lines: [{ ingredientId: "pan-dough", counted: 1 }] }, ctx("server"))).toEqual({ ok: false, reason: "forbidden" });
  });

  it("kiểm kê tuần: hao hụt (số lượng & tiền) cho owner/manager; tháng có tổng nhập/huỷ/lệch", async () => {
    await receiveStockCore({ ingredientId: "mozzarella", qty: 2000, amount: 500_000, pay: { kind: "expense", source: "petty" } }, ctx("owner"));
    const res = await countStockCore({ kind: "weekly", lines: [{ ingredientId: "mozzarella", counted: 1900 }] }, ctx("manager"));
    expect(res).toMatchObject({ ok: true, value: -25_000 });
    const v = (await loadStockView(people.owner, NOW, db))!;
    expect(v.month).toMatchObject({ purchases: 500_000, adjust: -25_000, waste: 0 });
    expect(v.items.find((i) => i.id === "mozzarella")).toMatchObject({ onHand: 1900, avgCost: 250, value: 475_000 });
  });
});

describe("giá vốn & biên lợi nhuận theo món", () => {
  it("bán thành phẩm tính qua công thức; combo lấy lựa chọn đắt nhất; chỉ owner/manager", async () => {
    const buy = (id: string, qty: number, amount: number) => receiveStockCore({ ingredientId: id, qty, amount, pay: { kind: "expense", source: "petty" } }, ctx("owner"));
    await buy("flour", 1500, 30_000); // 20đ/g → đế = (1500×20 + 15×200)/6 = 5.500đ
    await buy("yeast", 15, 3000);
    await buy("mozzarella", 1000, 250_000);
    await buy("pepperoni", 1000, 400_000);
    await buy("pizza-box", 50, 250_000);
    const v = (await loadStockView(people.manager, NOW, db))!;
    const pep = v.margins.find((m) => m.productId === "pepperoni-pan")!;
    // 5.500 + 180×250 + 60×400 + 5.000 (gừng chưa có giá)
    expect(pep).toMatchObject({ price: 159_000, cost: 79_500, gross: 79_500, pct: 50 });
    expect(v.margins.find((m) => m.productId === "combo-doi")!.cost).toBe(79_500);
  });
});

describe("công nợ nhà cung cấp & bot Telegram", () => {
  type Call = { method: string; body: Record<string, unknown> };
  let calls: Call[];
  let msgId: number;
  let updateId = 70_000;
  const api = async <T,>(method: string, body: object): Promise<T | null> => {
    calls.push({ method, body: body as Record<string, unknown> });
    return (method === "sendMessage" ? { message_id: ++msgId } : true) as T;
  };
  const deps = () => ({ api, now: NOW, db, allowedChats: [GROUP], botUsername: "TheHeatBot", download: async () => ({ bytes: Buffer.from([1, 2, 3]), mime: "image/jpeg" }) });
  const message = (from: number, text: string | undefined, extra: object = {}): TelegramUpdate => ({
    update_id: ++updateId,
    message: { message_id: 600 + updateId, from: { id: from }, chat: { id: GROUP, type: "supergroup" }, ...(text !== undefined ? { text } : {}), ...extra },
  });
  const cb = (from: number, data: string, message_id = 9001): TelegramUpdate => ({
    update_id: ++updateId,
    callback_query: { id: "q", from: { id: from }, data, message: { message_id, chat: { id: GROUP, type: "supergroup" } } },
  });
  const lastText = () => calls.filter((c) => c.method === "sendMessage").at(-1)?.body.text as string;
  const answers = () => calls.filter((c) => c.method === "answerCallbackQuery").map((c) => c.body.text);

  beforeEach(() => {
    calls = [];
    msgId = 9000;
  });

  it("/no → phiếu nợ + hỏi nhập kho; [Nhập kho] một lần, chia tiền theo giá vốn; /trano ghi đúng một chi phí; /congno", async () => {
    // Giá vốn hiện tại để chia tiền phiếu: sting 9.000/lon, pepsi 10.000/lon.
    await receiveStockCore({ ingredientId: "sting", qty: 24, amount: 216_000, pay: { kind: "expense", source: "petty" } }, ctx("owner"));
    await receiveStockCore({ ingredientId: "pepsi", qty: 24, amount: 240_000, pay: { kind: "expense", source: "petty" } }, ctx("owner"));
    const before = (await db.select().from(t.expenses)).length;

    await handleTelegramUpdate(message(8002, "/no Cô Nhiều 3 thùng sting, 2 thùng pepsi 480k"), deps());
    const [bill] = await db.select().from(t.supplierBills);
    expect(bill).toMatchObject({ amount: 480_000, paidAmount: 0, status: "open", telegramChatId: GROUP, telegramMsgId: 9001, createdBy: people.manager.id });
    expect(bill.items.map((l) => l.ingredientId)).toEqual(["sting", "pepsi"]);
    expect(lastText()).toContain(`📒 N${bill.id} · Nợ Cô Nhiều · 480.000đ`);
    expect(JSON.stringify(calls[0].body.reply_markup)).toContain(`n:${bill.id}`);
    // /no không ghi chi phí (dòng tiền ghi khi trả).
    expect((await db.select().from(t.expenses)).length).toBe(before);

    // Ảnh phiếu giao hàng trả lời tin bot.
    await handleTelegramUpdate(message(8002, undefined, { photo: [{ file_id: "p1" }], reply_to_message: { message_id: 9001, from: { id: 1, is_bot: true } } }), deps());
    expect((await db.select().from(t.supplierBills))[0].photo).toMatch(/^[0-9a-f-]{36}$/);

    await handleTelegramUpdate(cb(8003, `n:${bill.id}`), deps()); // bếp không nhập kho được
    expect(answers().at(-1)).toBe("Bạn không có quyền làm việc này.");
    await Promise.all([handleTelegramUpdate(cb(8001, `n:${bill.id}`), deps()), handleTelegramUpdate(cb(8002, `n:${bill.id}`), deps())]);
    expect(await stock("sting")).toBe(24 + 72);
    expect(await stock("pepsi")).toBe(24 + 48);
    expect(answers()).toEqual(expect.arrayContaining(["Đã nhập kho", "Phiếu này đã nhập kho rồi"]));
    // 480k chia theo lượng × giá vốn: sting 72×9.000, pepsi 48×10.000 → 275.745 / 204.255.
    const moves = await db.select().from(t.stockMoves).where(and(eq(t.stockMoves.refType, "bill"), eq(t.stockMoves.refId, String(bill.id))));
    expect(moves.map((m) => Math.round(m.qty * m.unitCost)).sort()).toEqual([204_255, 275_745]);
    expect(await cancelBillCore(bill.id, ctx("owner"))).toEqual({ ok: false, reason: "locked" });

    await handleTelegramUpdate(message(8002, "/congno"), deps());
    expect(lastText()).toContain("Cô Nhiều: 480.000đ · 1 phiếu");

    // Trả dần: 300k (chưa đóng phiếu) rồi 180k (đóng). Gửi lại update → không ghi chi đôi.
    const pay1 = message(8001, "/trano cô nhiều 300k #ck");
    await handleTelegramUpdate(pay1, deps());
    expect(await handleTelegramUpdate(pay1, deps())).toBe("duplicate");
    expect(lastText()).toContain("Còn nợ: 180.000đ");
    await handleTelegramUpdate(message(8001, "/trano Cô Nhiều 200k"), deps());
    expect(lastText()).toContain("Đã đóng 1 phiếu");
    expect(lastText()).toContain("Trả dư 20.000đ");
    const paid = (await db.select().from(t.expenses)).filter((e) => e.supplierId !== null);
    expect(paid.map((e) => [e.amount, e.source, e.description])).toEqual([
      [300_000, "bank", "Trả nợ Cô Nhiều"],
      [200_000, "petty", "Trả nợ Cô Nhiều"],
    ]);
    expect((await db.select().from(t.supplierBills))[0]).toMatchObject({ status: "paid", paidAmount: 480_000 });
    // Trả nợ không nhập kho lần nữa.
    expect(await stock("sting")).toBe(96);
    await handleTelegramUpdate(message(8001, "/trano Cô Nhiều 50k"), deps());
    expect(lastText()).toBe("Nhà cung cấp này không còn phiếu nợ nào.");
    await handleTelegramUpdate(message(8001, "/trano Chú Ba 50k"), deps());
    expect(lastText()).toContain('Không thấy nhà cung cấp "Chú Ba"');
    await handleTelegramUpdate(message(8001, "/congno"), deps());
    expect(lastText()).toBe("✅ Không còn nợ nhà cung cấp nào.");
  });

  it("/no chưa có giá → giá điền khi trả; nhập kho theo giá vốn hiện tại; người không có quyền bị từ chối", async () => {
    await handleTelegramUpdate(message(8003, "/no Cô Nhiều 2 thùng sting"), deps());
    expect(lastText()).toBe("Chỉ chủ quán/quản lý được ghi chi tiền.");
    await handleTelegramUpdate(message(8001, "/no Cô Nhiều"), deps());
    expect(lastText()).toContain("Cú pháp: /no");
    const res = await recordDebtCore({ supplier: "Cô Nhiều", lines: [{ text: "sting", qty: 1, unit: "thung", amount: null }, { text: "đá viên", qty: 2, unit: "bich", amount: null }], amount: null }, ctx("owner"));
    if (!res.ok) throw new Error(res.reason);
    expect(res.stockable).toEqual([{ ingredientId: "sting", label: "Sting lon", qty: 24, unit: "lon" }]);
    expect(await stockInBillCore(res.billId, ctx("owner"))).toMatchObject({ ok: true });
    expect(await avg("sting")).toBe(0);
    const pay = await payDebtCore({ supplier: "co nhieu", amount: 250_000, source: "petty" }, ctx("manager"));
    expect(pay).toMatchObject({ ok: true, closed: 1, remaining: 0, leftover: 0 });
    expect((await db.select().from(t.supplierBills))[0]).toMatchObject({ amount: 250_000, paidAmount: 250_000, status: "paid" });
    expect(await payDebtCore({ supplier: "Cô Nhiều", amount: 1000, source: "petty" }, ctx("kitchen"))).toEqual({ ok: false, reason: "forbidden" });
  });

  it("trả nợ song song không trừ hai lần cùng khoản nợ", async () => {
    const r = await recordDebtCore({ supplier: "Chú Ba", lines: [{ text: "bột", qty: 1, unit: "bao", amount: 400_000 }], amount: 400_000 }, ctx("owner"));
    if (!r.ok) throw new Error(r.reason);
    const out = await Promise.all([1, 2].map(() => payDebtCore({ supplier: "Chú Ba", amount: 400_000, source: "petty" }, ctx("owner"))));
    expect(out.map((o) => (o.ok ? "ok" : o.reason)).sort()).toEqual(["no_debt", "ok"]);
    expect((await db.select().from(t.expenses)).filter((e) => e.supplierId !== null)).toHaveLength(1);
    // Huỷ phiếu ghi nhầm: chỉ khi chưa trả, chưa nhập kho.
    const r2 = await recordDebtCore({ supplier: "Chú Ba", lines: [{ text: "men", qty: 1, unit: "goi", amount: null }], amount: null }, ctx("owner"));
    if (!r2.ok) throw new Error(r2.reason);
    expect(await cancelBillCore(r2.billId, ctx("kitchen"))).toEqual({ ok: false, reason: "forbidden" });
    expect(await cancelBillCore(r2.billId, ctx("manager"))).toEqual({ ok: true });
    expect(await cancelBillCore(r.billId, ctx("manager"))).toEqual({ ok: false, reason: "locked" });
  });

  it("/chi có số lượng khớp nguyên liệu → [Nhập kho] một lần, giá vốn = tiền / lượng; [Chỉ chi phí] bỏ nút", async () => {
    await handleTelegramUpdate(message(8002, "/chi 1tr2 phô mai 5kg #tui"), deps());
    const [e] = await db.select().from(t.expenses);
    const markup = JSON.stringify(calls[0].body.reply_markup);
    expect(markup).toContain(`k:${e.id}`);
    expect(markup).toContain("Nhập kho 5.000 g Mozzarella");
    await handleTelegramUpdate(cb(8002, `k:${e.id}`), deps());
    await handleTelegramUpdate(cb(8002, `k:${e.id}`), deps());
    expect(answers()).toEqual(["Đã nhập kho", "Chứng từ này đã nhập kho rồi"]);
    expect(await stock("mozzarella")).toBe(5000);
    expect(await avg("mozzarella")).toBe(240);
    expect(lastText()).toBe("📦 Đã nhập kho 5.000 g Mozzarella.");

    calls = [];
    await handleTelegramUpdate(message(8002, "/chi 150k đá viên"), deps());
    expect(JSON.stringify(calls[0].body.reply_markup)).not.toContain("k:");
    await handleTelegramUpdate(message(8002, "/chi 300k pepsi 1 thùng"), deps());
    const pepsiExp = (await db.select().from(t.expenses).orderBy(t.expenses.id)).at(-1)!;
    await handleTelegramUpdate(cb(8002, `o:${pepsiExp.id}`), deps());
    expect(answers().at(-1)).toBe("Chỉ ghi chi phí, không nhập kho");
    expect(await stock("pepsi")).toBe(0);
  });
});

describe("hồ sơ mặt hàng", () => {
  it("owner/manager sửa; đơn vị mua phải đi cùng quy đổi", async () => {
    const base = { id: "pepsi", level: "goods" as const, trackStock: true, purchaseUnit: "thùng", purchaseFactor: 24, shelfLifeHours: null, parLevel: 24, aliases: ["pepsi", "pep"], countClass: "A" as const, countRoles: ["barista" as const], countTolerancePct: 0 };
    expect(await saveStockItemCore(base, ctx("manager"))).toEqual({ ok: true });
    expect((await db.select().from(t.ingredients).where(eq(t.ingredients.id, "pepsi")))[0]).toMatchObject({ parLevel: 24, countClass: "A", aliases: ["pepsi", "pep"] });
    expect(await saveStockItemCore({ ...base, purchaseFactor: null }, ctx("owner"))).toEqual({ ok: false, reason: "invalid" });
    expect(await saveStockItemCore(base, ctx("barista"))).toEqual({ ok: false, reason: "forbidden" });
    expect(await saveStockItemCore({ ...base, id: "nope" }, ctx("owner"))).toEqual({ ok: false, reason: "not_found" });
    await saveStockItemCore({ ...base, parLevel: 12, countClass: "B", aliases: ["pepsi"], countTolerancePct: 5 }, ctx("owner"));
  });
});
