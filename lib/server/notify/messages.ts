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

const vnd = (n: number) => `${new Intl.NumberFormat("vi-VN").format(n)}đ`;

/** Kết quả đối soát một giao dịch SePay (§11.2) → tin cho nhóm bếp. */
export type PaymentNotice =
  | { kind: "paid"; seq: number; amount: number }
  | { kind: "partial"; seq: number; amount: number; received: number; total: number }
  | { kind: "extra"; seq: number; amount: number; status: "already_paid" | "cancelled" }
  | { kind: "unmatched"; amount: number; content: string };

export function paymentText(n: PaymentNotice): string {
  switch (n.kind) {
    case "paid":
      return `💰 #${n.seq} đã chuyển khoản ${vnd(n.amount)}`;
    case "partial":
      return `⚠ #${n.seq} chuyển thiếu: nhận ${vnd(n.amount)} · tổng đã nhận ${vnd(n.received)}/${vnd(n.total)} — gọi khách`;
    case "extra":
      return `⚠ #${n.seq} nhận thêm ${vnd(n.amount)} nhưng đơn ${n.status === "cancelled" ? "đã huỷ" : "đã trả đủ"} — kiểm tra hoàn tiền`;
    case "unmatched":
      return `⚠ Tiền về ${vnd(n.amount)} không khớp đơn nào · "${n.content.slice(0, 120)}" — đối chiếu rồi bấm [Đã trả] trên đơn trong dashboard`;
  }
}
