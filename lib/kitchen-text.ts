// Văn bản dựng sẵn cho bếp (§10.2, §10.5, §10.6): Bảng Tổng Hợp, danh sách gửi shipper, quầy Rêu, bài đăng.
// Thuần — dùng chung cho nút Copy (client) và Telegram (server), có unit test.

import { formatPhone } from "@/lib/domain/phone";
import type { PrepIngredient, PrepReport, PrepStop } from "@/lib/domain/prep";
import { vnWeekday, type ISODate } from "@/lib/domain/time";
import { formatPrice } from "@/lib/format";

const WEEKDAY_LONG = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const num = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

/** "2026-11-06" → "Thứ Sáu 06/11". */
export function longDate(date: ISODate): string {
  const [, m, d] = date.split("-");
  return `${WEEKDAY_LONG[vnWeekday(date)]} ${d}/${m}`;
}

/** Tên gọn trong bếp: "Pan Pizza Pepperoni" → "Pepperoni", "Combo Đôi — 1 Pan Pizza + 1 BBQ" → "Combo Đôi". */
export function kitchenName(name: string): string {
  return name.replace(/^Pan Pizza /, "").replace(/ — .*$/, "");
}

/** "1.620 g" · "6 túi (≈3 kg)". */
export function ingredientQty(i: Pick<PrepIngredient, "qty" | "unit" | "approxKg">): string {
  const base = `${num.format(i.qty)} ${i.unit}`;
  return i.approxKg ? `${base} (≈${num.format(i.approxKg)} kg)` : base;
}

/** Dòng phụ dưới nguyên liệu: "4 bán · 3 tặng" hoặc "5 Pepperoni · 4 Phô mai Bơ tỏi". */
export function ingredientDetail(i: Pick<PrepIngredient, "split" | "byProduct">): string | null {
  if (i.split) return `${num.format(i.split.sold)} bán · ${num.format(i.split.gift)} tặng`;
  if (i.byProduct) return i.byProduct.map((p) => `${p.qty} ${kitchenName(p.name)}`).join(" · ");
  return null;
}

const sum = (xs: { qty: number }[]) => xs.reduce((s, x) => s + x.qty, 0);

/** "3 Pizza + 2 BBQ" của một mẻ. */
export function batchMains(b: Pick<PrepReport["batches"][number], "pizza" | "bbq">): string {
  const parts = [sum(b.pizza) ? `${sum(b.pizza)} Pizza` : null, sum(b.bbq) ? `${sum(b.bbq)} BBQ` : null].filter(Boolean);
  return parts.length ? parts.join(" + ") : "Chưa có đơn";
}

export function warningText(w: PrepReport["warnings"][number]): string {
  return w.kind === "allergy_note" ? `#${w.seq} ghi chú: "${w.text}"` : `#${w.seq} ${w.text.toLocaleLowerCase("vi")}`;
}

