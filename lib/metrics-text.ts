// Văn bản chỉ số & báo cáo (§17.10, M11): nhãn UI + tin Telegram (báo cáo tối, cả ngày, /lich, /pl, đi chợ,
// góp ý tuần). Thuần — test được, không gửi gì.

import type { Segment, Pnl, ShoppingLine } from "@/lib/domain/metrics";
import { vnWeekday, type ISODate } from "@/lib/domain/time";
import { formatPrice } from "@/lib/format";
import { CATEGORY_LABEL, signed } from "@/lib/ops-text";
import { qtyText } from "@/lib/stock-text";

export const SEGMENT_LABEL: Record<Segment, string> = { pizza: "Pizza", cafe: "Café" };

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;
/** "T6 13/11". */
export const dayText = (d: ISODate) => `${WD[vnWeekday(d)]} ${d.slice(8)}/${d.slice(5, 7)}`;
/** "12,5%" · "—". */
export const pctOrDash = (p: number | null) => (p === null ? "—" : `${p.toLocaleString("vi-VN")}%`);
const money = formatPrice;

export function shoppingLineText(l: ShoppingLine): string {
  return `• ${l.label}: thiếu ${qtyText(l.need, l.unit)}${l.buy ? ` → mua ${qtyText(l.buy.qty, l.buy.unit)}` : ""}`;
}

// ── Báo cáo tối pizza (20:15 các ngày bán) ──

export type EveningReport = {
  date: ISODate;
  orders: number;
  revenue: number;
  transferPaid: number;
  cod: number;
  collected: number;
  cancelled: number;
  noShow: number;
  handover: { expected: number; received: number; pending: number };
  taste: { count: number; avg: number | null; low: string[] };
  stockA: { label: string; onHand: number; unit: string }[];
  next: ISODate | null;
  shopping: ShoppingLine[];
};

export function eveningReportText(r: EveningReport): string {
  const out = [
    `🍕 Báo cáo tối pizza · ${dayText(r.date)}`,
    `Doanh thu: ${money(r.revenue)} · ${r.orders} đơn`,
    `• CK đã nhận ${money(r.transferPaid)} · COD ${money(r.cod)} · đã thu ${money(r.collected)}`,
  ];
  if (r.cancelled || r.noShow) out.push(`Huỷ ${r.cancelled} · bom ${r.noShow}`);
  const h = r.handover;
  if (h.expected || h.pending) {
    const diff = h.received - h.expected;
    out.push(`Bàn giao COD: nhận ${money(h.received)}/${money(h.expected)}${diff ? ` (${signed(diff)} ⚠)` : ""}${h.pending ? ` · còn chưa giao ${money(h.pending)}` : ""}`);
  }
  out.push(
    r.taste.count
      ? `Khẩu vị: ${r.taste.count} lượt · TB ${r.taste.avg?.toLocaleString("vi-VN")}/3${r.taste.low.length ? ` · cần xem: ${r.taste.low.join(", ")}` : ""}`
      : "Khẩu vị: chưa có lượt chấm",
  );
  if (r.stockA.length) out.push(`Tồn nhóm A: ${r.stockA.map((s) => `${s.label} ${qtyText(s.onHand, s.unit)}`).join(" · ")}`);
  if (r.shopping.length) out.push(`🛒 Cần đặt${r.next ? ` cho ${dayText(r.next)}` : ""}:`, ...r.shopping.map(shoppingLineText));
  else out.push("✅ Kho đủ mức tối thiểu.");
  return out.join("\n");
}

// ── Báo cáo cả ngày (ngay sau khi đóng ca café) ──

export type DayReport = {
  date: ISODate;
  cafe: { cash: number; transfer: number; other: number };
  pizza: number;
  shifts: { by: string; counted: number; expected: number }[];
  petty: { counted: number; expected: number } | null;
  checklists: { title: string; done: number; total: number; photos: number }[];
  quick: { label: string; diffPct: number | null; over: boolean }[];
  expenses: { total: number; count: number };
  tolerance: number;
};

