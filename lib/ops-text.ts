// Văn bản vận hành (§17): nhãn dùng chung UI + tin Telegram. Thuần — test được, không gửi gì.

import { varianceLevel } from "@/lib/domain/cash";
import { expenseCode, type ExpenseCategory, type ExpenseSource } from "@/lib/domain/expense-command";
import type { Role } from "@/lib/domain/roles";
import { formatPrice } from "@/lib/format";

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  "nl-pizza": "Nguyên liệu pizza",
  "nl-cafe": "Nguyên liệu café",
  "bao-bi": "Bao bì",
  "dien-nuoc": "Gas/điện/nước",
  "sua-chua": "Sửa chữa",
  "ve-sinh": "Vệ sinh",
  marketing: "Marketing",
  khac: "Khác",
};

export const SOURCE_LABEL: Record<ExpenseSource, string> = { petty: "Hộp chi", pocket: "Tiền túi", bank: "Chuyển khoản" };

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Chủ quán",
  manager: "Quản lý",
  kitchen: "Bếp",
  server: "Phục vụ",
  barista: "Pha chế",
  shipper: "Giao hàng",
};

/** "+20.000đ" · "−20.000đ" · "0đ" */
export const signed = (n: number) => (n > 0 ? `+${formatPrice(n)}` : n < 0 ? `−${formatPrice(-n)}` : formatPrice(0));

export function varianceText(variance: number, tolerance: number): string {
  const level = varianceLevel(variance, tolerance);
  if (level === "ok") return "khớp ✅";
  return `lệch ${signed(variance)}${level === "major" ? " ⚠" : ""}`;
}

export type ExpenseNotice = {
  id: number;
  amount: number;
  category: ExpenseCategory;
  source: ExpenseSource;
  description: string;
  by: string;
  cancelled?: boolean;
};

export function expenseText(e: ExpenseNotice): string {
  const head = `🧾 ${expenseCode(e.id)} · ${formatPrice(e.amount)} · ${e.description}`;
  const meta = `${CATEGORY_LABEL[e.category]} · ${SOURCE_LABEL[e.source]}${e.source === "pocket" ? " (chờ duyệt hoàn)" : ""} · ${e.by}`;
  if (e.cancelled) return `❌ Đã huỷ — ${head}\n${meta}`;
  return `${head}\n${meta}\n↩ Trả lời tin này bằng ảnh hoá đơn để đính kèm.`;
}

export type ExpenseSummary = {
  label: string;
  total: number;
  count: number;
  byCategory: { category: ExpenseCategory; amount: number }[];
  bySource: { source: ExpenseSource; amount: number }[];
  pendingPocket: number;
  previousTotal?: number | null;
};

export function expenseSummaryText(s: ExpenseSummary): string {
  if (s.count === 0) return `📊 Chi phí ${s.label}: chưa có khoản nào.`;
  const lines = [`📊 Chi phí ${s.label}: ${formatPrice(s.total)} · ${s.count} khoản`];
  if (s.previousTotal) {
    const pct = Math.round(((s.total - s.previousTotal) / s.previousTotal) * 100);
    lines.push(`So với kỳ trước: ${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}% (${formatPrice(s.previousTotal)})`);
  }
  for (const c of [...s.byCategory].sort((a, b) => b.amount - a.amount)) lines.push(`• ${CATEGORY_LABEL[c.category]}: ${formatPrice(c.amount)}`);
  lines.push(s.bySource.map((x) => `${SOURCE_LABEL[x.source]} ${formatPrice(x.amount)}`).join(" · "));
  if (s.pendingPocket > 0) lines.push(`⏳ Tiền túi chờ hoàn: ${formatPrice(s.pendingPocket)}`);
  return lines.join("\n");
}

export type ShiftCloseNotice = {
  date: string;
  by: string;
  counted: number;
  expected: number;
  tolerance: number;
  cafeCash: number;
  cafeTransfer: number;
  cafeOther: number;
  codCollected: number;
  drop: number;
};

export function shiftClosedText(s: ShiftCloseNotice): string {
  return [
    `🔒 Đóng ca ${s.date} · ${s.by}`,
    `Két: ${formatPrice(s.counted)} · ${varianceText(s.counted - s.expected, s.tolerance)}`,
    `Café (Sapo): TM ${formatPrice(s.cafeCash)} · CK/MoMo ${formatPrice(s.cafeTransfer)}${s.cafeOther ? ` · khác ${formatPrice(s.cafeOther)}` : ""}`,
    s.codCollected ? `Pizza COD: ${formatPrice(s.codCollected)}` : null,
    s.drop ? `Nộp về chủ: ${formatPrice(s.drop)} · để lại két ${formatPrice(s.counted - s.drop)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function countAlertText(p: { what: "open" | "petty"; by: string; counted: number; expected: number; tolerance: number }): string {
  const name = p.what === "open" ? "Mở ca — két" : "Kiểm hộp chi";
  return `${p.what === "open" ? "🔓" : "📦"} ${name} · ${p.by}: ${formatPrice(p.counted)} · ${varianceText(p.counted - p.expected, p.tolerance)} (đáng có ${formatPrice(p.expected)})`;
}

export const BOT_HELP = [
  "Ghi chi phí (chủ quán/quản lý):",
  "/chi 150k đá viên — hộp chi",
  "/chi 1tr2 phô mai 5kg #tui — tiền túi, chờ hoàn",
  "/chi 320.000 gas #ck — chuyển khoản",
  "Trả lời tin xác nhận bằng ảnh để đính kèm hoá đơn.",
  "/chihuy C123 — huỷ (trong 24 giờ)",
  "/tonghop — tổng chi tháng này",
].join("\n");
