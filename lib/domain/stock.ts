// Kho 2 mức (BLUEPRINT §17.8, M10). Thuần — không import DB/Next/React.
//
//   raw (mua về: bột, sườn sống) ──production_formulas──▶ prep (đế đã ủ, túi sườn)   · goods (dùng/bán thẳng)
//
// Tồn = Σ stock_moves.qty (không sửa/xoá — sai thì thêm dòng `adjust`). Số lượng theo đơn vị gốc của nguyên liệu
// (g, ml, đế, lon…); `avg_cost` là đ/đơn vị gốc, có phần lẻ (ngoại lệ duy nhất của luật tiền nguyên) — mọi
// **thành tiền** làm tròn về số nguyên VND.

import type { Quantity } from "@/lib/domain/expense-command";
import { fold, parseAmount } from "@/lib/domain/money-text";
import { tally } from "@/lib/domain/prep";
import { hasRole, type Role } from "@/lib/domain/roles";
import type { OrderWithItems, Product, RecipeLine } from "@/lib/domain/types";

export const STOCK_LEVELS = ["raw", "prep", "goods"] as const;
export type StockLevel = (typeof STOCK_LEVELS)[number];

export const MOVE_KINDS = ["purchase", "produce_in", "produce_out", "sale", "waste", "adjust"] as const;
export type MoveKind = (typeof MOVE_KINDS)[number];

export const WASTE_REASONS = ["expired", "dropped", "burnt", "other"] as const;
export type WasteReason = (typeof WASTE_REASONS)[number];

export const COUNT_CLASSES = ["A", "B", "C"] as const;
export type CountClass = (typeof COUNT_CLASSES)[number];

/** Số mục nhóm B đếm mỗi ca (xoay vòng — hết vòng ≈ 1 tuần). */
export const B_PER_SHIFT = 3;
/** Cảnh báo "sắp hết hạn" trước bao lâu. */
export const EXPIRY_WARN_HOURS = 24;

export type StockItem = {
  id: string;
  label: string;
  unit: string;
  level: StockLevel;
  trackStock: boolean;
  purchaseUnit: string | null;
  purchaseFactor: number | null;
  avgCost: number;
  shelfLifeHours: number | null;
  parLevel: number | null;
  aliases: string[];
  countClass: CountClass;
  countRoles: Role[];
  countTolerancePct: number;
};

export type FormulaLine = { ingredientId: string; qty: number };
export type Formula = { outputId: string; outputQty: number; lines: FormulaLine[] };

/** Làm tròn số lượng (3 chữ số lẻ — cột numeric(12,3)) và đơn giá (4 chữ số lẻ). */
export const roundQty = (n: number) => Math.round(n * 1000) / 1000;
export const roundCost = (n: number) => Math.round(n * 10_000) / 10_000;
/** Thành tiền = số lượng × đơn giá → số nguyên VND. */
export const valueOf = (qty: number, unitCost: number) => Math.round(qty * unitCost);

/**
 * Giá vốn bình quân gia quyền sau khi nhập `qty` với đơn giá `unitCost`.
 * Tồn trước ≤ 0 (chưa có hàng hoặc sổ đang âm) → lấy luôn đơn giá mới.
 */
export function weightedAverage(onHand: number, avgCost: number, qty: number, unitCost: number): number {
  if (qty <= 0) return avgCost;
  if (onHand <= 0) return roundCost(unitCost);
  return roundCost((onHand * avgCost + qty * unitCost) / (onHand + qty));
}

/**
 * Số lượng gõ ("5kg", "2 thùng", "3") → đơn vị gốc của nguyên liệu. `parseQuantity` đã quy kg → g, l → ml.
 * Đơn vị mua (bao/thùng) nhân `purchaseFactor`. Không có đơn vị = đơn vị gốc. Không đổi được → null.
 */
