import { randomUUID } from "node:crypto";
import { and, eq, gte } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { vnInstant, type ISODate } from "@/lib/domain/time";
import type { PlaceOrderInput } from "@/lib/order-contract";
import { createLinkToken } from "@/lib/server/auth/link-token";
import { closeDb, getDb } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { seed } from "@/lib/server/db/seed";
import { advanceOrdersCore } from "@/lib/server/dal/admin";
import { loadCatalog } from "@/lib/server/dal/catalog";
import { runDaily } from "@/lib/server/dal/kitchen";
import {
  cancelExpenseCore,
  checkPettyCore,
  closeShiftCore,
  dropCashCore,
  expenseSummary,
  loadOpsView,
  openShiftCore,
  pettyState,
  recordExpenseCore,
  reimbursePocketCore,
  replenishPettyCore,
  reviewPocketCore,
  saveFile,
  sendMonthlyExpenseSummary,
  setStaffRolesCore,
  type OpsActor,
} from "@/lib/server/dal/ops";
import { placeOrderCore } from "@/lib/server/dal/orders";
import { handleTelegramUpdate, type TelegramUpdate } from "@/lib/server/ops/telegram-bot";

// Vận hành nội bộ (§17.2–17.4): ca & két (đếm mù), hộp chi định mức, chi phí & quyền, phân công, bot Telegram.
// Thứ Sáu 13/11/2026 (file khác dùng 06–08/11).

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const FRI = "2026-11-13" as ISODate;
const at = (hhmm: string, date: ISODate = FRI) => vnInstant(date, hhmm);
const db = getDb();
const GROUP = -100123;

let owner: OpsActor, manager: OpsActor, barista: OpsActor;

async function addStaff(name: string, roles: OpsActor["roles"], tg?: number): Promise<OpsActor> {
  const [s] = await db.insert(t.staff).values({ name, roles, pinHash: "x", telegramUserId: tg ?? null }).returning();
  return { id: s.id, name: s.name, roles: s.roles };
}

async function wipeOps() {
  await db.delete(t.expenses);
  await db.delete(t.cashEntries);
  await db.delete(t.shifts);
  await db.delete(t.opsFiles);
  await db.delete(t.opsEvents);
  await db.delete(t.telegramUpdates);
  await db.delete(t.settings).where(eq(t.settings.key, "ops"));
}

const counts = (n500: number, n100 = 0, n10 = 0) => ({ ...(n500 ? { "500000": n500 } : {}), ...(n100 ? { "100000": n100 } : {}), ...(n10 ? { "10000": n10 } : {}) });

beforeAll(async () => {
  await seed(db, at("08:00"));
  await wipeOps();
  await db.delete(t.staff);
  owner = await addStaff("Chủ", ["owner"], 1001);
  manager = await addStaff("Mai", ["manager", "barista"], 1002);
  barista = await addStaff("Vy", ["barista", "server"], 1003);
});
beforeEach(async () => {
  await wipeOps();
  await db.delete(t.orders);
  await db.delete(t.customers);
});
afterAll(async () => {
  await wipeOps();
  await db.delete(t.orders);
  await db.delete(t.customers);
  await db.delete(t.staff);
  await db.delete(t.serviceDays).where(gte(t.serviceDays.date, FRI));
  await closeDb();
});

async function codOrder(total: { now: Date }) {
  const catalog = await loadCatalog(db);
  const [b] = await db.select().from(t.batches).where(and(eq(t.batches.serviceDate, FRI), eq(t.batches.readyAt, at("18:00"))));
  const input: PlaceOrderInput = {
    idempotencyKey: randomUUID(),
    batchId: b.id,
    lines: [{ productId: "pepperoni-pan", qty: 1 }],
    customer: { phone: `09444${String(Math.floor(Math.random() * 1e5)).padStart(5, "0")}`, name: "Khách", remember: false },
    fulfillment: { type: "pickup", pickupPointId: 1 },
    paymentMethod: "cod",
    startedAt: 0,
  };
  const { result } = await placeOrderCore(input, input.customer.phone, { now: at("10:00"), catalog, db });
  if (!result.ok) throw new Error(result.reason);
  const [o] = await db.select().from(t.orders).where(eq(t.orders.code, result.code));
  const actor = { id: owner.id, roles: ["owner" as const] };
  for (const to of ["confirmed", "baking", "ready", "completed"] as const) await advanceOrdersCore([o.id], to, { actor, now: total.now, db });
  return o;
}

