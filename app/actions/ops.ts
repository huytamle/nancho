"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { after } from "next/server";
import * as z from "zod";
import type { AdminResult } from "@/lib/admin-contract";
import { normalizeCounts, type CashCounts } from "@/lib/domain/cash";
import { CHECKLIST_MOMENTS, ITEM_ID, MAX_ITEMS, SLUG } from "@/lib/domain/checklist";
import { EXPENSE_CATEGORIES, EXPENSE_SOURCES } from "@/lib/domain/expense-command";
import { MAX_AMOUNT } from "@/lib/domain/money-text";
import { ROLES } from "@/lib/domain/roles";
import { expenseText } from "@/lib/ops-text";
import { createLinkToken } from "@/lib/server/auth/link-token";
import { currentStaff } from "@/lib/server/auth/session";
import { serverNow } from "@/lib/server/clock";
import { getDb } from "@/lib/server/db/client";
import { markChecklistItemCore, saveChecklistTemplateCore } from "@/lib/server/dal/checklist";
import { saveHandbookPageCore } from "@/lib/server/dal/handbook";
import * as t from "@/lib/server/db/schema";
import {
  cancelExpenseCore,
  checkPettyCore,
  closeShiftCore,
  dropCashCore,
  FILE_MAX_BYTES,
  FILE_TYPES,
  openShiftCore,
  recordExpenseCore,
  reimbursePocketCore,
  replenishPettyCore,
  reviewPocketCore,
  saveFile,
  saveOpsSettingsCore,
  setExpenseCategoryCore,
  linkClerkCore,
  requestStaffAccessCore,
  reviewStaffRequestCore,
  setStaffRolesCore,
} from "@/lib/server/dal/ops";
import { clerkUserId } from "@/lib/server/auth/clerk";
import { PIN_RE } from "@/lib/server/dal/staff";
import { clientIp, MIN, rateLimit } from "@/lib/server/rate-limit";
import { sendDayReport } from "@/lib/server/dal/reports";
import { sendTelegram, telegramApi } from "@/lib/server/notify/telegram";
import { runOps, notifyOps } from "@/lib/server/ops/run";

// Mutation màn Vận hành (§17): zod → phiên → DAL (kiểm quyền nghiệp vụ) → refresh(). Tin Telegram gửi trong after().

const money = z.number().int().min(0).max(MAX_AMOUNT);
const positive = z.number().int().min(1).max(MAX_AMOUNT);
const id = z.number().int().positive();
const note = z.string().trim().max(200).optional();
const counts = z.record(z.string(), z.unknown()).transform((v, c) => {
  const n = normalizeCounts(v);
  if (!n) c.addIssue({ code: "custom", message: "counts" });
  return n as CashCounts;
});
const fileId = z.uuid();

const run = runOps;
const notify = notifyOps;

type CountResult = AdminResult<{ total: number; expected: number | null; variance: number | null }>;

const Open = z.object({ counts, note });
export async function openShift(raw: z.input<typeof Open>): Promise<CountResult> {
  return run(Open, raw, async (i, actor, now) => {
    const res = await openShiftCore(i, { actor, now });
    if (!res.ok) return res;
    notify(res.telegram);
    return { ok: true, total: res.total, expected: res.expected, variance: res.variance };
  });
}

const Close = z.object({
  shiftId: id,
  counts,
  cafeCash: money,
  cafeTransfer: money,
  cafeOther: money,
  sapoPhoto: fileId.nullable(),
  drop: money,
  note,
});
export async function closeShift(raw: z.input<typeof Close>): Promise<CountResult> {
  return run(Close, raw, async (i, actor, now) => {
    const res = await closeShiftCore(i, { actor, now });
    if (!res.ok) return res;
    notify(res.telegram);
    // Báo cáo cả ngày (§17.10) ngay sau khi đóng ca café — một lần mỗi ngày, sau tin đóng ca.
    after(() => sendDayReport(now, sendTelegram).then(() => undefined));
    return { ok: true, total: res.total, expected: res.expected, variance: res.variance };
  });
}

const Drop = z.object({ amount: positive, note });
export async function dropCash(raw: z.input<typeof Drop>) {
  return run(Drop, raw, (i, actor, now) => dropCashCore(i, { actor, now }));
}