export function toBaseQty(q: Quantity, item: Pick<StockItem, "unit" | "purchaseUnit" | "purchaseFactor">): number | null {
  if (!(q.value > 0)) return null;
  const unit = fold(q.unit);
  if (!unit || unit === fold(item.unit)) return roundQty(q.value);
  if (item.purchaseUnit && item.purchaseFactor && unit === fold(item.purchaseUnit)) return roundQty(q.value * item.purchaseFactor);
  return null;
}

const words = (s: string) => ` ${fold(s).replace(/[^a-z0-9]+/g, " ").trim()} `;

/** Nguyên liệu khớp chữ trong `/chi`, `/no` (nguyên từ, không dấu) — cụm khớp dài nhất thắng. */
export function matchIngredient<T extends Pick<StockItem, "id" | "label" | "aliases">>(text: string, items: T[]): T | null {
  const hay = words(text);
  let best: { item: T; len: number } | null = null;
  for (const item of items) {
    for (const name of [item.label, ...item.aliases]) {
      const needle = words(name);
      if (needle.trim() && hay.includes(needle) && (!best || needle.length > best.len)) best = { item, len: needle.length };
    }
  }
  return best?.item ?? null;
}

/** Sản xuất `runs` mẻ theo công thức: dòng trừ nguyên liệu + dòng cộng bán thành phẩm. */
export function production(formula: Formula, runs: number): { output: { ingredientId: string; qty: number }; inputs: FormulaLine[] } {
  return {
    output: { ingredientId: formula.outputId, qty: roundQty(formula.outputQty * runs) },
    inputs: formula.lines.map((l) => ({ ingredientId: l.ingredientId, qty: roundQty(l.qty * runs) })),
  };
}

/** Đơn giá thành phẩm của một lần sản xuất = Σ (lượng × giá vốn nguyên liệu) / lượng ra. */
export function productionUnitCost(formula: Formula, costOf: (id: string) => number): number {
  const total = formula.lines.reduce((s, l) => s + l.qty * costOf(l.ingredientId), 0);
  return formula.outputQty > 0 ? roundCost(total / formula.outputQty) : 0;
}

/**
 * Giá vốn đơn vị dùng cho biên lợi nhuận: bán thành phẩm có công thức → tính qua công thức (mức 2, theo giá
 * vốn hiện tại của nguyên liệu); còn lại → `avg_cost`. Chống vòng lặp công thức.
 */
export function unitCostResolver(items: Pick<StockItem, "id" | "avgCost">[], formulas: Formula[]): (id: string) => number {
  const avg = new Map(items.map((i) => [i.id, i.avgCost]));
  const byOutput = new Map(formulas.map((f) => [f.outputId, f]));
  const memo = new Map<string, number>();
  const resolve = (id: string, seen: Set<string>): number => {
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    const f = byOutput.get(id);
    let cost = avg.get(id) ?? 0;
    if (f && !seen.has(id)) {
      const next = new Set(seen).add(id);
      cost = productionUnitCost(f, (x) => resolve(x, next));
    }
    memo.set(id, cost);
    return cost;
  };
  return (id) => resolve(id, new Set());
}

/** Giá vốn một món (số nguyên VND) = Σ định lượng × giá vốn. Combo: lựa chọn đắt nhất mỗi nhóm (thận trọng). */
export function productCost(product: Pick<Product, "id" | "kind" | "comboConfig">, recipes: RecipeLine[], costOf: (id: string) => number): number {
  const of = (productId: string) => recipes.filter((r) => r.productId === productId).reduce((s, r) => s + r.qty * costOf(r.ingredientId), 0);
  if (product.kind === "combo" && product.comboConfig) {
    return Math.round(product.comboConfig.reduce((s, g) => s + Math.max(0, ...g.options.map(of)), 0));
  }
  return Math.round(of(product.id));
}

