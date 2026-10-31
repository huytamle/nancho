import "server-only";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { copy } from "@/data/copy";
import { EXPENSE_CATEGORIES, expenseCode, isExpenseCategory, parseBotCommand } from "@/lib/domain/expense-command";
import { BOT_HELP, CATEGORY_LABEL, expenseSummaryText, expenseText } from "@/lib/ops-text";
import { verifyLinkToken } from "@/lib/server/auth/link-token";
import { getDb, type Db } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import {
  attachExpensePhotoCore,
  cancelExpenseCore,
  canSpend,
  expenseSummary,
  linkTelegramCore,
  monthOf,
  recordExpenseCore,
  saveFile,
  setExpenseCategoryCore,
  staffByTelegram,
  type OpsActor,
} from "@/lib/server/dal/ops";
import { pauseOvenCore, resumeOvenCore, SALE_DAY_ROLES } from "@/lib/server/dal/sale-day";
import {
  attachBillPhotoCore,
  debtRows,
  expenseStockOffer,
  payDebtCore,
  recordDebtCore,
  stockInBillCore,
  stockInExpenseCore,
  type StockOffer,
} from "@/lib/server/dal/stock";
import { billCode, billText, debtSummaryText, payDebtText, qtyText, stockInText } from "@/lib/stock-text";
import type { TelegramApi } from "@/lib/server/notify/telegram";
import { hasRole } from "@/lib/domain/roles";

// Bot vận hành (§17.4). Privacy mode BẬT → trong nhóm bot chỉ nhận lệnh `/…`, tin trả lời chính bot và nút bấm.
// Idempotent theo update_id. Chỉ nhận nhóm đã cấu hình (TELEGRAM_CHAT_ID / TELEGRAM_OPS_CHAT_ID) và chat riêng.

const User = z.looseObject({ id: z.number(), is_bot: z.boolean().optional() });
const Chat = z.looseObject({ id: z.number(), type: z.string() });
const Message = z.looseObject({
  message_id: z.number(),
  from: User.optional(),
  chat: Chat,
  text: z.string().optional(),
  caption: z.string().optional(),
  photo: z.array(z.looseObject({ file_id: z.string(), file_size: z.number().optional() })).optional(),
  reply_to_message: z.looseObject({ message_id: z.number(), from: User.optional() }).optional(),
});
export const TelegramUpdate = z.looseObject({
  update_id: z.number(),
  message: Message.optional(),
  callback_query: z
    .looseObject({ id: z.string(), from: User, data: z.string().optional(), message: z.looseObject({ message_id: z.number(), chat: Chat }).optional() })
    .optional(),
});
export type TelegramUpdate = z.infer<typeof TelegramUpdate>;

export type BotDeps = {
  api: TelegramApi;
  now: Date;
  db?: Db;
  download?: (fileId: string) => Promise<{ bytes: Buffer; mime: string } | null>;
  /** Mặc định đọc từ env; test truyền thẳng. */
  allowedChats?: number[];
  botUsername?: string;
};

const err = copy.admin.errors;
const NOT_LINKED = "Bạn chưa liên kết Telegram với app. Mở app → Vận hành → Nhân viên → [Liên kết Telegram].";
const NO_RIGHT = "Chỉ chủ quán/quản lý được ghi chi tiền.";

function allowed(deps: BotDeps): number[] {
  if (deps.allowedChats) return deps.allowedChats;
  return [process.env.TELEGRAM_CHAT_ID, process.env.TELEGRAM_OPS_CHAT_ID].filter(Boolean).map(Number);
}

const DEBT_HELP = "Cú pháp: /no Cô Nhiều 3 thùng sting, 2 thùng pepsi 480k — trả: /trano Cô Nhiều 480k [#tui|#ck] — xem: /congno";

/** Nút dưới tin chi phí; `offer` = nguyên liệu khớp → hỏi nhập kho (§17.8). */
const actionsKeyboard = (id: number, offer?: StockOffer | null) => ({
  inline_keyboard: [
    ...(offer
      ? [[{ text: `📦 Nhập kho ${qtyText(offer.qty, offer.unit)} ${offer.label}`, callback_data: `k:${id}` }, { text: "Chỉ chi phí", callback_data: `o:${id}` }]]
      : []),
    [{ text: "🏷 Đổi nhóm", callback_data: `c:${id}` }, { text: "❌ Huỷ", callback_data: `x:${id}` }],
  ],
});
const billKeyboard = (id: number, offers: StockOffer[]) => ({
  inline_keyboard: [[{ text: `📦 Nhập kho (${offers.map((o) => o.label).join(", ")})`, callback_data: `n:${id}` }, { text: "Chỉ ghi nợ", callback_data: `m:${id}` }]],
});
const categoryKeyboard = (id: number) => {
  const rows: { text: string; callback_data: string }[][] = [];
  EXPENSE_CATEGORIES.forEach((c, i) => {
    if (i % 2 === 0) rows.push([]);
    rows.at(-1)!.push({ text: CATEGORY_LABEL[c], callback_data: `s:${id}:${c}` });
  });
  rows.push([{ text: "↩ Quay lại", callback_data: `b:${id}` }]);
  return { inline_keyboard: rows };
};

