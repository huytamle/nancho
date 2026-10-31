// Kho café (BLUEPRINT §17.10, M11). Thuần: bảng "bán hàng theo mặt hàng" xuất từ Sapo → dòng bán → lượng nguyên liệu.
//
// Chưa có file mẫu từ chủ quán → đọc linh hoạt: tìm dòng tiêu đề có cột tên ("tên hàng", "mặt hàng", "sản phẩm")
// và cột số lượng ("số lượng", "SL"); cột doanh thu ("doanh thu", "thành tiền") là tuỳ chọn. Dòng tổng bị bỏ qua.
// Cùng hàm đọc được bảng dán từ Excel (tab) hoặc CSV.

import { fold } from "@/lib/domain/money-text";
import { roundQty } from "@/lib/domain/stock";

export type Cell = string | number | boolean | Date | null | undefined;

export type SaleLine = { name: string; qty: number; revenue: number | null };
export type SheetParse = { ok: true; lines: SaleLine[] } | { ok: false; reason: "no_header" | "empty" };

const norm = (c: Cell) => (typeof c === "string" ? fold(c).replace(/[^a-z0-9]+/g, " ").trim() : typeof c === "number" ? String(c) : "");

const NAME_COLS = ["ten hang hoa", "ten hang", "ten san pham", "ten mat hang", "mat hang", "san pham", "hang hoa", "ten mon", "ten"];
const QTY_COLS = ["so luong ban", "sl ban", "so luong", "sl"];
const REV_COLS = ["doanh thu thuan", "doanh thu", "thanh tien", "tien hang", "tong tien"];

/** Cột đầu tiên có tiêu đề khớp một trong `names` (theo thứ tự ưu tiên của `names`). */
function findCol(row: Cell[], names: string[]): number {
  const heads = row.map(norm);
  for (const n of names) {
    const i = heads.findIndex((h) => h === n || h.startsWith(`${n} `));
    if (i >= 0) return i;
  }
  return -1;
}

/** Số từ ô Excel: số thật, hoặc chuỗi "1.200.000" / "1,5" / "12". */
export function cellNumber(c: Cell): number | null {
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  if (typeof c !== "string") return null;
  const s = c.trim().replace(/\s|đ|vnd/gi, "");
  if (!s) return null;
  // Có cả . và , → . là phân cách nghìn. Chỉ "." theo sau đúng 3 số → nghìn. Còn lại "," là thập phân.
  let t = s;
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) t = s.replace(/[.,]/g, "");
  else if (s.includes(".") && s.includes(",")) t = s.replace(/\./g, "").replace(",", ".");
  else t = s.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Bảng (hàng × ô) → dòng bán theo mặt hàng. Cộng dồn tên trùng. */
export function parseSalesSheet(rows: readonly (readonly Cell[])[]): SheetParse {
  const headerAt = rows.slice(0, 30).findIndex((r) => findCol([...r], NAME_COLS) >= 0 && findCol([...r], QTY_COLS) >= 0);
  if (headerAt < 0) return { ok: false, reason: "no_header" };
  const head = [...rows[headerAt]];
  const nameCol = findCol(head, NAME_COLS);
  const qtyCol = findCol(head, QTY_COLS);
  const revCol = findCol(head, REV_COLS);
  const byName = new Map<string, SaleLine>();
  for (const r of rows.slice(headerAt + 1)) {
    const raw = r[nameCol];
    const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : typeof raw === "number" ? String(raw) : "";
    const qty = cellNumber(r[qtyCol]);
    if (!name || qty === null || qty <= 0) continue;
    if (/^(tong|tong cong|cong)\b/.test(norm(name))) continue;
    const rev = revCol >= 0 ? cellNumber(r[revCol]) : null;
    const key = fold(name);
    const prev = byName.get(key);
    if (prev) {
      prev.qty = roundQty(prev.qty + qty);
      prev.revenue = prev.revenue === null && rev === null ? null : (prev.revenue ?? 0) + Math.round(rev ?? 0);
    } else byName.set(key, { name: name.slice(0, 120), qty: roundQty(qty), revenue: rev === null ? null : Math.round(rev) });
  }
  const lines = [...byName.values()];
  return lines.length ? { ok: true, lines } : { ok: false, reason: "empty" };
}

/** Văn bản dán từ Excel (tab) hoặc CSV (dấu phẩy/chấm phẩy, có ngoặc kép) → bảng ô. */
export function parsePastedTable(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length === 0) return [];
  const sep = lines.some((l) => l.includes("\t")) ? "\t" : lines.some((l) => l.includes(";")) ? ";" : ",";
  return lines.map((l) => splitRow(l, sep));
}

function splitRow(line: string, sep: string): string[] {
  if (sep === "\t") return line.split("\t");
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export type CafeItem = { id: number; name: string; aliases: string[]; price: number };
export type CafeRecipeLine = { itemId: number; ingredientId: string; qty: number };

/** Tên trên Sapo → món café: khớp tên hoặc tên Sapo (aliases), không dấu, không phân biệt hoa thường/khoảng trắng. */
export function matchCafeItem<T extends Pick<CafeItem, "name" | "aliases">>(name: string, items: readonly T[]): T | null {
  const key = norm(name);
  if (!key) return null;
  return items.find((i) => [i.name, ...i.aliases].some((n) => norm(n) === key)) ?? null;
}

export type MatchedLine = SaleLine & { itemId: number | null };

export function matchSales(lines: readonly SaleLine[], items: readonly CafeItem[]): MatchedLine[] {
  return lines.map((l) => ({ ...l, itemId: matchCafeItem(l.name, items)?.id ?? null }));
}

/** Lượng nguyên liệu dùng cho các dòng đã khớp (theo định lượng đồ uống). */
export function cafeUsage(lines: readonly { itemId: number | null; qty: number }[], recipes: readonly CafeRecipeLine[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lines) {
    if (l.itemId === null) continue;
    for (const r of recipes) if (r.itemId === l.itemId) out.set(r.ingredientId, roundQty((out.get(r.ingredientId) ?? 0) + r.qty * l.qty));
  }
  return out;
}

/** Giá vốn một món café = Σ định lượng × giá vốn (gồm ly, đá, ống hút). Thành tiền làm tròn về int. */
export function cafeItemCost(itemId: number, recipes: readonly CafeRecipeLine[], costOf: (ingredientId: string) => number): number {
  return Math.round(recipes.filter((r) => r.itemId === itemId).reduce((n, r) => n + r.qty * costOf(r.ingredientId), 0));
}
