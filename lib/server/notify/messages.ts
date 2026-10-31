// Nội dung tin Telegram cho nhóm "Bếp The Heat" (§11.3). Thuần — test được, không gửi gì.

import { formatPhone } from "@/lib/domain/phone";

export type NewOrderNotice = {
  seq: number;
  code: string;
  readyLabel: string;
  /** "" khi là hôm nay; "T7 07/11" khi đặt cho ngày khác. */
  dayLabel: string;
  name: string;
  phone: string;
  where: string;
  items: { short: string; qty: number }[];
  total: number;
  paymentMethod: "cod" | "transfer";
  needsConfirm: boolean;
  note: string | null;
  link: string;
};

const k = (vnd: number) => `${Math.round(vnd / 1000)}k`;
const batchLabel = (time: string, day: string, word = "Mẻ") => (day ? `${word} ${time} ${day}` : `${word} ${time}`);

export function newOrderText(o: NewOrderNotice): string {
  const items = o.items.map((i) => `${i.qty} ${i.short}`).join(" + ");
  const pay = o.paymentMethod === "cod" ? "COD" : "CK";
  return [
    `🆕 #${o.seq} · ${batchLabel(o.readyLabel, o.dayLabel)} · ${o.name} ${formatPhone(o.phone)} · ${o.where} · ${items} · ${k(o.total)} · ${pay}`,
    o.note ? `📝 ${o.note}` : null,
    o.needsConfirm ? "⚠ Khách mới — gọi xác nhận" : null,
    `${o.code} · ${o.link}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function cancelledText(o: { seq: number; readyLabel: string; dayLabel: string; units: number }): string {
  return `❌ #${o.seq} huỷ bởi khách · trả ${o.units} suất ${batchLabel(o.readyLabel, o.dayLabel, "mẻ")}`;
}

export function almostFullText(o: { readyLabel: string; dayLabel: string }): string {
  return `🔥 ${batchLabel(o.readyLabel, o.dayLabel)} còn 1 suất`;
}
