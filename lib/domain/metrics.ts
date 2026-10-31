// Chỉ số quản lý & P&L (BLUEPRINT §17.10, M11). Thuần — tiền là int VND, % làm tròn 1 chữ số lẻ.
//
// Giá vốn theo kho = tồn đầu + nhập − tồn cuối (giá trị theo đơn giá ghi trên từng dòng kho). Đồ mua không qua kho
// (nhóm chi nguyên liệu/bao bì không nhập kho, phiếu nợ chỉ ghi nợ) cộng vào giá vốn theo mảng của nhóm chi.
// Tách theo mảng: pizza · café; bao bì và phiếu nợ không nhập kho là "chung".

import type { ExpenseCategory } from "@/lib/domain/expense-command";

export const SEGMENTS = ["pizza", "cafe"] as const;
export type Segment = (typeof SEGMENTS)[number];
export const isSegment = (v: string): v is Segment => (SEGMENTS as readonly string[]).includes(v);

/** Nhóm chi là giá vốn (nguyên liệu/bao bì) → mảng; null = chung. */
export const COGS_CATEGORY: Partial<Record<ExpenseCategory, Segment | null>> = { "nl-pizza": "pizza", "nl-cafe": "cafe", "bao-bi": null };
export const isCogsCategory = (c: ExpenseCategory) => c in COGS_CATEGORY;

/** part / whole × 100, 1 chữ số lẻ; whole ≤ 0 → null. */
export function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

export type StockValue = { opening: number; purchases: number; closing: number };

export const cogsOf = (v: StockValue) => v.opening + v.purchases - v.closing;

/** Food cost % = (tồn đầu + nhập − tồn cuối) / doanh thu. */
export function foodCost(v: StockValue, revenue: number): { cogs: number; pct: number | null } {
  const cogs = cogsOf(v);
  return { cogs, pct: pct(cogs, revenue) };
}

/** Doanh thu / giờ công (đ/giờ, làm tròn). Không có giờ công → null. */
export function revenuePerHour(revenue: number, minutes: number): number | null {
  return minutes > 0 ? Math.round((revenue * 60) / minutes) : null;
}

/** Tỉ lệ lấp đầy lò = Σ suất đã dùng / Σ suất (đế Pan + túi BBQ). */
export function fillRate(batches: readonly { capPan: number; capBbq: number; usedPan: number; usedBbq: number }[]): number | null {
  const cap = batches.reduce((n, b) => n + b.capPan + b.capBbq, 0);
  const used = batches.reduce((n, b) => n + b.usedPan + b.usedBbq, 0);
  return pct(used, cap);
}

/** Chi phí nhân sự ước tính khi chưa có phiếu lương: Σ phút × đơn giá giờ (chưa gồm phụ cấp/thưởng). */
export function estimateLabor(rows: readonly { minutes: number; hourlyRate: number | null }[]): { amount: number; missingRate: number } {
  let amount = 0;
  let missingRate = 0;
  for (const r of rows) {
    if (r.minutes <= 0) continue;
    if (r.hourlyRate === null) missingRate++;
    else amount += Math.round((r.minutes * r.hourlyRate) / 60);
  }
  return { amount, missingRate };
}

export type PnlInput = {
  revenue: Record<Segment, number>;
  /** Giá trị kho theo mảng (nguyên liệu gắn mảng). */
  stock: Record<Segment, StockValue>;
  /** Hao hụt (huỷ + lệch kiểm kê, số dương = mất) theo mảng — đã nằm trong giá vốn, chỉ để hiển thị. */
  shrink: Record<Segment, number>;
  /** Chi phí đã ghi (không huỷ, không bị từ chối) theo nhóm — **đã loại** chứng từ nhập kho và trả nợ NCC. */
  expenses: Partial<Record<ExpenseCategory, number>>;
  /** Phiếu nợ NCC chỉ ghi nợ (không nhập kho) — giá vốn chung. */
  unstockedBills: number;
  /** null = người xem không được thấy (manager) — P&L dừng ở lợi nhuận trước nhân sự. */
  labor: number | null;
};

