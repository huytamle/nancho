import { randomBytes, randomUUID } from "node:crypto";
import { eq, gte, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@/lib/domain/roles";
import { vnInstant, type ISODate } from "@/lib/domain/time";
import { closeDb, getDb } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { seedStatic } from "@/lib/server/db/seed";
import { importCafeSalesCore, loadCafeView, previewCafeSalesCore, saveCafeItemCore } from "@/lib/server/dal/cafe";
import { loadMetricsView, pnlFor, resolvePeriod } from "@/lib/server/dal/metrics";
import { cancelExpenseCore, closeShiftCore, openShiftCore, recordExpenseCore, type OpsActor } from "@/lib/server/dal/ops";
import { eveningReport, runEveningReport, runFeedbackDigest, runMarketReminder, scheduleWeek, sendDayReport } from "@/lib/server/dal/reports";
import { upsertStaff } from "@/lib/server/dal/staff";
import { countStockCore, onHandMap, payDebtCore, receiveStockCore, recordDebtCore, wasteCore } from "@/lib/server/dal/stock";
import { handleTelegramUpdate, type TelegramUpdate } from "@/lib/server/ops/telegram-bot";
import type { Period } from "@/lib/domain/worktime";

// Chỉ số & báo cáo (§17.10, M11) — bộ dữ liệu mẫu một tháng: tháng 2/2027 (file khác dùng ngày khác).
//
// Doanh thu: café (Sapo) 1.500.000 + 500.000 (02/02) + 1.000.000 (03/02) = 3.000.000; pizza (đơn hoàn tất 06/02) 1.000.000.
// Kho pizza: tồn đầu 2.000 g mozzarella × 200đ = 400.000 (nhập 31/01) · nhập 1.000 g × 200đ = 200.000 · huỷ 100 g ·
//   kiểm kê đếm 2.400 g (sổ 2.900) → tồn cuối 2.400 × 200 = 480.000 → giá vốn 120.000 (= hao hụt).
// Kho café: nhập 1.000 g hạt × 400đ = 400.000 · Sapo 02/02 Espresso × 10 (18 g/ly) → −180 g → giá vốn 72.000.
// Mua ngoài kho: đá viên 50.000 (café) · bao bì 80.000 + phiếu nợ chỉ ghi nợ 480.000 (chung). Trả nợ 480.000 không tính lại.
// Vận hành: điện nước 300.000, marketing 200.000 (một chi phí 999.000 đã huỷ). Giờ công: Vy 16 giờ (25.000đ/giờ) + Mai 2 giờ (chưa có đơn giá).

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const P = "2027-02" as Period;
const d = (day: number) => `2027-02-${String(day).padStart(2, "0")}` as ISODate;
const at = (day: number, hhmm: string) => vnInstant(d(day), hhmm);
const db = getDb();
const people: Record<"owner" | "manager" | "barista" | "kitchen", OpsActor> = {} as never;
const ctx = (who: keyof typeof people, now: Date) => ({ actor: people[who], now, db });
const ok = <R extends { ok: boolean }>(r: R) => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<R, { ok: true }>;
};
const OWNER_TG = 9101;
const MANAGER_TG = 9102;
const GROUP = -100_909;

let espressoId = 0;

async function shift(day: number, cafeCash: number, cafeTransfer: number, counted: number, by: keyof typeof people = "barista") {
  const open = ok(await openShiftCore({ counts: {} }, ctx(by, at(day, "07:00"))));
  const tens = counted / 10_000;
  return ok(
    await closeShiftCore(
      { shiftId: open.shiftId, counts: tens ? { "10000": tens } : {}, cafeCash, cafeTransfer, cafeOther: 0, sapoPhoto: "sapo.jpg", drop: 0, note: "" },
      ctx(by, at(day, "22:00")),
    ),
  );
}

async function pizzaDay(date: ISODate) {
  await db.insert(t.serviceDays).values({ date }).onConflictDoNothing();
  const [b] = await db
    .insert(t.batches)
    .values({ serviceDate: date, readyAt: vnInstant(date, "18:00"), ovenAt: vnInstant(date, "17:30"), cutoffAt: vnInstant(date, "16:00"), capPan: 6, capBbq: 4, usedPan: 3, usedBbq: 0 })
    .returning();
  return b;
}