export function dayReportText(r: DayReport): string {
  const cafe = r.cafe.cash + r.cafe.transfer + r.cafe.other;
  const out = [
    `📊 Tổng kết ngày ${dayText(r.date)}`,
    `Doanh thu: ${money(cafe + r.pizza)} (café ${money(cafe)} · pizza ${money(r.pizza)})`,
    `• Café: tiền mặt ${money(r.cafe.cash)} · CK/MoMo ${money(r.cafe.transfer)}${r.cafe.other ? ` · khác ${money(r.cafe.other)}` : ""}`,
  ];
  for (const s of r.shifts) {
    const v = s.counted - s.expected;
    out.push(`Két (${s.by}): ${v === 0 ? "khớp ✅" : `lệch ${signed(v)}${Math.abs(v) > r.tolerance ? " ⚠" : ""}`}`);
  }
  if (r.petty) {
    const v = r.petty.counted - r.petty.expected;
    out.push(`Hộp chi: ${v === 0 ? "khớp ✅" : `lệch ${signed(v)}${Math.abs(v) > r.tolerance ? " ⚠" : ""}`}`);
  }
  if (r.checklists.length)
    out.push(`Checklist: ${r.checklists.map((c) => `${c.title} ${c.done}/${c.total}${c.photos ? ` (📷 ${c.photos})` : ""}${c.done < c.total ? " ⚠" : ""}`).join(" · ")}`);
  if (r.quick.length) {
    const over = r.quick.filter((q) => q.over);
    out.push(over.length ? `Kiểm nhanh: ${over.length}/${r.quick.length} món lệch ⚠ — ${over.map((q) => `${q.label} ${q.diffPct === null ? "" : `${q.diffPct > 0 ? "+" : ""}${q.diffPct}%`}`.trim()).join(", ")}` : `Kiểm nhanh: ${r.quick.length} món khớp ✅`);
  } else out.push("Kiểm nhanh: chưa làm");
  out.push(`Chi trong ngày: ${money(r.expenses.total)} · ${r.expenses.count} chứng từ`);
  return out.join("\n");
}

// ── /lich ──

export type ScheduleDay = { date: ISODate; slots: { name: string; start: string; end: string }[] };

export function scheduleText(weekLabel: string, days: ScheduleDay[]): string {
  const lines = days.map((d) => `${dayText(d.date)}: ${d.slots.length ? d.slots.map((s) => `${s.name} ${s.start}–${s.end}`).join(" · ") : "—"}`);
  const empty = days.every((d) => d.slots.length === 0);
  return `🗓 Lịch ca ${weekLabel}\n${lines.join("\n")}${empty ? "\n(Chưa xếp lịch — Vận hành → Công → Lịch ca.)" : ""}`;
}

// ── /pl ──

export function pnlText(label: string, p: Pnl): string {
  const seg = p.segments.map(
    (s) => `${SEGMENT_LABEL[s.segment]}: ${money(s.revenue)} − giá vốn ${money(s.cogs)} (${pctOrDash(s.foodCostPct)}) = ${money(s.gross)}`,
  );
  const out = [
    `📈 P&L tháng ${label}`,
    `Doanh thu: ${money(p.revenue)}`,
    ...seg.map((s) => `• ${s}`),
    ...(p.sharedCogs ? [`• Bao bì & hàng nợ chưa nhập kho: ${money(p.sharedCogs)}`] : []),
    `Lãi gộp: ${money(p.gross)} (${pctOrDash(p.grossPct)})`,
    `Chi phí vận hành: ${money(p.opexTotal)}${p.opex.length ? ` — ${p.opex.map((o) => `${CATEGORY_LABEL[o.category]} ${money(o.amount)}`).join(", ")}` : ""}`,
  ];
  if (p.labor !== null) {
    out.push(`Nhân sự: ${money(p.labor)} (${pctOrDash(p.laborPct)}) · prime cost ${pctOrDash(p.primePct)}`);
    out.push(`Lợi nhuận: ${money(p.net ?? 0)}`);
  } else out.push(`Lợi nhuận trước nhân sự: ${money(p.beforeLabor)}`);
  return out.join("\n");
}

// ── Nhắc đi chợ & góp ý tuần ──

export function marketText(next: ISODate, lines: ShoppingLine[]): string {
  return `🛒 Đi chợ trước ngày bán ${dayText(next)}:\n${lines.map(shoppingLineText).join("\n")}`;
}

export type FeedbackItem = { date: ISODate; product: string; score: 1 | 2 | 3; tags: string[]; comment: string | null };

const SCORE_ICON = { 1: "😕", 2: "🙂", 3: "😋" } as const;

/** `count` = số bản góp ý; `items` = từng món được chấm (một bản có thể chấm nhiều món). */
export function feedbackDigestText(range: string, count: number, items: FeedbackItem[], summary: string | null): string {
  const head = `💬 Góp ý tuần ${range} · ${count} lượt`;
  const scores = new Map<string, number[]>();
  for (const i of items) scores.set(i.product, [...(scores.get(i.product) ?? []), i.score]);
  const avg = [...scores].map(([p, s]) => `${p} ${(Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10).toLocaleString("vi-VN")}/3 (${s.length})`);
  const out = [head, `Điểm: ${avg.join(" · ")}`];
  if (summary) out.push("", summary);
  else {
    const comments = items.filter((i) => i.comment || i.tags.length);
    if (comments.length)
      out.push(
        "",
        ...comments.slice(0, 40).map((i) => `${SCORE_ICON[i.score]} ${i.product}${i.tags.length ? ` [${i.tags.join(", ")}]` : ""}${i.comment ? `: ${i.comment}` : ""}`),
      );
  }
  return out.join("\n").slice(0, 4000);
}
