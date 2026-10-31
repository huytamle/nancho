// Mã ghi nắp hộp bằng bút lông (BLUEPRINT §18.3). Thuần — không import DB/Next/React.
//
//   ⑫ T289 +2S   đơn 12 · thu 289.000đ · thêm 2 hũ sốt
//   ⑦ CK         đơn 7 · đã chuyển khoản, không thu
//   ③ T159 R     đơn 3 · thu 159.000đ · nhận tại Rêu
//
// Tối đa 12 ký tự (đếm theo ký tự hiển thị). Thẻ còn ghi `1/3`, `2/3`… sau mã khi một đơn nhiều hộp.

import { fold } from "@/lib/domain/money-text";

export const BOX_CODE_MAX = 12;

const CIRCLED_1_20 = 0x2460; // ① … ⑳

/** Số đơn khoanh tròn: ①…⑳, ㉑…㉟ (21–35), ㊱…㊿ (36–50); lớn hơn → "(51)". */
export function circled(n: number): string {
  if (n >= 1 && n <= 20) return String.fromCodePoint(CIRCLED_1_20 + n - 1);
  if (n >= 21 && n <= 35) return String.fromCodePoint(0x3251 + n - 21);
  if (n >= 36 && n <= 50) return String.fromCodePoint(0x32b1 + n - 36);
  return `(${n})`;
}

// Từ chỉ vật chứa đứng đầu tên add-on ("Hũ Sốt…", "Chai Cà phê…") — bỏ qua để lấy chữ của món.
const CONTAINERS = new Set(["hu", "chai", "lon", "ly", "goi", "phan", "hop", "tui", "coc"]);

/** Chữ tắt một add-on: chữ cái đầu của tên sau từ chỉ vật chứa. "Hũ Sốt Bơ Tỏi" → S, "Chai Cà phê ủ lạnh" → C. */
export function addonLetter(name: string): string {
  const words = fold(name).split(/[^a-z0-9]+/).filter(Boolean);
  const word = words.find((w) => !CONTAINERS.has(w)) ?? words[0] ?? "?";
  return word[0].toUpperCase();
}

/** 289000 → "289"; 289500 → "289,5". */
function thousands(vnd: number): string {
  const k = vnd / 1000;
  return Number.isInteger(k) ? String(k) : String(Math.round(k * 10) / 10).replace(".", ",");
}

export type BoxInput = {
  seq: number;
  /** Tiền shipper/quầy phải thu (0 = đã CK). */
  collect: number;
  fulfillment: "delivery" | "pickup";
  /** Add-on cần bỏ kèm hộp (gồm cả quà). */
  addons: { name: string; qty: number }[];
  /** Khay pizza + phần BBQ của đơn — mỗi thứ một hộp/khay. */
  units: number;
};

export type BoxCode = { code: string; parts: string[]; boxes: number; labels: string[] };

const len = (s: string) => [...s].length;

export function boxCode(o: BoxInput): BoxCode {
  const head = circled(o.seq);
  const pay = o.collect > 0 ? `T${thousands(o.collect)}` : "CK";

  const counts = new Map<string, number>();
  for (const a of o.addons) if (a.qty > 0) counts.set(addonLetter(a.name), (counts.get(addonLetter(a.name)) ?? 0) + a.qty);
  const total = [...counts.values()].reduce((s, n) => s + n, 0);
  const tail = o.fulfillment === "pickup" ? ["R"] : [];

  // Dài nhất trước; quá 12 ký tự thì gộp add-on thành tổng số ("+3").
  const detailed = counts.size > 0 ? `+${[...counts].map(([l, n]) => `${n}${l}`).join("")}` : null;
  const candidates = [detailed, total > 0 ? `+${total}` : null];
  let parts = [head, pay, ...tail];
  for (const extra of candidates) {
    if (!extra) continue;
    const next = [head, pay, extra, ...tail];
    if (len(next.join(" ")) <= BOX_CODE_MAX) {
      parts = next;
      break;
    }
  }

  const boxes = Math.max(1, o.units);
  return {
    code: parts.join(" "),
    parts,
    boxes,
    labels: boxes > 1 ? Array.from({ length: boxes }, (_, i) => `${i + 1}/${boxes}`) : [],
  };
}