type Result = "duplicate" | "ignored" | "handled";

export async function handleTelegramUpdate(update: TelegramUpdate, deps: BotDeps): Promise<Result> {
  const db = deps.db ?? getDb();
  const [fresh] = await db.insert(t.telegramUpdates).values({ updateId: update.update_id }).onConflictDoNothing().returning();
  if (!fresh) return "duplicate";
  try {
    if (update.callback_query) return await onCallback(update.callback_query, db, deps);
    if (update.message) return await onMessage(update.message, db, deps);
    return "ignored";
  } catch (e) {
    // Lỗi → nhả update_id để Telegram gửi lại thì xử lý được.
    await db.delete(t.telegramUpdates).where(eq(t.telegramUpdates.updateId, update.update_id));
    throw e;
  }
}

async function onMessage(msg: z.infer<typeof Message>, db: Db, deps: BotDeps): Promise<Result> {
  const chat = msg.chat;
  const isPrivate = chat.type === "private";
  if (!isPrivate && !allowed(deps).includes(chat.id)) return "ignored";
  const from = msg.from;
  if (!from || from.is_bot) return "ignored";
  const reply = (text: string, extra: object = {}) =>
    deps.api<{ message_id: number }>("sendMessage", { chat_id: chat.id, text, reply_parameters: { message_id: msg.message_id }, ...extra });

  const text = msg.text ?? msg.caption ?? "";
  const photo = msg.photo?.at(-1)?.file_id;
  const cmd = parseBotCommand(text, deps.botUsername ?? process.env.TELEGRAM_BOT_USERNAME);

  if (cmd?.kind === "link") {
    const staffId = verifyLinkToken(cmd.token, deps.now);
    const s = staffId ? await linkTelegramCore(staffId, from.id, deps.now, db) : null;
    await reply(s ? `✅ Đã liên kết với ${s.name}. Gõ /help để xem cách ghi chi phí.` : "Mã liên kết sai hoặc đã hết hạn (10 phút). Tạo lại trong app.");
    return "handled";
  }
  if (cmd?.kind === "help") {
    await reply(BOT_HELP);
    return "handled";
  }

  // Ảnh trả lời tin xác nhận của bot → đính kèm vào chứng từ (hoặc phiếu nợ NCC).
  if (!cmd) {
    if (!photo || !msg.reply_to_message?.from?.is_bot) return "ignored";
    const replyTo = msg.reply_to_message.message_id;
    const [e] = await db
      .select({ id: t.expenses.id })
      .from(t.expenses)
      .where(and(eq(t.expenses.telegramChatId, chat.id), eq(t.expenses.telegramMsgId, replyTo)));
    const [bill] = e
      ? []
      : await db
          .select({ id: t.supplierBills.id })
          .from(t.supplierBills)
          .where(and(eq(t.supplierBills.telegramChatId, chat.id), eq(t.supplierBills.telegramMsgId, replyTo)));
    if (!e && !bill) return "ignored";
    const actor = await staffByTelegram(from.id, db);
    if (!actor) {
      await reply(NOT_LINKED);
      return "handled";
    }
    const fileId = await storePhoto(photo, actor, db, deps);
    if (bill) {
      const res = await attachBillPhotoCore(bill.id, fileId, { actor, now: deps.now, db });
      await reply(res.ok ? `📎 Đã gắn ảnh vào ${billCode(bill.id)}.` : err[res.reason]);
      return "handled";
    }
    const res = await attachExpensePhotoCore(e.id, { fileId, telegramFileId: photo }, { actor, now: deps.now, db });
    await reply(res.ok ? `📎 Đã gắn ảnh vào ${expenseCode(e.id)}.` : err[res.reason]);
    return "handled";
  }

  // Khoá/mở lò (§18.1): chỉ người đã liên kết có vai owner/manager/kitchen — người khác bỏ qua im lặng.
  if (cmd.kind === "pause" || cmd.kind === "resume") {
    const who = await staffByTelegram(from.id, db);
    if (!who || !hasRole(who.roles, SALE_DAY_ROLES)) return "ignored";
    const ctx = { actor: who, now: deps.now, db };
    if (cmd.kind === "pause") {
      const res = await pauseOvenCore({ reason: cmd.reason, tomorrow: false }, ctx);
      await reply(res.ok ? res.telegram : copy.admin.lock.noDay);
    } else {
      const res = await resumeOvenCore(ctx);
      await reply(res.ok && res.telegram ? res.telegram : "Lò đang mở — không có gì để mở lại.");
    }
    return "handled";
  }

  const actor = await staffByTelegram(from.id, db);
  if (!actor) {
    await reply(NOT_LINKED);
    return "handled";
  }

  switch (cmd.kind) {
    case "invalid":
      await reply(
        cmd.reason === "code"
          ? "Cú pháp: /chihuy C123"
          : cmd.reason === "debt" || cmd.reason === "pay_debt"
            ? DEBT_HELP
            : `Chưa đọc được ${cmd.reason === "amount" ? "số tiền" : "nội dung chi"}.\n\n${BOT_HELP}`,
      );
      return "handled";
    case "debts": {
      if (!canSpend(actor)) {
        await reply(NO_RIGHT);
        return "handled";
      }
      await reply(debtSummaryText(await debtRows(db)));
      return "handled";
    }
    case "debt": {
      const fileId = photo && canSpend(actor) ? await storePhoto(photo, actor, db, deps) : null;
      const res = await recordDebtCore({ supplier: cmd.supplier, lines: cmd.lines, amount: cmd.amount, photo: fileId }, { actor, now: deps.now, db });
      if (!res.ok) {
        await reply(res.reason === "forbidden" ? NO_RIGHT : err[res.reason]);
        return "handled";
      }
      const text = billText({ id: res.billId, supplier: res.supplier, lines: res.lines, amount: cmd.amount, by: actor.name, debt: res.debt });
      const sent = await reply(text, res.stockable.length ? { reply_markup: billKeyboard(res.billId, res.stockable) } : {});
      if (sent) await db.update(t.supplierBills).set({ telegramChatId: chat.id, telegramMsgId: sent.message_id }).where(eq(t.supplierBills.id, res.billId));
      return "handled";
    }
    case "pay_debt": {
      const res = await payDebtCore({ supplier: cmd.supplier, amount: cmd.amount, source: cmd.source }, { actor, now: deps.now, db });
      if (!res.ok) {
        await reply(res.reason === "forbidden" ? NO_RIGHT : res.reason === "not_found" ? `Không thấy nhà cung cấp "${cmd.supplier}". Gõ /congno để xem tên.` : err[res.reason]);
        return "handled";
      }
      await reply(payDebtText({ ...res, amount: cmd.amount, source: cmd.source, expenseCode: expenseCode(res.expenseId) }));
      return "handled";
    }
    case "summary": {
      if (!canSpend(actor)) {
        await reply(NO_RIGHT);
        return "handled";
      }
      await reply(expenseSummaryText(await expenseSummary(monthOf(deps.now), db)));
      return "handled";
    }
    case "cancel": {
      const res = await cancelExpenseCore(cmd.id, { actor, now: deps.now, db });
      if (!res.ok) {
        await reply(err[res.reason]);
        return "handled";
      }
      await reply(`❌ Đã huỷ ${expenseCode(cmd.id)}.`);
      await refreshMessage(res.row, db, deps, true);
      return "handled";
    }
    case "expense": {
      if (!canSpend(actor)) {
        await reply(NO_RIGHT);
        return "handled";
      }
      const fileId = photo ? await storePhoto(photo, actor, db, deps) : null;
      const res = await recordExpenseCore(
        { amount: cmd.amount, description: cmd.description, category: cmd.category, source: cmd.source, photo: fileId, telegramFileId: photo ?? null },
        { actor, now: deps.now, db },
      );
      if (!res.ok) {
        await reply(err[res.reason]);
        return "handled";
      }
      const offer = await expenseStockOffer(res.id, db);
      const sent = await reply(expenseText({ id: res.id, ...cmd, by: actor.name }), { reply_markup: actionsKeyboard(res.id, offer) });
      if (sent) await db.update(t.expenses).set({ telegramChatId: chat.id, telegramMsgId: sent.message_id }).where(eq(t.expenses.id, res.id));
      return "handled";
    }
  }
}