/** Bảng Tổng Hợp dạng text (Telegram sau giờ chốt, nút Copy). */
export function prepSummaryText(r: PrepReport, o: { date: ISODate; cutoffLabel: string | null }): string {
  const lines: string[] = [`🔥 THE HEAT · BẾP · ${longDate(o.date)}`];
  lines.push(
    r.isFinal && o.cutoffLabel ? `🔒 ĐÃ CHỐT SỔ ${o.cutoffLabel} · ${r.orderCount} đơn` : `⏳ TẠM TÍNH · ${r.orderCount} đơn`,
    `TỔNG: ${r.totals.mains.pizza} Pizza · ${r.totals.mains.bbq} BBQ`,
  );
  if (r.totals.ingredients.length > 0) {
    lines.push("", "LẤY RA TỦ");
    for (const i of r.totals.ingredients) {
      const detail = ingredientDetail(i);
      lines.push(`• ${i.label}: ${ingredientQty(i)}${detail ? ` (${detail})` : ""}`);
    }
  }
  if (r.batches.length > 0) {
    lines.push("", "CHIA THEO MẺ");
    for (const b of r.batches) {
      lines.push(`▸ Mẻ ${b.ovenLabel} → Giao ${b.readyLabel} · ${batchMains(b)}`);
      for (const route of b.routes) lines.push(`  🛵 ${route.routeName}: ${route.stops.map((s) => s.name).join(" · ")}`);
      for (const p of b.pickups) lines.push(`  ☕ ${p.pointName}: ${p.orders.map((x) => x.name).join(" · ")}`);
    }
  }
  if (r.warnings.length > 0) {
    lines.push("");
    for (const w of r.warnings) lines.push(`⚠ ${warningText(w)}`);
  }
  return lines.join("\n");
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Văn bản dán vào Zalo cho shipper (§10.5). */
export function shipperText(o: { readyLabel: string; routeName: string; stops: PrepStop[] }): string {
  const collect = o.stops.reduce((s, x) => s + x.collect, 0);
  const head = `🛵 MẺ ${o.readyLabel} · ${o.routeName.toLocaleUpperCase("vi")} · ${o.stops.length} điểm · Thu ${formatPrice(collect)}`;
  const body = o.stops.flatMap((s, i) => {
    const where = [s.zone, s.address].filter(Boolean).join(" · ");
    const pay = s.collect > 0 ? `THU ${formatPrice(s.collect)}` : "ĐÃ CK";
    return [
      `${i + 1}) #${pad2(s.seq)} ${s.name} ${formatPhone(s.phone)} — ${where} — ${pay}`,
      ...(s.note ? [`   📝 ${s.note}`] : []),
      ...(s.mapsUrl ? [`   📍 ${s.mapsUrl}`] : []),
    ];
  });
  return [head, ...body].join("\n");
}

/** Danh sách khách lấy tại quầy Rêu cho nhân viên café (§10.5). */
export function pickupText(o: { readyLabel: string; pointName: string; orders: { seq: number; name: string; collect: number }[] }): string {
  return [
    `☕ ${o.pointName.toLocaleUpperCase("vi")} · MẺ ${o.readyLabel} · ${o.orders.length} khách`,
    ...o.orders.map((x) => `#${pad2(x.seq)} ${x.name} — ${x.collect > 0 ? `THU ${formatPrice(x.collect)}` : "ĐÃ TRẢ"}`),
  ].join("\n");
}

/** Chỉ đường Google Maps qua các điểm có toạ độ, xuất phát từ bếp (nếu có toạ độ). */
export function routeMapsUrl(stops: { lat: number | null; lng: number | null }[], origin: string | null): string | null {
  const pts = stops.filter((s) => s.lat !== null && s.lng !== null).map((s) => `${s.lat},${s.lng}`);
  if (pts.length === 0) return null;
  const q = new URLSearchParams({ api: "1", destination: pts[pts.length - 1], travelmode: "two-wheeler" });
  if (origin) q.set("origin", origin);
  if (pts.length > 1) q.set("waypoints", pts.slice(0, -1).join("|"));
  return `https://www.google.com/maps/dir/?${q}`;
}

/** Bài đăng Facebook/Zalo từ số suất thật (§10.6, MARKETING.md). */
export function promoPostText(o: { dayWord: string; slots: { readyLabel: string; remaining: number }[]; url: string }): string {
  const open = o.slots.filter((s) => s.remaining > 0);
  if (open.length === 0) return `🔥 ${o.dayWord} THE HEAT đã kín lò — cảm ơn cả nhà! Đặt trước cho hôm sau tại ${o.url}`;
  const left = open.map((s) => `mẻ ${s.readyLabel} còn ${s.remaining} suất`).join(" · ");
  return [
    `🔥 ${o.dayWord}: ${left}`,
    "Pan pizza viền phô mai cháy & sườn BBQ sous-vide — nướng theo mẻ, đặt trước mới làm.",
    `👉 Đặt tại ${o.url}`,
  ].join("\n");
}
