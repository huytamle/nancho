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
  /** "17:32" khi đơn bắt buộc trả trước đang giữ suất (§18.2). */
  holdUntil?: string | null;
};

const k = (vnd: number) => `${Math.round(vnd / 1000)}k`;
const batchLabel = (time: string, day: string, word = "Mẻ") => (day ? `${word} ${time} ${day}` : `${word} ${time}`);

export function newOrderText(o: NewOrderNotice): string {
  const items = o.items.map((i) => `${i.qty} ${i.short}`).join(" + ");
  const pay = o.paymentMethod === "cod" ? "COD" : "CK";
  return [
    `🆕 #${o.seq} · ${batchLabel(o.readyLabel, o.dayLabel)} · ${o.name} ${formatPhone(o.phone)} · ${o.where} · ${items} · ${k(o.total)} · ${pay}`,
    o.note ? `📝 ${o.note}` : null,
    o.holdUntil ? `⏳ Giữ suất đến ${o.holdUntil} — chờ CK, quá hạn tự huỷ` : o.needsConfirm ? "⚠ Khách mới — gọi xác nhận" : null,
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
  | { kind: "unmatched"; amount: number; content: string }
  /** Tiền đến sau khi hết giờ giữ suất (§18.2): mở lại được (`reopened`) hoặc mẻ đã kín. */
  | { kind: "late"; seq: number; amount: number; reopened: boolean };

export function paymentText(n: PaymentNotice): string {
  switch (n.kind) {
    case "paid":
      return `💰 #${n.seq} đã chuyển khoản ${vnd(n.amount)}`;
    case "partial":
      return `⚠ #${n.seq} chuyển thiếu: nhận ${vnd(n.amount)} · tổng đã nhận ${vnd(n.received)}/${vnd(n.total)} — gọi khách`;
    case "extra":
      return `⚠ #${n.seq} nhận thêm ${vnd(n.amount)} nhưng đơn ${n.status === "cancelled" ? "đã huỷ" : "đã trả đủ"} — kiểm tra hoàn tiền`;
    case "late":
      return n.reopened
        ? `💰 #${n.seq} CK ${vnd(n.amount)} sau khi hết giữ suất — mẻ còn chỗ, đã mở lại & xác nhận đơn`
        : `⚠ #${n.seq} CK ${vnd(n.amount)} sau khi hết giữ suất — mẻ đã kín, cần hoàn hoặc chuyển mẻ`;
    case "unmatched":
      return `⚠ Tiền về ${vnd(n.amount)} không khớp đơn nào · "${n.content.slice(0, 120)}" — đối chiếu rồi bấm [Đã trả] trên đơn trong dashboard`;
  }
}

// ── Gói "Ngày bán" (§18) ──

export type AffectedOrder = {
  seq: number;
  name: string;
  phone: string;
  readyLabel: string;
  dayLabel: string;
  /** Đã trả bao nhiêu (0 = COD/chưa trả). */
  paid: number;
};

/** Tin khoá lò (§18.1) + danh sách đơn bị ảnh hưởng — gửi cùng nội dung màn bếp. */
export function ovenPausedText(o: { by: string; reason: string; days: string; orders: AffectedOrder[] }): string {
  const head = `⛔ KHOÁ LÒ ${o.days} · ${o.reason || "không ghi lý do"} · ${o.by}`;
  if (o.orders.length === 0) return `${head}\nKhông có đơn nào bị ảnh hưởng.`;
  const refund = o.orders.filter((x) => x.paid > 0);
  return [
    head,
    `Đơn bị ảnh hưởng (${o.orders.length}) — gọi từng khách:`,
    ...o.orders.map(
      (x) =>
        `#${x.seq} ${x.name} ${formatPhone(x.phone)} · ${batchLabel(x.readyLabel, x.dayLabel, "mẻ")} · ${x.paid > 0 ? `đã trả ${vnd(x.paid)} → cần hoàn` : "COD"}`,
    ),
    refund.length > 0 ? `💸 Cần hoàn ${refund.length} đơn · ${vnd(refund.reduce((s, x) => s + x.paid, 0))}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export const ovenResumedText = (o: { by: string; days: string }) => `✅ MỞ LÒ ${o.days} · ${o.by} — khách đặt lại được.`;

export function refundText(o: { seq: number; amount: number; method: "transfer" | "cash"; by: string; note: string | null }): string {
  return `💸 #${o.seq} đã hoàn ${vnd(o.amount)} (${o.method === "cash" ? "tiền mặt" : "CK"}) · ${o.by}${o.note ? ` · ${o.note}` : ""}`;
}

/** Bàn giao COD lệch (§18.4); vượt ngưỡng → ⚠. */
export function handoverText(o: { shipper: string; receiver: string; expected: number; received: number; orders: number; tolerance: number }): string {
  const diff = o.received - o.expected;
  const mark = Math.abs(diff) > o.tolerance ? "⚠" : "ℹ";
  return `${mark} Bàn giao COD ${o.shipper} → ${o.receiver}: ${o.orders} đơn · đáng có ${vnd(o.expected)} · nhận ${vnd(o.received)} · ${diff > 0 ? "dư" : "thiếu"} ${vnd(Math.abs(diff))}`;
}

/** "⭐ #12 Pepperoni 😋 · BBQ 😕 ngọt hơn — 'hơi mặn'". */
export function feedbackText(o: { seq: number; lines: { name: string; emoji: string; tags: string[] }[]; comment: string | null; edited: boolean }): string {
  const lines = o.lines.map((l) => `${l.name} ${l.emoji}${l.tags.length ? ` ${l.tags.join(", ")}` : ""}`).join(" · ");
  return `⭐ #${o.seq}${o.edited ? " (sửa)" : ""} ${lines}${o.comment ? ` — "${o.comment}"` : ""}`;
}