/** Lãi gộp & % trên giá bán (làm tròn 1 chữ số lẻ). */
export function margin(price: number, cost: number): { gross: number; pct: number } {
  const gross = price - cost;
  return { gross, pct: price > 0 ? Math.round((gross / price) * 1000) / 10 : 0 };
}

/**
 * Lượng nguyên liệu bán ra của các đơn (combo nổ thành món thành phần, quà vẫn tốn nguyên liệu — như Bảng Tổng Hợp
 * Chuẩn Bị §7.6). Trả theo nguyên liệu, đã làm tròn.
 */
export function saleUsage(orders: Pick<OrderWithItems, "items">[], products: Product[], recipes: RecipeLine[]): Map<string, number> {
  const counts = tally(orders as OrderWithItems[], new Map(products.map((p) => [p.id, p])));
  const out = new Map<string, number>();
  for (const r of recipes) {
    const c = counts.get(r.productId);
    if (!c) continue;
    out.set(r.ingredientId, roundQty((out.get(r.ingredientId) ?? 0) + r.qty * (c.sold + c.gift)));
  }
  return out;
}

export type Lot = { qty: number; expiresAt: Date | null };

/**
 * Lô còn lại theo FIFO: dòng nhập (qty > 0) xếp theo thời điểm, mọi dòng xuất (qty < 0) trừ dần từ lô cũ nhất.
 * Dùng để biết phần tồn nào sắp hết hạn.
 */
export function fifoLots(moves: { qty: number; expiresAt: Date | null; createdAt: Date }[]): Lot[] {
  const sorted = [...moves].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let out = sorted.filter((m) => m.qty < 0).reduce((s, m) => s - m.qty, 0);
  const lots: Lot[] = [];
  for (const m of sorted) {
    if (m.qty <= 0) continue;
    const used = Math.min(out, m.qty);
    out -= used;
    if (m.qty - used > 0) lots.push({ qty: roundQty(m.qty - used), expiresAt: m.expiresAt });
  }
  return lots;
}

export type StockFlag = "below_par" | "expiring" | "expired" | "negative";

/** Cờ của một mặt hàng: âm sổ, dưới mức tối thiểu, có lô đã/sắp hết hạn. */
export function stockFlags(onHand: number, item: Pick<StockItem, "parLevel">, lots: Lot[], now: Date): StockFlag[] {
  const flags: StockFlag[] = [];
  if (onHand < 0) flags.push("negative");
  if (item.parLevel !== null && onHand < item.parLevel) flags.push("below_par");
  const t = now.getTime();
  if (lots.some((l) => l.expiresAt && l.expiresAt.getTime() <= t)) flags.push("expired");
  else if (lots.some((l) => l.expiresAt && l.expiresAt.getTime() - t <= EXPIRY_WARN_HOURS * 3_600_000)) flags.push("expiring");
  return flags;
}

/** Hạn dùng của lô mới sản xuất/nhập. */
export const expiryOf = (item: Pick<StockItem, "shelfLifeHours">, now: Date) =>
  item.shelfLifeHours ? new Date(now.getTime() + item.shelfLifeHours * 3_600_000) : null;

/**
 * Mục kiểm nhanh cuối ca (đếm xoay vòng ABC, §17.8): mọi mục **A** + `B_PER_SHIFT` mục **B** lâu chưa đếm nhất
 * (chưa đếm bao giờ đứng đầu). Chỉ mục `track_stock` gắn vai trò của người đếm (owner/manager: mọi mục).
 */
export function quickCountItems<T extends Pick<StockItem, "id" | "label" | "trackStock" | "countClass" | "countRoles">>(
  items: T[],
  lastCounted: Map<string, Date>,
  roles: Role[],
): T[] {
  const mine = items.filter((i) => i.trackStock && (hasRole(roles, ["owner", "manager"]) || hasRole(roles, i.countRoles)));
  const a = mine.filter((i) => i.countClass === "A");
  const b = mine
    .filter((i) => i.countClass === "B")
    .sort((x, y) => (lastCounted.get(x.id)?.getTime() ?? 0) - (lastCounted.get(y.id)?.getTime() ?? 0) || x.label.localeCompare(y.label, "vi"))
    .slice(0, B_PER_SHIFT);
  return [...a, ...b];
}

