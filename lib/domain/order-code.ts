// Mã đơn & nội dung chuyển khoản (BLUEPRINT §7.8). Mã ngắn chỉ để gọi tên — không đủ để xem đơn.

import { addDays, vnDateOf, type ISODate } from "@/lib/domain/time";

function ddmm(date: ISODate) {
  const [, month, day] = date.split("-");
  return `${day}${month}`;
}

const seqPart = (seq: number) => String(seq).padStart(2, "0");

/** "2026-11-06", 12 → "TH-0611-12". */
export function orderCode(date: ISODate, seq: number): string {
  return `TH-${ddmm(date)}-${seqPart(seq)}`;
}

/** Nội dung chuyển khoản ASCII, không dấu cách: "TH061112". */
export function transferMemo(date: ISODate, seq: number): string {
  return `TH${ddmm(date)}${seqPart(seq)}`;
}

// (?!\d): không ăn nhầm số tham chiếu ngân hàng dính liền phía sau.
const MEMO_RE = /TH(\d{2})(\d{2})(\d{2,3})(?!\d)/i;

/**
 * Tìm mã đơn trong nội dung giao dịch ngân hàng. Ngày phục vụ là ngày có cùng DD/MM
 * gần `now` nhất trong ±7 ngày (xử lý giao dịch vắt qua năm mới). Không khớp → null.
 */
export function matchTransferMemo(text: string, now: Date): { serviceDate: ISODate; seq: number } | null {
  const m = MEMO_RE.exec(text);
  if (!m) return null;
  const [, day, month, seq] = m;
  const today = vnDateOf(now);
  for (const offset of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6, -7, 7]) {
    const date = addDays(today, offset);
    if (date.slice(5) === `${month}-${day}`) return { serviceDate: date, seq: Number(seq) };
  }
  return null;
}
