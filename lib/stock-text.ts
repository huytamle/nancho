// Văn bản kho & công nợ (§17.8, M10): nhãn dùng chung UI + tin Telegram. Thuần — test được, không gửi gì.

import type { ExpenseSource } from "@/lib/domain/expense-command";
import type { BillLine, CountLine, MoveKind, StockFlag, StockLevel, WasteReason } from "@/lib/domain/stock";
import { vnDateOf } from "@/lib/domain/time";
import { formatPrice } from "@/lib/format";
import { SOURCE_LABEL } from "@/lib/ops-text";

export const LEVEL_LABEL: Record<StockLevel, string> = { raw: "Nguyên liệu thô", prep: "Bán thành phẩm", goods: "Hàng dùng/bán thẳng" };

export const MOVE_LABEL: Record<MoveKind, string> = {
  purchase: "Nhập",
  produce_in: "Sản xuất",
  produce_out: "Dùng để sản xuất",
  sale: "Bán",
  waste: "Huỷ",
  adjust: "Kiểm kê",
};

export const REASON_LABEL: Record<WasteReason, string> = { expired: "Hết hạn", dropped: "Rơi/đổ", burnt: "Lỗi nướng", other: "Khác" };

export const FLAG_LABEL: Record<StockFlag, string> = { below_par: "Dưới mức", expiring: "Sắp hết hạn", expired: "Hết hạn", negative: "Sổ âm" };

/** "+5%" · "−5,5%" · "0%". */
export const pctText = (p: number) => `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toLocaleString("vi-VN")}%`;

/** Mã phiếu nợ hiển thị: N12. */
export const billCode = (id: number) => `N${id}`;

/** "5.000 g" · "1,5 đế" — số theo kiểu Việt, tối đa 3 chữ số lẻ. */
export function qtyText(qty: number, unit: string): string {
  return `${qty.toLocaleString("vi-VN", { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ""}`;
}

/** Dòng hàng trên phiếu nợ: "3 thùng sting · 300.000đ". */
export function billLineText(l: Pick<BillLine, "qty" | "unit" | "text" | "amount">): string {
  const unit = l.unit ? ` ${l.unit}` : "";
  const qty = l.qty !== null ? `${l.qty.toLocaleString("vi-VN", { maximumFractionDigits: 3 })}${unit} ` : "";
  return `${qty}${l.text}${l.amount !== null ? ` · ${formatPrice(l.amount)}` : ""}`;
}

export type BillNotice = { id: number; supplier: string; lines: BillLine[]; amount: number | null; by: string; debt: number; stocked?: string[] };

export function billText(b: BillNotice): string {
  const head = `📒 ${billCode(b.id)} · Nợ ${b.supplier} · ${b.amount !== null ? formatPrice(b.amount) : "chưa có giá"}`;
  const lines = b.lines.map((l) => `• ${billLineText(l)}`).join("\n");
  const stocked = b.stocked?.length ? `\n📦 Đã nhập kho: ${b.stocked.join(", ")}` : "";
  return `${head}\n${lines}\n${b.by} · Tổng nợ ${b.supplier}: ${formatPrice(b.debt)}${stocked}\n↩ Trả lời tin này bằng ảnh phiếu giao hàng để đính kèm.`;
}

export type PayDebtNotice = { supplier: string; amount: number; source: ExpenseSource; expenseCode: string; closed: number; leftover: number; remaining: number; unknown: number };

export function payDebtText(p: PayDebtNotice): string {
  const lines = [
    `💸 Trả nợ ${p.supplier} · ${formatPrice(p.amount)} · ${SOURCE_LABEL[p.source]} (${p.expenseCode})`,
    p.closed > 0 ? `Đã đóng ${p.closed} phiếu.` : "Chưa đủ đóng phiếu nào — đã trừ dần vào phiếu cũ nhất.",
    `Còn nợ: ${formatPrice(p.remaining)}${p.unknown > 0 ? ` + ${p.unknown} phiếu chưa có giá` : ""}`,
  ];
  if (p.leftover > 0) lines.push(`⚠ Trả dư ${formatPrice(p.leftover)} so với các phiếu đang nợ — kiểm tra lại.`);
  return lines.join("\n");
}

export type DebtRow = { name: string; debt: number; bills: number; unknown: number; oldest: Date };

export function debtSummaryText(rows: DebtRow[]): string {
  if (rows.length === 0) return "✅ Không còn nợ nhà cung cấp nào.";
  const total = rows.reduce((s, r) => s + r.debt, 0);
  const body = rows
    .map((r) => `• ${r.name}: ${formatPrice(r.debt)} · ${r.bills} phiếu${r.unknown ? ` (${r.unknown} chưa có giá)` : ""} · từ ${dmy(r.oldest)}`)
    .join("\n");
  return `📒 Công nợ nhà cung cấp — tổng ${formatPrice(total)}\n${body}`;
}

const dmy = (d: Date) => {
  const [y, m, day] = vnDateOf(d).split("-");
  return `${day}/${m}/${y.slice(2)}`;
};

export function stockInText(items: { label: string; qty: number; unit: string }[]): string {
  return `📦 Đã nhập kho ${items.map((i) => `${qtyText(i.qty, i.unit)} ${i.label}`).join(", ")}.`;
}

export type CountAlertLine = Pick<CountLine, "book" | "counted" | "diff" | "pct"> & { label: string; unit: string };

export function stockCountAlertText(c: { kind: "quick" | "weekly"; by: string; lines: CountAlertLine[]; value?: number }): string {
  const head = `${c.kind === "quick" ? "⚠ Kiểm nhanh lệch" : "📋 Kiểm kê tuần"} — ${c.by}`;
  const body = c.lines
    .map((l) => `• ${l.label}: sổ ${qtyText(l.book, l.unit)}, đếm ${qtyText(l.counted, l.unit)} (${l.diff > 0 ? "+" : "−"}${qtyText(Math.abs(l.diff), l.unit)}${l.pct !== null ? `, ${pctText(l.pct)}` : ""})`)
    .join("\n");
  const value = c.value !== undefined ? `\nHao hụt/dư: ${c.value < 0 ? "−" : "+"}${formatPrice(Math.abs(c.value))}` : "";
  return `${head}\n${body}${value}`;
}

export type StockAlert = { label: string; onHand: number; unit: string; parLevel: number | null; flags: StockFlag[] };

export function stockAlertText(items: StockAlert[]): string {
  const body = items
    .map((i) => `• ${i.label}: còn ${qtyText(i.onHand, i.unit)}${i.parLevel !== null && i.flags.includes("below_par") ? ` (mức tối thiểu ${qtyText(i.parLevel, i.unit)})` : ""} — ${i.flags.map((f) => FLAG_LABEL[f]).join(", ")}`)
    .join("\n");
  return `🧊 Kho cần chú ý\n${body}`;
}
