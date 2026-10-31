// Đọc số tiền kiểu người Việt hay gõ (BLUEPRINT §17.4): "150k", "150 nghìn", "1tr2", "1,2tr", "2 triệu",
// "1.200.000đ", "85000". Số trần < 1.000 hiểu là nghìn ("150" = 150.000đ) — bot luôn nhắc lại số tiền để xác nhận.

export const MAX_AMOUNT = 100_000_000;

/** Bỏ dấu tiếng Việt, chữ thường (dùng chung cho so khớp từ khoá). */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

const THOUSAND = /^(\d+(?:[.,]\d+)?)\s*(k|n|nghin|ngan)$/;
const MILLION = /^(\d+(?:[.,]\d+)?)\s*(?:tr|trieu|m)(\d{1,3})?$/;
const GROUPED = /^\d{1,3}(?:([.,])\d{3})(?:\1\d{3})*$/;

const decimal = (s: string) => Number(s.replace(",", "."));

/** Một cụm số tiền → số nguyên VND, hoặc null nếu không phải số tiền. */
export function parseAmount(raw: string): number | null {
  const s = fold(raw.trim()).replace(/\s*(d|vnd|dong)$/, "");
  let v: number | null = null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(THOUSAND))) v = decimal(m[1]) * 1000;
  else if ((m = s.match(MILLION))) {
    if (m[2] && /[.,]/.test(m[1])) return null; // "1,2tr5" — mơ hồ
    v = decimal(m[1]) * 1_000_000 + (m[2] ? Number(m[2].padEnd(3, "0")) * 1000 : 0);
  } else if (GROUPED.test(s)) v = Number(s.replace(/[.,]/g, ""));
  else if (/^\d+$/.test(s)) {
    const n = Number(s);
    v = n < 1000 ? n * 1000 : n;
  }
  if (v === null || !Number.isFinite(v)) return null;
  v = Math.round(v);
  return v > 0 && v <= MAX_AMOUNT ? v : null;
}