async function order(date: ISODate, batchId: number, seq: number, total: number, status: "completed" | "cancelled" | "confirmed", pay: "cod" | "transfer" = "transfer") {
  const [c] = await db.insert(t.customers).values({ phone: `09880${String(seq).padStart(5, "0")}`, name: `Khách ${seq}` }).returning({ id: t.customers.id });
  const [pp] = await db.select().from(t.pickupPoints).limit(1);
  const [row] = await db
    .insert(t.orders)
    .values({
      code: `M${seq}-${randomBytes(3).toString("hex")}`,
      seq,
      serviceDate: date,
      batchId,
      customerId: c.id,
      customerName: `Khách ${seq}`,
      customerPhone: `09880${String(seq).padStart(5, "0")}`,
      fulfillment: "pickup",
      pickupPointId: pp.id,
      subtotal: total,
      total,
      paymentMethod: pay,
      paymentStatus: pay === "transfer" ? "paid" : "unpaid",
      status,
      trackingToken: randomBytes(16).toString("base64url"),
      idempotencyKey: randomUUID(),
    })
    .returning({ id: t.orders.id });
  return row.id;
}

beforeAll(async () => {
  await seedStatic(db);
  // Giá trị tồn kho = mọi dòng kho từ trước → bỏ dòng "Ra lò" mà file test khác để lại (thứ tự file không cố định).
  await db.delete(t.stockMoves);
  await db.delete(t.staff);
  const mk = async (name: string, roles: Role[], tg?: number) => {
    const id = await upsertStaff({ name, roles, pin: "123456" }, db);
    if (tg) await db.update(t.staff).set({ telegramUserId: tg }).where(eq(t.staff.id, id));
    return { id, name, roles };
  };
  people.owner = await mk("Chủ M11", ["owner"], OWNER_TG);
  people.manager = await mk("Quản lý Mai", ["manager"], MANAGER_TG);
  people.barista = await mk("Pha chế Vy", ["barista"]);
  people.kitchen = await mk("Bếp Tâm", ["kitchen"]);

  // ── Kho pizza ──
  ok(await receiveStockCore({ ingredientId: "mozzarella", qty: 2000, amount: 400_000, pay: { kind: "expense", source: "petty" } }, ctx("owner", vnInstant("2027-01-31" as ISODate, "10:00"))));
  ok(await receiveStockCore({ ingredientId: "mozzarella", qty: 1000, amount: 200_000, pay: { kind: "expense", source: "petty" } }, ctx("owner", at(5, "10:00"))));
  ok(await wasteCore({ ingredientId: "mozzarella", qty: 100, reason: "dropped" }, ctx("kitchen", at(6, "12:00"))));
  ok(await countStockCore({ kind: "weekly", lines: [{ ingredientId: "mozzarella", counted: 2400 }] }, ctx("owner", at(7, "21:00"))));

  // ── Kho café ──
  ok(await receiveStockCore({ ingredientId: "coffee-beans", qty: 1000, amount: 400_000, pay: { kind: "expense", source: "petty" } }, ctx("owner", at(2, "06:30"))));
  const [esp] = await db.select().from(t.cafeItems).where(eq(t.cafeItems.name, "Espresso"));
  espressoId = esp.id;
  ok(await saveCafeItemCore({ id: esp.id, name: "Espresso", aliases: ["Cà phê Espresso"], price: 35_000, isActive: true, lines: [{ ingredientId: "coffee-beans", qty: 18 }] }, ctx("manager", at(2, "06:40"))));

  // ── Ca & doanh thu café ──
  await shift(2, 1_500_000, 500_000, 1_500_000);
  await shift(3, 1_000_000, 0, 980_000);

  // ── Pizza ──
  const b = await pizzaDay(d(6));
  await order(d(6), b.id, 1, 600_000, "completed");
  await order(d(6), b.id, 2, 400_000, "completed", "cod");
  await order(d(6), b.id, 3, 300_000, "cancelled");

  // ── Chi phí ──
  ok(await recordExpenseCore({ amount: 50_000, description: "đá viên", category: "nl-cafe", source: "petty", spentAt: at(2, "08:00") }, ctx("manager", at(2, "08:00"))));
  ok(await recordExpenseCore({ amount: 80_000, description: "ly giấy", category: "bao-bi", source: "petty", spentAt: at(4, "08:00") }, ctx("manager", at(4, "08:00"))));
  ok(await recordExpenseCore({ amount: 300_000, description: "tiền điện", category: "dien-nuoc", source: "bank", spentAt: at(10, "08:00") }, ctx("owner", at(10, "08:00"))));
  ok(await recordExpenseCore({ amount: 200_000, description: "in tờ rơi", category: "marketing", source: "petty", spentAt: at(11, "08:00") }, ctx("owner", at(11, "08:00"))));
  const wrong = ok(await recordExpenseCore({ amount: 999_000, description: "ghi nhầm", category: "khac", source: "petty", spentAt: at(12, "08:00") }, ctx("owner", at(12, "08:00"))));
  ok(await cancelExpenseCore(wrong.id, ctx("owner", at(12, "08:05"))));
  // Phiếu nợ chỉ ghi nợ (không bấm nhập kho) rồi trả nợ trong tháng.
  ok(await recordDebtCore({ supplier: "Cô Nhiều M11", lines: [{ text: "sting", qty: 2, unit: "thùng", amount: null }], amount: 480_000 }, ctx("owner", at(8, "09:00"))));
  ok(await payDebtCore({ supplier: "Cô Nhiều M11", amount: 480_000, source: "bank" }, ctx("owner", at(20, "09:00"))));

  // ── Giờ công ──
  const vy = people.barista.id;
  await db.insert(t.timeEntries).values([
    { staffId: vy, clockIn: at(2, "07:00"), clockOut: at(2, "15:00") },
    { staffId: vy, clockIn: at(3, "07:10"), clockOut: at(3, "15:10") },
    { staffId: people.manager.id, clockIn: at(4, "09:00"), clockOut: at(4, "11:00") },
  ]);
  await db.insert(t.payRates).values({ staffId: vy, hourlyRate: 25_000, effectiveFrom: "2027-01-01" as ISODate });
  await db.insert(t.shiftPlans).values([
    { staffId: vy, date: d(2), start: "07:00", end: "15:00" },
    { staffId: vy, date: d(3), start: "07:00", end: "15:00" },
  ]);
});