const Petty = z.object({ counts });
export async function checkPetty(raw: z.input<typeof Petty>): Promise<CountResult> {
  return run(Petty, raw, async (i, actor, now) => {
    const res = await checkPettyCore(i, { actor, now });
    notify(res.telegram);
    return { ok: true, total: res.total, expected: res.expected, variance: res.variance };
  });
}

export async function replenishPetty() {
  return run(z.object({}), {}, (_i, actor, now) => replenishPettyCore({ actor, now }));
}

const Expense = z.object({
  amount: positive,
  description: z.string().trim().min(1).max(200),
  category: z.enum(EXPENSE_CATEGORIES),
  source: z.enum(EXPENSE_SOURCES),
  photo: fileId.nullable(),
});
export async function recordExpense(raw: z.input<typeof Expense>) {
  return run(Expense, raw, async (i, actor, now) => {
    const res = await recordExpenseCore(i, { actor, now });
    if (!res.ok) return res;
    // Tin vào nhóm vận hành kèm nút → chủ quán thấy ngay; trả lời tin bằng ảnh để đính kèm hoá đơn.
    const chatId = process.env.TELEGRAM_OPS_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
    after(async () => {
      if (!chatId) return;
      const sent = await telegramApi<{ message_id: number }>("sendMessage", {
        chat_id: Number(chatId),
        text: expenseText({ id: res.id, ...i, by: actor.name }),
        reply_markup: { inline_keyboard: [[{ text: "🏷 Đổi nhóm", callback_data: `c:${res.id}` }, { text: "❌ Huỷ", callback_data: `x:${res.id}` }]] },
      });
      if (sent) await getDb().update(t.expenses).set({ telegramChatId: Number(chatId), telegramMsgId: sent.message_id }).where(eq(t.expenses.id, res.id));
    });
    return { ok: true as const, id: res.id };
  });
}

const ById = z.object({ id });
export async function cancelExpense(raw: z.input<typeof ById>) {
  return run(ById, raw, async (i, actor, now) => {
    const res = await cancelExpenseCore(i.id, { actor, now });
    return res.ok ? { ok: true as const } : res;
  });
}

const Category = z.object({ id, category: z.enum(EXPENSE_CATEGORIES) });
export async function setExpenseCategory(raw: z.input<typeof Category>) {
  return run(Category, raw, async (i, actor, now) => {
    const res = await setExpenseCategoryCore(i.id, i.category, { actor, now });
    return res.ok ? { ok: true as const } : res;
  });
}

const Review = z.object({ id, decision: z.enum(["approve", "reject"]) });
export async function reviewPocket(raw: z.input<typeof Review>) {
  return run(Review, raw, (i, actor, now) => reviewPocketCore(i.id, i.decision, { actor, now }));
}

const Reimburse = z.object({ id, from: z.enum(["petty", "bank"]) });
export async function reimbursePocket(raw: z.input<typeof Reimburse>) {
  return run(Reimburse, raw, (i, actor, now) => reimbursePocketCore(i.id, i.from, { actor, now }));
}

const Roles = z.object({ staffId: id, roles: z.array(z.enum(ROLES)).min(1).max(ROLES.length) });
export async function setStaffRoles(raw: z.input<typeof Roles>) {
  return run(Roles, raw, (i, actor, now) => setStaffRolesCore(i.staffId, i.roles, { actor, now }));
}

// ── Nhân viên qua Clerk (M12) ──

const Request = z.object({ name: z.string().trim().min(2).max(40), roles: z.array(z.enum(ROLES)).min(1).max(ROLES.length), pin: z.string().regex(PIN_RE) });
/** Người đã đăng nhập Clerk xin vào nội bộ (chưa là nhân viên → không qua runOps). */
export async function requestStaffAccess(raw: z.input<typeof Request>): Promise<AdminResult> {
  const parsed = Request.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const uid = await clerkUserId();
    if (!uid) return { ok: false, reason: "forbidden" };
    const now = serverNow();
    if (!(await rateLimit([{ key: "staff-request:ip:" + (await clientIp()), limit: 5, windowSec: 60 * MIN }], now))) return { ok: false, reason: "rate_limited" };
    const res = await requestStaffAccessCore({ clerkUserId: uid, ...parsed.data }, now);
    if (res.ok) {
      notify("🙋 " + parsed.data.name + " xin vào nội bộ — duyệt ở Vận hành → Nhân viên.");
      refresh();
    }
    return res;
  } catch (err) {
    console.error(JSON.stringify({ evt: "staff_request_failed", error: String(err) }));
    return { ok: false, reason: "server_error" };
  }
}