export type CountLine = { ingredientId: string; book: number; counted: number; diff: number; pct: number | null; value: number; over: boolean };

/**
 * Một dòng đếm: lệch = thật − sổ; % so với sổ; vượt ngưỡng % (sổ = 0 mà đếm ra khác 0 cũng là vượt).
 * `value` = tiền của phần lệch (âm = hao hụt).
 */
export function countLine(ingredientId: string, book: number, counted: number, tolerancePct: number, unitCost: number): CountLine {
  const diff = roundQty(counted - book);
  const pct = book !== 0 ? Math.round((diff / Math.abs(book)) * 1000) / 10 : null;
  const over = diff !== 0 && (pct === null || Math.abs(pct) > tolerancePct);
  return { ingredientId, book: roundQty(book), counted: roundQty(counted), diff, pct, value: valueOf(diff, unitCost), over };
}

// ── Công nợ nhà cung cấp ──

export type BillLine = { ingredientId?: string; text: string; qty: number | null; unit: string; amount: number | null };
export type OpenBill = { id: number; amount: number | null; paidAmount: number };

/**
 * Trả nợ: số tiền trả cho các phiếu mở **cũ nhất trước**. Phiếu chưa có giá (`amount` null) nhận toàn bộ phần còn
 * lại và được ghi giá bằng số đó ("chưa biết giá thì để trống, điền khi trả"). Trả thiếu → phiếu giữ mở với số đã
 * trả; thừa → `leftover`.
 */
export function allocatePayment(bills: OpenBill[], amount: number): { applied: { id: number; pay: number; close: boolean; setAmount?: number }[]; leftover: number } {
  let left = amount;
  const applied: { id: number; pay: number; close: boolean; setAmount?: number }[] = [];
  for (const b of bills) {
    if (left <= 0) break;
    if (b.amount === null) {
      applied.push({ id: b.id, pay: left, close: true, setAmount: b.paidAmount + left });
      left = 0;
      break;
    }
    const due = b.amount - b.paidAmount;
    if (due <= 0) continue;
    const pay = Math.min(due, left);
    applied.push({ id: b.id, pay, close: pay === due });
    left -= pay;
  }
  return { applied, leftover: left };
}

/**
 * Chia tiền phiếu cho các dòng đã khớp nguyên liệu (để ghi giá vốn khi nhận hàng): dòng có tiền riêng giữ nguyên;
 * phần tiền còn lại chia cho các dòng chưa có tiền theo `weight` (lượng × giá vốn hiện tại; chưa có giá vốn → theo lượng).
 * Không biết tiền → null (nhập kho theo giá vốn hiện tại, không làm đổi bình quân).
 */
export function splitBillCost(lines: { qty: number; amount: number | null; weight: number }[], total: number | null): (number | null)[] {
  const known = lines.reduce((s, l) => s + (l.amount ?? 0), 0);
  const open = lines.filter((l) => l.amount === null);
  if (open.length === 0) return lines.map((l) => l.amount);
  if (total === null || total - known <= 0) return lines.map((l) => l.amount);
  const rest = total - known;
  const useWeight = open.every((l) => l.weight > 0);
  const base = open.reduce((s, l) => s + (useWeight ? l.weight : l.qty), 0);
  let given = 0;
  let seen = 0;
  return lines.map((l) => {
    if (l.amount !== null) return l.amount;
    seen++;
    // Dòng cuối nhận phần dư làm tròn → tổng đúng bằng tiền phiếu.
    const share = seen === open.length ? rest - given : Math.round((rest * (useWeight ? l.weight : l.qty)) / base);
    given += share;
    return share;
  });
}