afterAll(async () => {
  await db.delete(t.feedback);
  await db.delete(t.orders).where(gte(t.orders.serviceDate, "2027-01-01" as ISODate));
  await db.delete(t.customers).where(like(t.customers.phone, "09880%"));
  await db.delete(t.serviceDays).where(gte(t.serviceDays.date, "2027-01-01" as ISODate));
  await db.delete(t.stockMoves);
  await db.delete(t.stockCounts);
  await db.delete(t.cafeSales);
  await db.update(t.expenses).set({ supplierId: null });
  await db.delete(t.supplierBills);
  await db.delete(t.expenses);
  await db.delete(t.suppliers);
  await db.delete(t.cashEntries);
  await db.delete(t.shifts);
  await db.delete(t.timeEntries);
  await db.delete(t.payRates);
  await db.delete(t.shiftPlans);
  await db.delete(t.opsEvents);
  await db.delete(t.telegramUpdates);
  await db.update(t.ingredients).set({ avgCost: 0 });
  await db.delete(t.staff);
  await closeDb();
});

describe("kho café: nhập báo cáo Sapo (§17.10)", () => {
  it("xem trước khớp tên Sapo; nhập trừ kho theo định lượng một lần mỗi ngày (song song cũng một lần)", async () => {
    const lines = [
      { name: "Cà phê Espresso", qty: 10, revenue: 350_000 },
      { name: "Bánh mì que", qty: 3, revenue: 30_000 },
    ];
    const pre = ok(await previewCafeSalesCore({ date: d(2), lines }, ctx("barista", at(2, "22:10"))));
    expect(pre.lines.map((l) => [l.name, l.item])).toEqual([
      ["Cà phê Espresso", "Espresso"],
      ["Bánh mì que", null],
    ]);
    expect(pre.already).toBe(false);
    expect((await previewCafeSalesCore({ date: d(2), lines }, ctx("kitchen", at(2, "22:10")))).ok).toBe(false);

    const [a, b] = await Promise.all([
      importCafeSalesCore({ date: d(2), lines }, ctx("barista", at(3, "08:00"))),
      importCafeSalesCore({ date: d(2), lines }, ctx("manager", at(3, "08:00"))),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    const done = (a.ok ? a : b) as Extract<typeof a, { ok: true }>;
    expect(done).toMatchObject({ matched: 1, unmatched: ["Bánh mì que"], moves: 1 });
    expect((a.ok ? b : a) as unknown).toEqual({ ok: false, reason: "duplicate" });
    expect((await onHandMap(db, ["coffee-beans"])).get("coffee-beans")).toBe(820);
    // Ghi kho vào cuối ngày bán, không phải lúc nhập.
    const [m] = await db.select().from(t.stockMoves).where(eq(t.stockMoves.refType, "cafe_sale"));
    expect(m.createdAt.toISOString()).toBe(at(2, "23:59").toISOString());
    expect((await previewCafeSalesCore({ date: d(2), lines }, ctx("barista", at(3, "08:01")))).ok && (await previewCafeSalesCore({ date: d(2), lines }, ctx("barista", at(3, "08:01"))))).toMatchObject({ already: true });
    expect((await importCafeSalesCore({ date: d(9), lines }, ctx("barista", at(3, "08:00")))).ok).toBe(false); // ngày tương lai

    const view = (await loadCafeView(people.manager, at(3, "09:00"), db))!;
    const esp = view.items.find((i) => i.id === espressoId)!;
    expect(esp).toMatchObject({ price: 35_000, cost: 7200, gross: 27_800, pct: 79.4 });
    expect(view.imports[0]).toMatchObject({ date: d(2), matched: 1, cups: 10, unmatched: ["Bánh mì que"] });
    const bar = (await loadCafeView(people.barista, at(3, "09:00"), db))!;
    expect(bar.canManage).toBe(false);
    expect(JSON.stringify(bar.items)).not.toMatch(/"(price|cost|gross)"/);
    expect(await loadCafeView(people.kitchen, at(3, "09:00"), db)).toBeNull();
    expect((await saveCafeItemCore({ name: "Latte", aliases: [], price: 45_000, isActive: true, lines: [] }, ctx("barista", at(3, "09:00")))).ok).toBe(false);
    expect(await saveCafeItemCore({ name: "Espresso", aliases: [], price: 1, isActive: true, lines: [] }, ctx("owner", at(3, "09:00")))).toEqual({ ok: false, reason: "duplicate" });
  });
});

describe("chỉ số tháng mẫu (§17.10)", () => {
  it("owner: P&L theo mảng khớp bộ dữ liệu mẫu", async () => {
    const v = (await loadMetricsView(people.owner, at(28, "12:00"), { period: P }, db))!;
    expect(v.revenue.month).toEqual({ pizza: 1_000_000, cafe: 3_000_000 });
    expect(v.revenue.today).toEqual({ pizza: 0, cafe: 0 });
    expect(v.daily).toEqual([
      { date: d(2), pizza: 0, cafe: 2_000_000 },
      { date: d(3), pizza: 0, cafe: 1_000_000 },
      { date: d(6), pizza: 1_000_000, cafe: 0 },
    ]);
    const [pizza, cafe] = v.pnl.segments;
    expect(pizza).toEqual({ segment: "pizza", revenue: 1_000_000, stockCogs: 120_000, directCogs: 0, cogs: 120_000, foodCostPct: 12, gross: 880_000, shrink: 120_000 });
    expect(cafe).toEqual({ segment: "cafe", revenue: 3_000_000, stockCogs: 72_000, directCogs: 50_000, cogs: 122_000, foodCostPct: 4.1, gross: 2_878_000, shrink: 0 });
    expect(v.pnl.sharedCogs).toBe(560_000);
    expect(v.pnl.cogs).toBe(802_000);
    expect(v.pnl.gross).toBe(3_198_000);
    expect(v.pnl.opex).toEqual([
      { category: "dien-nuoc", amount: 300_000 },
      { category: "marketing", amount: 200_000 },
    ]);
    expect(v.pnl.beforeLabor).toBe(2_698_000);
    expect(v.pnl.labor).toBe(400_000);
    expect(v.laborNote).toEqual({ estimated: true, missingRate: 1 });
    expect(v.pnl.net).toBe(2_298_000);
    expect(v.pnl.laborPct).toBe(10);
    expect(v.laborMinutes).toBe(1080);
    expect(v.revenuePerHour).toBe(222_222);
    // Lệch két: 03/02 đếm 980.000 / đáng có 1.000.000.
    expect(v.cash.map((c) => [c.box, c.by, c.variance])).toEqual([
      ["register", "Pha chế Vy", -20_000],
      ["register", "Pha chế Vy", 0],
    ]);
    // Chi phí theo nhóm (dòng tiền — gồm cả hàng nhập kho & trả nợ), không có chứng từ đã huỷ.
    expect(Object.fromEntries(v.expenses.map((e) => [e.category, e.amount]))).toMatchObject({ "nl-pizza": 200_000, "nl-cafe": 450_000, "bao-bi": 80_000, "dien-nuoc": 300_000, marketing: 200_000 });
    expect(v.expenses.some((e) => e.category === "khac" && e.amount === 999_000)).toBe(false);
    expect(v.ops.late).toBe(1);
    expect(v.ops.fillRate).toBe(30);

    // Có phiếu lương → dùng tổng phiếu lương thay số ước tính.
    const [ts] = await db.insert(t.timesheets).values({ staffId: people.barista.id, period: P }).returning({ id: t.timesheets.id });
    await db.insert(t.payslips).values({ staffId: people.barista.id, period: P, timesheetId: ts.id, lines: [], total: 450_000 });
    const real = await pnlFor(P, people.owner, db);
    expect(real.pnl.labor).toBe(450_000);
    expect(real.estimated).toBe(false);
    await db.delete(t.payslips);
    await db.delete(t.timesheets);
  });

  it("manager: cùng số liệu nhưng DTO không có trường chi phí nhân sự", async () => {
    const v = (await loadMetricsView(people.manager, at(28, "12:00"), { period: P }, db))!;
    expect(v.pnl.beforeLabor).toBe(2_698_000);
    for (const k of ["labor", "laborPct", "prime", "primePct", "net"]) expect(Object.keys(v.pnl)).not.toContain(k);
    expect(v).not.toHaveProperty("laborNote");
    expect(JSON.stringify(v)).not.toMatch(/labor"|"net"|prime/);
    expect(await loadMetricsView(people.barista, at(28, "12:00"), { period: P }, db)).toBeNull();
    // Kỳ tương lai → kỳ hiện tại.
    expect((await loadMetricsView(people.manager, at(28, "12:00"), { period: "2027-05" as Period }, db))!.period).toBe(P);
  });

  it("resolvePeriod cho /pl", () => {
    expect(resolvePeriod(null, d(10))).toBe(P);
    expect(resolvePeriod("--01", d(10))).toBe("2027-01");
    expect(resolvePeriod("--11", d(10))).toBe("2026-11");
    expect(resolvePeriod("2027-09", d(10))).toBe(P);
  });
});

describe("Telegram /pl và /lich", () => {
  const sent: { text: string; chat: number }[] = [];
  const api = async <T,>(method: string, body: object): Promise<T | null> => {
    const b = body as { text?: string; chat_id?: number };
    if (method === "sendMessage") sent.push({ text: String(b.text), chat: Number(b.chat_id) });
    return { message_id: sent.length } as T;
  };
  let updateId = 9_100_000;
  const msg = (text: string, from: number, chat: { id: number; type: string }): TelegramUpdate => ({
    update_id: ++updateId,
    message: { message_id: updateId, from: { id: from }, chat, text },
  });
  const deps = { api, now: at(28, "12:00"), db, allowedChats: [GROUP] };

  it("/pl chỉ trả lời owner trong chat riêng; nhóm và manager nhận lời từ chối", async () => {
    await handleTelegramUpdate(msg("/pl", OWNER_TG, { id: GROUP, type: "supergroup" }), deps);
    await handleTelegramUpdate(msg("/pl", MANAGER_TG, { id: MANAGER_TG, type: "private" }), deps);
    expect(sent.map((s) => s.text)).toEqual([expect.stringContaining("chỉ trả lời trong chat riêng"), expect.stringContaining("chỉ trả lời trong chat riêng")]);
    expect(sent.some((s) => s.text.includes("Nhân sự"))).toBe(false);
    await handleTelegramUpdate(msg("/pl 2", OWNER_TG, { id: OWNER_TG, type: "private" }), deps);
    const pl = sent.at(-1)!.text;
    expect(pl).toContain("📈 P&L tháng 02/2027");
    expect(pl).toContain("Doanh thu: 4.000.000đ");
    expect(pl).toContain("Nhân sự: 400.000đ (10%)");
    expect(pl).toContain("Lợi nhuận: 2.298.000đ");
  });

  it("/lich: lịch ca tuần (người đã liên kết)", async () => {
    await handleTelegramUpdate(msg("/lich", MANAGER_TG, { id: GROUP, type: "supergroup" }), { ...deps, now: at(3, "09:00") });
    expect(sent.at(-1)!.text).toBe(
      "🗓 Lịch ca tuần này (T2 01/02–CN 07/02)\nT2 01/02: —\nT3 02/02: Pha chế Vy 07:00–15:00\nT4 03/02: Pha chế Vy 07:00–15:00\nT5 04/02: —\nT6 05/02: —\nT7 06/02: —\nCN 07/02: —",
    );
    expect(await scheduleWeek(at(3, "09:00"), true, db)).toContain("tuần sau (T2 08/02–CN 14/02)");
  });
});

describe("báo cáo tối & cả ngày — một lần mỗi ngày", () => {
  it("cả ngày sau khi đóng ca: gửi một lần kể cả gọi song song", async () => {
    const texts: string[] = [];
    const send = async (s: string) => (texts.push(s), true);
    const res = await Promise.all([sendDayReport(at(3, "22:01"), send, db), sendDayReport(at(3, "22:02"), send, db), sendDayReport(at(3, "22:03"), send, db)]);
    expect(res.filter(Boolean)).toHaveLength(1);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain("📊 Tổng kết ngày T4 03/02");
    expect(texts[0]).toContain("Doanh thu: 1.000.000đ (café 1.000.000đ · pizza 0đ)");
    expect(texts[0]).toContain("Két (Pha chế Vy): lệch −20.000đ");
    // Gửi thất bại → không đánh dấu, lần sau gửi lại được.
    expect(await sendDayReport(at(2, "22:01"), async () => false, db)).toBe(false);
    expect(await sendDayReport(at(2, "22:05"), send, db)).toBe(true);
  });

  it("báo cáo tối pizza 20:15: chỉ ngày bán, một lần", async () => {
    const [b] = await db.select().from(t.batches).where(eq(t.batches.serviceDate, d(6)));
    const fb = await order(d(6), b.id, 4, 200_000, "completed", "cod");
    await db.insert(t.feedback).values({ orderId: fb, ratings: { "pepperoni-pan": 3, "ribs-sv": 1 }, createdAt: at(6, "19:30") });
    // Ngày bán kế tiếp có đơn chờ → cộng vào lượng cần mua.
    const next = await pizzaDay(d(13));
    await order(d(13), next.id, 5, 300_000, "confirmed");

    const r = (await eveningReport(at(6, "20:15"), db))!;
    expect(r).toMatchObject({ orders: 3, revenue: 1_200_000, transferPaid: 600_000, cod: 600_000, collected: 1_200_000, cancelled: 1, noShow: 0, next: d(13) });
    expect(r.taste).toMatchObject({ count: 1, avg: 2 });
    expect(r.stockA.find((s) => s.label.startsWith("Mozzarella"))?.onHand).toBe(2400);
    expect(await eveningReport(at(5, "20:15"), db)).toBeNull();

    const texts: string[] = [];
    const send = async (s: string) => (texts.push(s), true);
    expect(await runEveningReport(at(5, "20:15"), send, db)).toEqual({ eveningSent: false });
    const both = await Promise.all([runEveningReport(at(6, "20:15"), send, db), runEveningReport(at(6, "20:16"), send, db)]);
    expect(both.filter((x) => x.eveningSent)).toHaveLength(1);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain("🍕 Báo cáo tối pizza · T7 06/02");
    expect(texts[0]).toContain("Cần đặt cho T7 13/02");
  });

  it("nhắc đi chợ hôm trước ngày bán; tóm tắt góp ý tuần Thứ Hai (không có khoá AI → danh sách thô)", async () => {
    const texts: string[] = [];
    const send = async (s: string) => (texts.push(s), true);
    expect(await runMarketReminder(at(11, "15:45"), send, db)).toEqual({ marketSent: false }); // T5, mai không bán
    expect(await runMarketReminder(at(12, "15:45"), send, db)).toEqual({ marketSent: true }); // T6 12, mai bán
    expect(await runMarketReminder(at(12, "16:45"), send, db)).toEqual({ marketSent: false });
    expect(texts[0]).toContain("🛒 Đi chợ trước ngày bán T7 13/02");

    const summarize = vi.fn(async () => null);
    expect(await runFeedbackDigest(at(9, "15:45"), send, summarize, db)).toEqual({ digestSent: false }); // T3
    expect(await runFeedbackDigest(at(8, "15:45"), send, summarize, db)).toEqual({ digestSent: true }); // T2 08/02
    expect(summarize).toHaveBeenCalledWith([expect.stringContaining("· 1/3")]);
    expect(texts.at(-1)).toContain("💬 Góp ý tuần T2 01/02–CN 07/02 · 1 lượt");
    expect(await runFeedbackDigest(at(8, "16:45"), send, summarize, db)).toEqual({ digestSent: false });
    expect(await runFeedbackDigest(at(15, "15:45"), send, summarize, db)).toEqual({ digestSent: false }); // tuần không có góp ý
  });
});
