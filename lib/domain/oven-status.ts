// State machine của Oven Bar (BLUEPRINT §7.2). Số suất luôn lấy từ dữ liệu thật — không bịa.

import { vnDateOf, vnDayLabel, vnTimeLabel, type ISODate } from "@/lib/domain/time";
import type { Batch, Segment, ServiceDay } from "@/lib/domain/types";

export type SlotLevel = "plenty" | "few" | "last" | "bbq_only" | "full" | "closed";

export type SlotView = {
  batchId: number;
  date: ISODate;
  readyAt: string;
  readyLabel: string;
  cutoffAt: string;
  remainingPan: number;
  remainingBbq: number;
  level: SlotLevel;
  /** `cafe`: `readyLabel` là cả khung giao "08:00–10:30". */
  segment: Segment;
};

export type DayTab = { date: ISODate; label: string; hasCapacity: boolean };

export type OvenStatus =
  | { kind: "open" | "closing_soon"; date: ISODate; nextCutoffAt: string; batchIndex: number; slots: SlotView[]; upcoming: DayTab[] }
  | { kind: "sold_out"; date: ISODate; nextOpenDate: ISODate | null; slots: SlotView[]; upcoming: DayTab[] }
  | { kind: "after_cutoff" | "day_off"; date: ISODate; nextOpenDate: ISODate | null; upcoming: DayTab[] }
  | { kind: "paused"; date: ISODate; message: string; upcoming: DayTab[] };

export type OvenSettings = { closingSoonMin: number; fewThreshold: number };

function levelOf(b: Batch, now: Date, fewThreshold: number): SlotLevel {
  if (b.status !== "open" || now.getTime() >= b.cutoffAt.getTime()) return "closed";
  if (b.segment === "cafe") return "plenty"; // khung cà phê không tính khay lò
  const pan = Math.max(0, b.capPan - b.usedPan);
  const bbq = Math.max(0, b.capBbq - b.usedBbq);
  if (pan === 0) return bbq > 0 ? "bbq_only" : "full";
  if (pan === 1) return "last";
  if (pan <= fewThreshold) return "few";
  return "plenty";
}

/** Các mẻ của một ngày, sắp theo giờ sẵn sàng. */
export function slotsForDay(day: ServiceDay, now: Date, settings: Pick<OvenSettings, "fewThreshold">): SlotView[] {
  return [...day.batches]
    .sort((a, b) => a.readyAt.getTime() - b.readyAt.getTime())
    .map((b) => ({
      batchId: b.id,
      date: day.date,
      readyAt: b.readyAt.toISOString(),
      readyLabel: b.segment === "cafe" ? `${vnTimeLabel(b.ovenAt)}–${vnTimeLabel(b.readyAt)}` : vnTimeLabel(b.readyAt),
      cutoffAt: b.cutoffAt.toISOString(),
      remainingPan: Math.max(0, b.capPan - b.usedPan),
      remainingBbq: Math.max(0, b.capBbq - b.usedBbq),
      level: levelOf(b, now, settings.fewThreshold),
      segment: b.segment,
    }));
}

const bookable = (s: SlotView) => s.level !== "closed" && s.level !== "full";

export function computeOvenStatus(input: { now: Date; days: ServiceDay[]; settings: OvenSettings }): OvenStatus {
  const { now, settings } = input;
  const today = vnDateOf(now);
  const days = input.days.filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date));

  const upcoming: DayTab[] = days
    .filter((d) => d.status === "open" && d.batches.length > 0)
    .map((d) => ({
      date: d.date,
      label: vnDayLabel(d.date, today),
      hasCapacity: slotsForDay(d, now, settings).some(bookable),
    }));
  const nextOpenDate = upcoming.find((t) => t.date > today && t.hasCapacity)?.date ?? null;

  const day = days.find((d) => d.date === today);
  if (day?.status === "paused") {
    return { kind: "paused", date: today, message: day.pauseMessage ?? "", upcoming };
  }
  if (!day || day.status === "closed" || day.batches.length === 0) {
    return { kind: "day_off", date: today, nextOpenDate, upcoming };
  }

  const slots = slotsForDay(day, now, settings);
  const open = slots.filter((s) => s.level !== "closed");
  if (open.length === 0) return { kind: "after_cutoff", date: today, nextOpenDate, upcoming };

  const withCapacity = open.filter((s) => s.level !== "full");
  if (withCapacity.length === 0) return { kind: "sold_out", date: today, nextOpenDate, slots, upcoming };

  const next = withCapacity.reduce((a, b) => (b.cutoffAt < a.cutoffAt ? b : a));
  const msLeft = new Date(next.cutoffAt).getTime() - now.getTime();
  return {
    kind: msLeft <= settings.closingSoonMin * 60_000 ? "closing_soon" : "open",
    date: today,
    nextCutoffAt: next.cutoffAt,
    batchIndex: slots.indexOf(next) + 1,
    slots,
    upcoming,
  };
}

export type DaySlots = { date: ISODate; label: string; slots: SlotView[] };

/** Payload của `GET /api/oven` và Oven Bar stream (§8.2). */
export type OvenSnapshot = {
  serverNow: string;
  status: OvenStatus;
  days: DaySlots[];
  /** Khung giao cà phê (M12) — cùng dạng với mẻ lò. */
  cafe: DaySlots[];
  rules: { maxQtyPerLine: number; freeShipFrom: number | null; deliveryWindowMin: number };
};

/** Các ngày còn mẻ đặt được (hôm nay … +daysAhead) kèm chip giờ — cho tab ngày & chọn mẻ. */
export function upcomingSlots(input: { now: Date; days: ServiceDay[]; settings: Pick<OvenSettings, "fewThreshold"> }): DaySlots[] {
  const today = vnDateOf(input.now);
  return input.days
    .filter((d) => d.date >= today && d.status === "open" && d.batches.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ date: d.date, label: vnDayLabel(d.date, today), slots: slotsForDay(d, input.now, input.settings) }))
    .filter((d) => d.slots.some((s) => s.level !== "closed"));
}