export type PnlSegment = { segment: Segment; revenue: number; stockCogs: number; directCogs: number; cogs: number; foodCostPct: number | null; gross: number; shrink: number };

export type Pnl = {
  segments: PnlSegment[];
  revenue: number;
  sharedCogs: number;
  cogs: number;
  foodCostPct: number | null;
  gross: number;
  grossPct: number | null;
  opex: { category: ExpenseCategory; amount: number }[];
  opexTotal: number;
  /** Lợi nhuận trước chi phí nhân sự. */
  beforeLabor: number;
  labor: number | null;
  laborPct: number | null;
  /** Prime cost = giá vốn + nhân sự. */
  prime: number | null;
  primePct: number | null;
  net: number | null;
};

export function buildPnl(i: PnlInput): Pnl {
  const segments = SEGMENTS.map((s): PnlSegment => {
    const stockCogs = cogsOf(i.stock[s]);
    const directCogs = Object.entries(i.expenses).reduce((n, [c, v]) => n + (COGS_CATEGORY[c as ExpenseCategory] === s ? (v ?? 0) : 0), 0);
    const cogs = stockCogs + directCogs;
    return { segment: s, revenue: i.revenue[s], stockCogs, directCogs, cogs, foodCostPct: pct(cogs, i.revenue[s]), gross: i.revenue[s] - cogs, shrink: i.shrink[s] };
  });
  const sharedCogs = (i.expenses["bao-bi"] ?? 0) + i.unstockedBills;
  const revenue = segments.reduce((n, s) => n + s.revenue, 0);
  const cogs = segments.reduce((n, s) => n + s.cogs, 0) + sharedCogs;
  const gross = revenue - cogs;
  const opex = (Object.entries(i.expenses) as [ExpenseCategory, number][])
    .filter(([c, v]) => !isCogsCategory(c) && v > 0)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
  const opexTotal = opex.reduce((n, o) => n + o.amount, 0);
  const beforeLabor = gross - opexTotal;
  const labor = i.labor;
  return {
    segments,
    revenue,
    sharedCogs,
    cogs,
    foodCostPct: pct(cogs, revenue),
    gross,
    grossPct: pct(gross, revenue),
    opex,
    opexTotal,
    beforeLabor,
    labor,
    laborPct: labor === null ? null : pct(labor, revenue),
    prime: labor === null ? null : cogs + labor,
    primePct: labor === null ? null : pct(cogs + labor, revenue),
    net: labor === null ? null : beforeLabor - labor,
  };
}

/** % thay đổi so với kỳ trước (1 chữ số lẻ); kỳ trước 0 → null. */
export const change = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null);

export type ShoppingItem = { label: string; unit: string; onHand: number; parLevel: number | null; purchaseUnit: string | null; purchaseFactor: number | null };
export type ShoppingLine = { label: string; need: number; unit: string; buy: { qty: number; unit: string } | null };

/**
 * Nhắc đi chợ: mặt hàng dưới mức tối thiểu → cần thêm (mức − tồn), quy ra đơn vị mua (làm tròn lên).
 * `extra` = lượng còn cần cho ngày bán kế tiếp (đơn đã đặt chưa ra lò) — cộng vào mức.
 */
export function shoppingList<T extends ShoppingItem>(items: readonly T[], extra: ReadonlyMap<string, number> = new Map(), key: (i: T) => string = (i) => i.label): ShoppingLine[] {
  const out: ShoppingLine[] = [];
  for (const i of items) {
    const target = (i.parLevel ?? 0) + (extra.get(key(i)) ?? 0);
    const need = Math.round((target - Math.max(0, i.onHand)) * 1000) / 1000;
    if (target <= 0 || need <= 0) continue;
    const buy = i.purchaseUnit && i.purchaseFactor ? { qty: Math.ceil(need / i.purchaseFactor), unit: i.purchaseUnit } : null;
    out.push({ label: i.label, need, unit: i.unit, buy });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, "vi"));
}