const ReviewRequest = z.object({ staffId: id, decision: z.enum(["approve", "reject"]), roles: z.array(z.enum(ROLES)).max(ROLES.length) });
export async function reviewStaffRequest(raw: z.input<typeof ReviewRequest>) {
  return run(ReviewRequest, raw, (i, actor, now) => reviewStaffRequestCore(i, { actor, now }));
}

/** Gắn tài khoản Clerk đang đăng nhập vào nhân viên của phiên PIN hiện tại. */
export async function linkClerk(): Promise<AdminResult> {
  return run(z.object({}), {}, async (_i, actor) => {
    const uid = await clerkUserId();
    if (!uid) return { ok: false, reason: "forbidden" };
    return linkClerkCore(actor.id, uid);
  });
}

const OpsSettings = z.object({ cashTolerance: z.number().int().min(0).max(1_000_000), pettyFloat: z.number().int().min(0).max(50_000_000) });
export async function saveOpsSettings(raw: z.input<typeof OpsSettings>) {
  return run(OpsSettings, raw, (i, actor, now) => saveOpsSettingsCore(i, { actor, now }));
}

/** Link liên kết Telegram cho chính mình (hết hạn 10 phút). Không đổi dữ liệu → không refresh. */
export async function telegramLink(): Promise<AdminResult<{ url: string }>> {
  const staff = await currentStaff();
  if (!staff) return { ok: false, reason: "forbidden" };
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  if (!bot) return { ok: false, reason: "not_found" };
  return { ok: true, url: `https://t.me/${bot}?start=${createLinkToken(staff.id, serverNow())}` };
}

/** Tải ảnh (client đã nén ≤ 1 MB). Trả id để gắn vào ca/chứng từ. */
export async function uploadOpsPhoto(form: FormData): Promise<AdminResult<{ id: string }>> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > FILE_MAX_BYTES || !(FILE_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, reason: "invalid" };
  }
  try {
    const staff = await currentStaff();
    if (!staff) return { ok: false, reason: "forbidden" };
    const fid = await saveFile({ mime: file.type, bytes: Buffer.from(await file.arrayBuffer()), by: staff.id });
    return { ok: true, id: fid };
  } catch (err) {
    console.error(JSON.stringify({ evt: "upload_failed", error: String(err) }));
    return { ok: false, reason: "server_error" };
  }
}

// ── Checklist & sổ tay (M8, §17.5–17.6) ──

const measure = z.number().min(-100).max(1000);
const Mark = z.object({
  templateId: id,
  itemId: z.string().regex(ITEM_ID),
  value: measure.nullable().optional(),
  photo: fileId.nullable().optional(),
  undo: z.boolean().optional(),
});
export async function markChecklistItem(raw: z.input<typeof Mark>): Promise<AdminResult<{ complete: boolean; out: boolean }>> {
  return run(Mark, raw, async (i, actor, now) => {
    const res = await markChecklistItemCore(i, { actor, now });
    if (!res.ok) return res;
    notify(res.telegram);
    return { ok: true, complete: res.complete, out: res.out };
  });
}

const roles = z.array(z.enum(ROLES)).min(1).max(ROLES.length);
const Item = z.object({
  id: z.string().regex(ITEM_ID),
  label: z.string().trim().min(1).max(120),
  photo: z.boolean().optional(),
  value: z.object({ unit: z.string().trim().max(10), min: measure.optional(), max: measure.optional() }).optional(),
});
const Template = z.object({
  id: id.optional(),
  title: z.string().trim().min(1).max(80),
  roles,
  moment: z.enum(CHECKLIST_MOMENTS),
  items: z.array(Item).min(1).max(MAX_ITEMS),
  sort: z.number().int().min(0).max(999),
  isActive: z.boolean(),
});
export async function saveChecklistTemplate(raw: z.input<typeof Template>) {
  return run(Template, raw, (i, actor, now) => saveChecklistTemplateCore(i, { actor, now }));
}

const Page = z.object({
  id: id.optional(),
  slug: z.string().max(60).regex(SLUG),
  title: z.string().trim().min(1).max(80),
  kind: z.enum(["sop", "recipe"]),
  roles,
  body: z.string().max(20_000),
  productId: z.string().max(60).nullable(),
});
export async function saveHandbookPage(raw: z.input<typeof Page>) {
  return run(Page, raw, (i, actor, now) => saveHandbookPageCore(i, { actor, now }));
}