const QTY_UNITS = "kg|g|gr|gram|l|lit|ml|bao|hu|chai|thung|hop|tui|cai|goi|bich|lon|khay|de|phan|ket|loc|cuon";
const NUM_UNIT = new RegExp(`^(\\d+(?:[.,]\\d+)?)(${QTY_UNITS})?$`);
const UNIT = new RegExp(`^(${QTY_UNITS})$`);

/** Cụm cuối là số tiền? Chỉ nhận dạng có chữ (150k, 1tr2), có nhóm nghìn hoặc ≥ 1.000 — "3" là số lượng. */
function trailingAmount(ws: string[]): number | null {
  const last = ws.at(-1);
  if (!last || ws.length < 2) return null;
  const v = parseAmount(last);
  if (v === null) return null;
  return /^\d+$/.test(last) && Number(last) < 1000 ? null : v;
}

/** Một dòng hàng "3 thùng sting 300k" → số lượng, đơn vị, tên, tiền (nếu có). */
export function parseBillLine(raw: string): BillLine | null {
  const ws = raw.trim().split(/\s+/).filter(Boolean);
  const amount = trailingAmount(ws);
  if (amount !== null) ws.pop();
  let qty: number | null = null;
  let unit = "";
  let used = 0;
  const first = fold(ws[0] ?? "").match(NUM_UNIT);
  if (first) {
    qty = Number(first[1].replace(",", "."));
    unit = first[2] ?? "";
    used = 1;
    // "5 kg mozzarella" — đơn vị là từ riêng.
    if (!unit && ws[1] && UNIT.test(fold(ws[1]))) [unit, used] = [fold(ws[1]), 2];
    if (unit === "kg") [qty, unit] = [qty * 1000, "g"];
    else if (unit === "l" || unit === "lit") [qty, unit] = [qty * 1000, "ml"];
    else if (unit === "gr" || unit === "gram") unit = "g";
  }
  const name = ws.slice(used).join(" ").trim();
  if (!name) return null;
  return { text: name.slice(0, 80), qty: qty === null ? null : roundQty(qty), unit, amount };
}

export type DebtDraft = { supplier: string; lines: BillLine[]; amount: number | null };

/**
 * `/no Cô Nhiều 3 thùng sting, 2 thùng pepsi 480k` → NCC = phần trước số đầu tiên; các dòng cách nhau dấu phẩy.
 * Mọi dòng có tiền → tiền phiếu = tổng; chỉ dòng cuối có tiền (và > 1 dòng) → đó là tổng cả phiếu.
 */
export function parseDebt(rest: string): DebtDraft | null {
  const m = rest.trim().match(/^(.*?\D)\s+(\d[\s\S]*)$/);
  if (!m) return null;
  const supplier = m[1].trim().replace(/[:,-]+$/, "").trim();
  if (!supplier) return null;
  const lines = m[2]
    .split(/[,;\n]/)
    .map((s) => parseBillLine(s))
    .filter((l): l is BillLine => l !== null);
  if (lines.length === 0) return null;
  let amount: number | null = null;
  if (lines.every((l) => l.amount !== null)) amount = lines.reduce((s, l) => s + l.amount!, 0);
  else if (lines.length > 1 && lines.at(-1)!.amount !== null && lines.slice(0, -1).every((l) => l.amount === null)) {
    amount = lines.at(-1)!.amount;
    lines.at(-1)!.amount = null;
  }
  return { supplier: supplier.slice(0, 60), lines, amount };
}

/** Tên NCC khớp (tên hoặc alias, không dấu, không phân biệt hoa thường). */
export function matchSupplier<T extends { name: string; aliases: string[] }>(name: string, suppliers: T[]): T | null {
  const key = fold(name).replace(/\s+/g, " ").trim();
  return suppliers.find((s) => [s.name, ...s.aliases].some((n) => fold(n).replace(/\s+/g, " ").trim() === key)) ?? null;
}