describe("ca & két", () => {
  it("mở → đóng: đáng có = đầu ca + TM café + COD − nộp giữa ca; lần mở sau so với số để lại", async () => {
    const first = await openShiftCore({ counts: counts(2) }, { actor: barista, now: at("14:00"), db });
    expect(first).toMatchObject({ ok: true, total: 1_000_000, expected: null, variance: null, telegram: null });
    // Chỉ một ca mở.
    expect(await openShiftCore({ counts: counts(2) }, { actor: owner, now: at("14:05"), db })).toEqual({ ok: false, reason: "shift_open" });
    if (!first.ok) return;

    const order = await codOrder({ now: at("18:10") });
    expect(await dropCashCore({ amount: 500_000 }, { actor: barista, now: at("19:00"), db })).toEqual({ ok: false, reason: "forbidden" });
    expect(await dropCashCore({ amount: 500_000 }, { actor: manager, now: at("19:00"), db })).toEqual({ ok: true });

    const base = { shiftId: first.shiftId, cafeCash: 2_350_000, cafeTransfer: 1_200_000, cafeOther: 0, drop: 1_000_000 };
    // Có doanh thu café mà không có ảnh Sapo → từ chối.
    expect(await closeShiftCore({ ...base, counts: counts(5), sapoPhoto: null }, { actor: barista, now: at("22:10"), db })).toEqual({ ok: false, reason: "photo_required" });
    const photo = await saveFile({ mime: "image/jpeg", bytes: Buffer.from([0xff, 0xd8, 0xff]), by: barista.id }, db);
    // Đáng có = 1.000.000 + 2.350.000 + COD − 500.000; đếm thiếu 20.000.
    const expected = 1_000_000 + 2_350_000 + order.total - 500_000;
    const counted = expected - 20_000;
    const n500 = Math.floor(counted / 500_000);
    const rest = counted - n500 * 500_000;
    const close = await closeShiftCore(
      { ...base, counts: { "500000": n500, ...(rest ? { "10000": rest / 10_000 } : {}) }, sapoPhoto: photo },
      { actor: barista, now: at("22:10"), db },
    );
    expect(close).toMatchObject({ ok: true, total: counted, expected, variance: -20_000, codCollected: order.total });
    if (!close.ok) return;
    expect(close.telegram).toContain("lệch −20.000đ");
    expect(close.telegram).toContain("Nộp về chủ: 1.000.000đ");
    expect(await closeShiftCore({ ...base, counts: counts(1), sapoPhoto: photo }, { actor: barista, now: at("22:11"), db })).toEqual({ ok: false, reason: "no_shift" });

    // Hôm sau: két phải còn counted − 1.000.000.
    const next = await openShiftCore({ counts: counts(1) }, { actor: barista, now: at("14:00", "2026-11-14" as ISODate), db });
    expect(next).toMatchObject({ ok: true, total: 500_000, expected: counted - 1_000_000 });
    if (next.ok) expect(next.telegram).toContain("Mở ca — két");
  });

  it("nộp về chủ không vượt số đếm; đóng ca không có café thì không cần ảnh", async () => {
    const s = await openShiftCore({ counts: counts(1) }, { actor: owner, now: at("14:00"), db });
    if (!s.ok) throw new Error();
    const base = { shiftId: s.shiftId, counts: counts(1), cafeCash: 0, cafeTransfer: 0, cafeOther: 0, sapoPhoto: null };
    expect(await closeShiftCore({ ...base, drop: 600_000 }, { actor: owner, now: at("22:00"), db })).toEqual({ ok: false, reason: "invalid" });
    expect(await closeShiftCore({ ...base, drop: 0 }, { actor: owner, now: at("22:00"), db })).toMatchObject({ ok: true, variance: 0, telegram: expect.stringContaining("khớp ✅") });
  });

  it("view: đếm mù — ca đang mở không lộ số đáng có", async () => {
    await openShiftCore({ counts: counts(2) }, { actor: barista, now: at("14:00"), db });
    const v = await loadOpsView(barista, at("15:00"), db);
    expect(v.openShift).toMatchObject({ opening: 1_000_000, expected: null, counted: null });
    expect(v.expenses).toEqual([]);
    expect(v.staff.map((s) => s.name)).toEqual(["Vy"]);
    expect(v.viewer).toMatchObject({ canSpend: false, isOwner: false });
  });
});

