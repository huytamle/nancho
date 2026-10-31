// Lệnh bot Telegram cho chi phí (BLUEPRINT §17.4). Thuần: chuỗi tin nhắn → ý định có kiểu.
//
//   /chi 150k đá viên            → hộp chi (mặc định)
//   /chi 1tr2 phô mai 5kg #tui   → tiền túi (chờ hoàn)
//   /chi 320.000 gas #ck         → chuyển khoản từ TK hộ kinh doanh
//   /chihuy C123 · /tonghop · /start <mã liên kết> · /help
//   /khoalo [lý do] · /molo        → khoá/mở lò khẩn cấp (§18.1)
//   /no Cô Nhiều 3 thùng sting, 2 thùng pepsi 480k → phiếu nợ nhà cung cấp (§17.8, M10)
//   /trano Cô Nhiều 480k [#tui|#ck] · /congno       → trả nợ (ghi một chi phí) · nợ còn lại theo NCC
//   /lich [tuần sau] · /pl [10 | 2026-10]           → lịch ca tuần · P&L tháng theo mảng (M11, §17.10)

import { fold, parseAmount } from "@/lib/domain/money-text";
import { parseDebt, type DebtDraft } from "@/lib/domain/stock";

export const EXPENSE_SOURCES = ["petty", "pocket", "bank"] as const;
export type ExpenseSource = (typeof EXPENSE_SOURCES)[number];