async function storePhoto(fileId: string, actor: OpsActor, db: Db, deps: BotDeps): Promise<string | null> {
  const file = await deps.download?.(fileId);
  return file ? saveFile({ mime: file.mime, bytes: file.bytes, by: actor.id }, db) : null;
}

type ExpenseRow = typeof t.expenses.$inferSelect;

/** Sửa lại tin xác nhận gốc của bot sau khi đổi nhóm / huỷ. */
async function refreshMessage(row: ExpenseRow, db: Db, deps: BotDeps, cancelled = false) {
  if (!row.telegramChatId || !row.telegramMsgId) return;
  const [by] = await db.select({ name: t.staff.name }).from(t.staff).where(eq(t.staff.id, row.spentBy));
  await deps.api("editMessageText", {
    chat_id: row.telegramChatId,
    message_id: row.telegramMsgId,
    text: expenseText({ ...row, by: by?.name ?? "", cancelled: cancelled || row.cancelledAt !== null }),
    ...(cancelled || row.cancelledAt ? {} : { reply_markup: actionsKeyboard(row.id, await expenseStockOffer(row.id, db)) }),
  });
}

async function onCallback(cq: NonNullable<TelegramUpdate["callback_query"]>, db: Db, deps: BotDeps): Promise<Result> {
  const answer = (text?: string) => deps.api("answerCallbackQuery", { callback_query_id: cq.id, ...(text ? { text } : {}) });
  const m = cq.data?.match(/^([cbsxkonm]):(\d+)(?::([a-z-]+))?$/);
  const chat = cq.message?.chat;
  if (!m || !chat || (chat.type !== "private" && !allowed(deps).includes(chat.id))) {
    await answer();
    return "ignored";
  }
  const actor = await staffByTelegram(cq.from.id, db);
  if (!actor) {
    await answer(NOT_LINKED);
    return "handled";
  }
  const id = Number(m[2]);
  const ctx = { actor, now: deps.now, db };
  const editMarkup = (reply_markup: object) =>
    deps.api("editMessageReplyMarkup", { chat_id: chat.id, message_id: cq.message!.message_id, reply_markup });

  // Phiếu nợ NCC: [📦 Nhập kho] · [Chỉ ghi nợ].
  if (m[1] === "n" || m[1] === "m") {
    if (m[1] === "m") {
      await editMarkup({ inline_keyboard: [] });
      await answer("Chỉ ghi nợ, không nhập kho");
      return "handled";
    }
    const res = await stockInBillCore(id, ctx);
    if (!res.ok) {
      await answer(res.reason === "duplicate" ? "Phiếu này đã nhập kho rồi" : err[res.reason]);
      return "handled";
    }
    await editMarkup({ inline_keyboard: [] });
    await deps.api("sendMessage", { chat_id: chat.id, text: stockInText(res.items), reply_parameters: { message_id: cq.message!.message_id } });
    await answer("Đã nhập kho");
    return "handled";
  }

  const [row] = await db.select().from(t.expenses).where(eq(t.expenses.id, id));
  if (!row) {
    await answer(err.not_found);
    return "handled";
  }

  switch (m[1]) {
    case "c":
      if (row.spentBy !== actor.id && !canSpend(actor)) {
        await answer(err.forbidden);
        return "handled";
      }
      await editMarkup(categoryKeyboard(id));
      await answer();
      return "handled";
    case "b":
      await editMarkup(actionsKeyboard(id, await expenseStockOffer(id, db)));
      await answer();
      return "handled";
    case "o":
      await editMarkup(actionsKeyboard(id));
      await answer("Chỉ ghi chi phí, không nhập kho");
      return "handled";
    case "k": {
      const res = await stockInExpenseCore(id, ctx);
      if (!res.ok) {
        await answer(res.reason === "duplicate" ? "Chứng từ này đã nhập kho rồi" : err[res.reason]);
        return "handled";
      }
      await editMarkup(actionsKeyboard(id));
      await deps.api("sendMessage", { chat_id: chat.id, text: stockInText([res.offer]), reply_parameters: { message_id: cq.message!.message_id } });
      await answer("Đã nhập kho");
      return "handled";
    }
    case "s": {
      if (!m[3] || !isExpenseCategory(m[3])) {
        await answer(err.invalid);
        return "handled";
      }
      const res = await setExpenseCategoryCore(id, m[3], ctx);
      if (!res.ok) {
        await answer(err[res.reason]);
        return "handled";
      }
      await refreshMessage(res.row, db, deps);
      await answer(`Đã đổi sang ${CATEGORY_LABEL[m[3]]}`);
      return "handled";
    }
    default: {
      const res = await cancelExpenseCore(id, ctx);
      if (!res.ok) {
        await answer(err[res.reason]);
        return "handled";
      }
      await refreshMessage(res.row, db, deps, true);
      await answer(`Đã huỷ ${expenseCode(id)}`);
      return "handled";
    }
  }
}