describe("hộp chi định mức", () => {
  it("chi → kiểm → nạp bù; hoàn tiền túi bằng hộp chi cũng rút từ hộp; khoản huỷ không tính", async () => {
    const ctx = { actor: manager, now: at("10:00"), db };
    await recordExpenseCore({ amount: 150_000, description: "đá viên", category: "nl-cafe", source: "petty" }, ctx);
    const cancelled = await recordExpenseCore({ amount: 90_000, description: "ly", category: "bao-bi", source: "petty" }, ctx);
    await recordExpenseCore({ amount: 320_000, description: "gas", category: "dien-nuoc", source: "bank" }, ctx);
    const pocket = await recordExpenseCore({ amount: 200_000, description: "phô mai", category: "nl-pizza", source: "pocket" }, ctx);
    if (!cancelled.ok || !pocket.ok) throw new Error();
    expect(await cancelExpenseCore(cancelled.id, ctx)).toMatchObject({ ok: true });
    expect(await pettyState(db)).toMatchObject({ float: 1_000_000, unreplenished: 150_000, expected: 850_000 });

    // Manager không tự duyệt tiền túi của mình; owner duyệt & hoàn bằng hộp chi.
    expect(await reviewPocketCore(pocket.id, "approve", ctx)).toEqual({ ok: false, reason: "self_review" });
    expect(await reimbursePocketCore(pocket.id, "petty", { ...ctx, actor: owner })).toEqual({ ok: false, reason: "locked" });
    expect(await reviewPocketCore(pocket.id, "approve", { ...ctx, actor: owner })).toEqual({ ok: true });
    expect(await reimbursePocketCore(pocket.id, "petty", { ...ctx, actor: owner })).toEqual({ ok: true });
    expect((await pettyState(db)).expected).toBe(650_000);

    const check = await checkPettyCore({ counts: { "500000": 1, "100000": 1, "50000": 1 } }, { ...ctx, actor: barista });
    expect(check).toMatchObject({ total: 650_000, expected: 650_000, variance: 0, telegram: null });
    const short = await checkPettyCore({ counts: { "500000": 1, "100000": 1 } }, { ...ctx, actor: barista });
    expect(short.telegram).toContain("Kiểm hộp chi");

    expect(await replenishPettyCore({ ...ctx, actor: manager })).toEqual({ ok: false, reason: "forbidden" });
    expect(await replenishPettyCore({ ...ctx, actor: owner })).toEqual({ ok: true, amount: 350_000, count: 2 });
    expect(await replenishPettyCore({ ...ctx, actor: owner })).toEqual({ ok: true, amount: 0, count: 0 });
    expect((await pettyState(db)).expected).toBe(1_000_000);
    // Đã nạp bù → khoá huỷ, kể cả owner.
    const [e] = await db.select().from(t.expenses).where(eq(t.expenses.description, "đá viên"));
    expect(await cancelExpenseCore(e.id, { ...ctx, actor: owner })).toEqual({ ok: false, reason: "locked" });
  });

  it("quyền chi & huỷ: nhân viên không ghi chi; người ghi huỷ trong 24 giờ; tổng tháng bỏ khoản bị từ chối", async () => {
    const ctx = { actor: manager, now: at("10:00"), db };
    expect(await recordExpenseCore({ amount: 10_000, description: "x", category: "khac", source: "petty" }, { ...ctx, actor: barista })).toEqual({
      ok: false,
      reason: "forbidden",
    });
    const a = await recordExpenseCore({ amount: 100_000, description: "bột", category: "nl-pizza", source: "petty" }, ctx);
    const b = await recordExpenseCore({ amount: 50_000, description: "xăng", category: "khac", source: "pocket" }, { ...ctx, actor: owner });
    if (!a.ok || !b.ok) throw new Error();
    expect(await cancelExpenseCore(a.id, { ...ctx, actor: barista })).toEqual({ ok: false, reason: "forbidden" });
    expect(await cancelExpenseCore(a.id, { ...ctx, now: at("10:01", "2026-11-14" as ISODate) })).toEqual({ ok: false, reason: "locked" });
    expect(await reviewPocketCore(b.id, "reject", ctx)).toEqual({ ok: true });
    const s = await expenseSummary("2026-11", db);
    expect(s).toMatchObject({ total: 100_000, count: 1, pendingPocket: 0, byCategory: [{ category: "nl-pizza", amount: 100_000 }] });
    const v = await loadOpsView(manager, at("11:00"), db);
    expect(v.expenses.find((e) => e.id === a.id)).toMatchObject({ canCancel: true, canReview: false });
    expect(v.expenses.find((e) => e.id === b.id)).toMatchObject({ status: "rejected", canReview: true });
  });

  it("cron ngày 1 gửi tổng chi tháng trước đúng một lần", async () => {
    await recordExpenseCore({ amount: 100_000, description: "bột", category: "nl-pizza", source: "petty" }, { actor: owner, now: at("10:00"), db });
    const send = vi.fn(async () => true);
    const dec1 = vnInstant("2026-12-01" as ISODate, "15:45");
    expect(await sendMonthlyExpenseSummary(at("15:45"), send, db)).toBe(false);
    expect(await sendMonthlyExpenseSummary(dec1, send, db)).toBe(true);
    expect(await sendMonthlyExpenseSummary(dec1, send, db)).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toEqual([expect.stringContaining("📊 Chi phí tháng 11/2026: 100.000đ")]);
    // runDaily vẫn chạy được với phần vận hành.
    expect(await runDaily(dec1, send, db)).toMatchObject({ expenseSummarySent: false });
  });
});