export const EXPENSE_CATEGORIES = ["nl-pizza", "nl-cafe", "bao-bi", "dien-nuoc", "sua-chua", "ve-sinh", "marketing", "khac"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const isExpenseCategory = (v: string): v is ExpenseCategory => (EXPENSE_CATEGORIES as readonly string[]).includes(v);

/** Từ khoá (không dấu) đoán nhóm — xét theo thứ tự, cụm dài nên đứng trước cụm ngắn trùng chữ. */
export const DEFAULT_EXPENSE_KEYWORDS: [ExpenseCategory, string[]][] = [
  ["ve-sinh", ["nuoc rua", "xa phong", "khan lau", "choi", "lau nha", "tui rac", "ve sinh", "gang tay"]],
  ["dien-nuoc", ["gas", "binh ga", "tien dien", "tien nuoc", "nuoc may", "internet", "wifi"]],
  ["sua-chua", ["sua may", "sua tu", "sua lo", "bao tri", "linh kien", "tho sua"]],
  ["marketing", ["in an", "quang cao", "ads", "banner", "to roi", "standee", "boost"]],
  ["bao-bi", ["hop pizza", "hop", "ly", "nap", "ong hut", "tui", "giay", "bang keo", "tem", "khay"]],
  ["nl-pizza", ["bot", "men", "pho mai", "phomai", "mozzarella", "pepperoni", "suon", "xuc xich", "ca chua", "sot", "bo", "toi", "oregano", "dau olive", "hanh tay"]],
  ["nl-cafe", ["ca phe", "cafe", "hat", "sua", "da vien", "da", "duong", "tra", "siro", "kem", "gelato", "chanh", "cam", "trai cay", "ca cao", "matcha"]],
];

/** Đoán nhóm theo từ khoá (khớp nguyên từ, không dấu); không khớp → "khac". */
export function guessCategory(description: string, keywords = DEFAULT_EXPENSE_KEYWORDS): ExpenseCategory {
  const text = ` ${fold(description).replace(/[^a-z0-9]+/g, " ")} `;
  for (const [cat, words] of keywords) {
    if (words.some((w) => text.includes(` ${fold(w)} `))) return cat;
  }
  return "khac";
}

const SOURCE_TAGS: Record<string, ExpenseSource> = {
  tui: "pocket",
  tientui: "pocket",
  "tien-tui": "pocket",
  ck: "bank",
  bank: "bank",
  nganhang: "bank",
  hop: "petty",
  hopchi: "petty",
};

/** Số lượng kèm đơn vị trong mô tả ("5kg", "500 g", "2 bao") — dùng cho nhập kho (M10). kg/l quy về g/ml. */
export type Quantity = { value: number; unit: string };
const QTY = /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(kg|g|gr|gram|l|lit|ml|bao|hu|chai|thung|hop|tui|cai|goi|bich|lon|khay)(?=\s|$)/;

export function parseQuantity(description: string): Quantity | null {
  const m = fold(description).match(QTY);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  const unit = m[2];
  if (unit === "kg") return { value: Math.round(n * 1000), unit: "g" };
  if (unit === "l" || unit === "lit") return { value: Math.round(n * 1000), unit: "ml" };
  if (unit === "gr" || unit === "gram") return { value: n, unit: "g" };
  return { value: n, unit };
}

export type ExpenseDraft = {
  amount: number;
  description: string;
  source: ExpenseSource;
  category: ExpenseCategory;
  quantity: Quantity | null;
};

export type BotCommand =
  | ({ kind: "expense" } & ExpenseDraft)
  | { kind: "cancel"; id: number }
  | { kind: "summary" }
  | { kind: "link"; token: string }
  | { kind: "help" }
  | { kind: "pause"; reason: string }
  | { kind: "resume" }
  | ({ kind: "debt" } & DebtDraft)
  | { kind: "pay_debt"; supplier: string; amount: number; source: ExpenseSource }
  | { kind: "debts" }
  | { kind: "schedule"; next: boolean }
  | { kind: "pnl"; period: string | null }
  | { kind: "invalid"; reason: "amount" | "description" | "code" | "debt" | "pay_debt" };

/** Mã chứng từ hiển thị: C123. */
export const expenseCode = (id: number) => `C${id}`;
export function parseExpenseCode(raw: string): number | null {
  const m = raw.trim().match(/^c?(\d{1,9})$/i);
  return m ? Number(m[1]) : null;
}

/**
 * Tin nhắn → lệnh. Trả null nếu không phải lệnh của bot (trong nhóm, `/lenh@TenBotKhac` là của bot khác).
 * Số tiền là cụm đầu tiên đọc được (có thể nằm sau mô tả: "/chi đá viên 150k").
 */
export function parseBotCommand(text: string, botUsername?: string): BotCommand | null {
  const m = text.trim().match(/^\/([a-z]+)(?:@(\w+))?(?:\s+([\s\S]*))?$/i);
  if (!m) return null;
  if (m[2] && botUsername && m[2].toLowerCase() !== botUsername.toLowerCase()) return null;
  const cmd = m[1].toLowerCase();
  const rest = (m[3] ?? "").trim();
  switch (cmd) {
    case "chi":
      return parseExpense(rest);
    case "chihuy": {
      const id = parseExpenseCode(rest);
      return id ? { kind: "cancel", id } : { kind: "invalid", reason: "code" };
    }
    case "tonghop":
      return { kind: "summary" };
    case "start":
      return rest ? { kind: "link", token: rest } : { kind: "help" };
    case "help":
      return { kind: "help" };
    case "khoalo":
      return { kind: "pause", reason: rest.slice(0, 80) };
    case "molo":
      return { kind: "resume" };
    case "no": {
      const d = parseDebt(rest);
      return d ? { kind: "debt", ...d } : { kind: "invalid", reason: "debt" };
    }
    case "trano":
      return parsePayDebt(rest);
    case "congno":
      return { kind: "debts" };
    case "lich":
      return { kind: "schedule", next: /^(tuan )?sau$|^next$/.test(fold(rest)) };
    case "pl":
      return { kind: "pnl", period: parsePeriodArg(rest) };
    default:
      return null;
  }
}

/** "/pl 10" · "/pl t10" → "--10" (năm do nơi gọi suy ra); "/pl 2026-10" · "/pl 10/2026" → "2026-10"; khác → null (tháng này). */
export function parsePeriodArg(rest: string): string | null {
  const s = fold(rest.trim()).replace(/^thang\s*|^t/, "");
  const iso = s.match(/^(\d{4})-(\d{1,2})$/);
  const vn = s.match(/^(\d{1,2})\/(\d{4})$/);
  const [y, mo] = iso ? [iso[1], iso[2]] : vn ? [vn[2], vn[1]] : ["-", s.match(/^\d{1,2}$/)?.[0]];
  const n = Number(mo);
  return mo && n >= 1 && n <= 12 ? `${y}-${String(n).padStart(2, "0")}` : null;
}

/** Tách thẻ nguồn tiền (#tui, #ck, #hop) khỏi các từ còn lại. */
function splitSource(rest: string): { source: ExpenseSource; words: string[] } {
  let source: ExpenseSource = "petty";
  const words: string[] = [];
  for (const w of rest.split(/\s+/).filter(Boolean)) {
    const tag = w.startsWith("#") ? SOURCE_TAGS[fold(w.slice(1))] : undefined;
    if (tag) source = tag;
    else words.push(w);
  }
  return { source, words };
}

/** `/trano Cô Nhiều 480k #ck` — số tiền là cụm cuối, NCC là phần trước. */
function parsePayDebt(rest: string): BotCommand {
  const { source, words } = splitSource(rest);
  const amount = words.length >= 2 ? parseAmount(words.at(-1)!) : null;
  const supplier = words.slice(0, -1).join(" ").trim();
  return amount !== null && supplier ? { kind: "pay_debt", supplier: supplier.slice(0, 60), amount, source } : { kind: "invalid", reason: "pay_debt" };
}

function parseExpense(rest: string): BotCommand {
  const { source, words } = splitSource(rest);
  // Số tiền: thử cụm 2 từ trước ("150 k", "2 triệu"), rồi 1 từ.
  let amount: number | null = null;
  for (let i = 0; i < words.length && amount === null; i++) {
    for (const len of [2, 1]) {
      const v = i + len <= words.length ? parseAmount(words.slice(i, i + len).join(" ")) : null;
      if (v !== null && !(len === 1 && /^\d+$/.test(words[i]) && i + 1 < words.length && QTY_UNIT.test(fold(words[i + 1])))) {
        amount = v;
        words.splice(i, len);
        break;
      }
    }
  }
  if (amount === null) return { kind: "invalid", reason: "amount" };
  const description = words.join(" ").trim().slice(0, 200);
  if (!description) return { kind: "invalid", reason: "description" };
  return { kind: "expense", amount, description, source, category: guessCategory(description), quantity: parseQuantity(description) };
}

// "5 kg" — số trước đơn vị là số lượng, không phải tiền.
const QTY_UNIT = /^(kg|g|gr|gram|l|lit|ml|bao|hu|chai|thung|hop|tui|cai|goi|bich|lon|khay)$/;