describe("phân công vai trò", () => {
  it("manager đổi vai nghiệp vụ, không cấp quản lý; owner được", async () => {
    const ctx = { actor: manager, now: at("10:00"), db };
    expect(await setStaffRolesCore(barista.id, ["barista", "kitchen"], ctx)).toEqual({ ok: true });
    expect(await setStaffRolesCore(barista.id, ["manager"], ctx)).toEqual({ ok: false, reason: "forbidden" });
    expect(await setStaffRolesCore(owner.id, ["kitchen"], { ...ctx, actor: owner })).toEqual({ ok: false, reason: "forbidden" });
    expect(await setStaffRolesCore(barista.id, ["barista", "server"], { ...ctx, actor: owner })).toEqual({ ok: true });
    expect(await setStaffRolesCore(9999, ["barista"], ctx)).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("bot Telegram", () => {
  type Call = { method: string; body: Record<string, unknown> };
  let calls: Call[];
  let msgId: number;
  const api = async <T,>(method: string, body: object): Promise<T | null> => {
    calls.push({ method, body: body as Record<string, unknown> });
    return (method === "sendMessage" ? { message_id: ++msgId } : true) as T;
  };
  let updateId = 0;
  const deps = () => ({
    api,
    now: at("10:00"),
    db,
    allowedChats: [GROUP],
    botUsername: "TheHeatBot",
    download: async () => ({ bytes: Buffer.from([1, 2, 3]), mime: "image/jpeg" }),
  });
  const message = (from: number, text: string | undefined, extra: object = {}, chat = { id: GROUP, type: "supergroup" }): TelegramUpdate => ({
    update_id: ++updateId,
    message: { message_id: 500 + updateId, from: { id: from }, chat, ...(text !== undefined ? { text } : {}), ...extra },
  });
  const lastText = () => calls.filter((c) => c.method === "sendMessage").at(-1)?.body.text as string;

  beforeEach(() => {
    calls = [];
    msgId = 9000;
  });

  it("/chi ghi chứng từ, lưu id tin xác nhận; ảnh trả lời được đính kèm; gửi lại update không ghi đôi", async () => {
    const u = message(1002, "/chi@TheHeatBot 150k đá viên");
    expect(await handleTelegramUpdate(u, deps())).toBe("handled");
    expect(await handleTelegramUpdate(u, deps())).toBe("duplicate");
    const [e] = await db.select().from(t.expenses);
    expect(e).toMatchObject({ amount: 150_000, description: "đá viên", category: "nl-cafe", source: "petty", spentBy: manager.id, telegramChatId: GROUP, telegramMsgId: 9001 });
    expect(lastText()).toContain("🧾 C");
    expect(calls[0].body.reply_markup).toBeTruthy();

    await handleTelegramUpdate(message(1002, undefined, { photo: [{ file_id: "small" }, { file_id: "big" }], reply_to_message: { message_id: 9001, from: { id: 1, is_bot: true } } }), deps());
    const [withPhoto] = await db.select().from(t.expenses);
    expect(withPhoto.telegramFileId).toBe("big");
    expect(withPhoto.photo).toMatch(/^[0-9a-f-]{36}$/);
    expect(lastText()).toContain("📎 Đã gắn ảnh");
  });

  it("nút đổi nhóm & huỷ; /chihuy; /tonghop", async () => {
    await handleTelegramUpdate(message(1001, "/chi 85k ly nhựa"), deps());
    const [e] = await db.select().from(t.expenses);
    const cb = (data: string): TelegramUpdate => ({
      update_id: ++updateId,
      callback_query: { id: "q", from: { id: 1001 }, data, message: { message_id: 9001, chat: { id: GROUP, type: "supergroup" } } },
    });
    await handleTelegramUpdate(cb(`c:${e.id}`), deps());
    expect(calls.some((c) => c.method === "editMessageReplyMarkup")).toBe(true);
    await handleTelegramUpdate(cb(`s:${e.id}:marketing`), deps());
    expect((await db.select().from(t.expenses))[0].category).toBe("marketing");
    expect(calls.find((c) => c.method === "editMessageText")?.body.text).toContain("Marketing");

    await handleTelegramUpdate(message(1001, "/tonghop"), deps());
    expect(lastText()).toContain("85.000đ");
    await handleTelegramUpdate(message(1003, `/chihuy C${e.id}`), deps());
    expect(lastText()).toBe("Bạn không có quyền làm việc này.");
    await handleTelegramUpdate(cb(`x:${e.id}`), deps());
    expect((await db.select().from(t.expenses))[0].cancelledAt).not.toBeNull();
    await handleTelegramUpdate(message(1001, `/chihuy C${e.id}`), deps());
    expect(lastText()).toContain("đã khoá");
  });

  it("nhóm lạ bị bỏ qua; người chưa liên kết được nhắc; nhân viên không được chi; cú pháp sai được hướng dẫn", async () => {
    expect(await handleTelegramUpdate(message(1001, "/chi 10k ly", {}, { id: -999, type: "group" }), deps())).toBe("ignored");
    expect(await handleTelegramUpdate(message(1001, "chào cả nhà"), deps())).toBe("ignored");
    await handleTelegramUpdate(message(7777, "/chi 10k ly"), deps());
    expect(lastText()).toContain("chưa liên kết");
    await handleTelegramUpdate(message(1003, "/chi 10k ly"), deps());
    expect(lastText()).toContain("Chỉ chủ quán/quản lý");
    await handleTelegramUpdate(message(1001, "/chi đá viên"), deps());
    expect(lastText()).toContain("số tiền");
    expect(await db.$count(t.expenses)).toBe(0);
  });

  it("/start <mã> liên kết tài khoản; mã sai/hết hạn bị từ chối", async () => {
    const dm = { id: 4242, type: "private" };
    await handleTelegramUpdate(message(4242, `/start ${createLinkToken(barista.id, at("09:55"))}`, {}, dm), deps());
    expect(lastText()).toContain("✅ Đã liên kết với Vy");
    expect((await db.select().from(t.staff).where(eq(t.staff.id, barista.id)))[0].telegramUserId).toBe(4242);
    await handleTelegramUpdate(message(4243, `/start ${createLinkToken(barista.id, at("09:00"))}`, {}, dm), deps());
    expect(lastText()).toContain("hết hạn");
    await handleTelegramUpdate(message(4243, "/start AAAAAAAAAAAAAAAAAAAAAAAAAAA", {}, dm), deps());
    expect(lastText()).toContain("hết hạn");
    await db.update(t.staff).set({ telegramUserId: 1003 }).where(eq(t.staff.id, barista.id));
  });
});
