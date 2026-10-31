// Chấm công & tính giờ (BLUEPRINT §17.7). Thuần — giờ VN (UTC+7), theo phút thực (cắt giây), không làm tròn.
// Mỗi phút làm việc được phân loại: ban đêm (22:00–06:00, BLLĐ 2019 Đ.98 khoản 2) · ngày lễ (theo ngày dương
// lịch của chính phút đó) · làm thêm (phần vượt 8 giờ trong một *ngày công* — ngày công = ngày VN của giờ vào ca).
// Ca tối bắt đầu trễ không phát sinh làm thêm: chỉ tính khi tổng giờ trong ngày công vượt 8 giờ.

import { addDays, vnDateOf, vnInstant, type ISODate } from "@/lib/domain/time";

export type WorkEntry = { clockIn: Date; clockOut: Date | null };
export type Holiday = { date: ISODate; multiplier: number };
/** Lịch ca (`shift_plans`) — "HH:mm", kết thúc sau bắt đầu trong cùng ngày. */
export type PlanSlot = { date: ISODate; start: string; end: string };

export const NIGHT_START_MIN = 22 * 60;
export const NIGHT_END_MIN = 6 * 60;
export const REGULAR_DAY_MIN = 8 * 60;
/** Vào ca muộn hơn lịch quá số phút này → tính một lần đi muộn. */
export const LATE_GRACE_MIN = 5;
/** Ra ca muộn hơn lịch quá số phút này → cờ `late_out` để quản lý xác nhận. */
export const LATE_OUT_MIN = 15;
/** Quên ra ca: lượt còn mở từ trước mốc 03:00 gần nhất. */
export const FORGOT_CUTOFF = "03:00";
/** Một lượt dài quá mức này coi như nhập sai (sửa giờ). */
export const MAX_ENTRY_MIN = 16 * 60;

export const TIME_FLAGS = ["off_site", "forgot_out", "late_out", "edited"] as const;
export type TimeFlag = (typeof TIME_FLAGS)[number];

export type DayWork = {
  date: ISODate;
  minutes: number;
  night: number;
  /** Phút làm thêm ngoài ngày lễ (ngày lễ đã trả theo hệ số lễ). */
  overtime: number;
  /** Phút làm thêm rơi vào ban đêm (thêm 20% — Đ.98 khoản 3). */
  nightOvertime: number;
  holiday: number;
  /** Σ (hệ số lễ − 1) theo từng phút ngày lễ — phần trả thêm quy ra "phút lương thường". */
  holidayExtra: number;
  late: boolean;
  early: boolean;
  planned: boolean;
};

export type WorkTotals = Omit<DayWork, "date" | "late" | "early" | "planned"> & { days: number; late: number; early: number };

const MIN_MS = 60_000;
const VN_OFFSET_MIN = 7 * 60;
/** Phút kể từ epoch theo đồng hồ VN (đã cắt giây). */
const vnMinute = (d: Date) => Math.floor(d.getTime() / MIN_MS) + VN_OFFSET_MIN;
const dateOfVnMinute = (m: number) => new Date((m - VN_OFFSET_MIN) * MIN_MS);

export const entryMinutes = (e: { clockIn: Date; clockOut: Date }) => Math.max(0, vnMinute(e.clockOut) - vnMinute(e.clockIn));

const isNight = (minuteOfDay: number) => minuteOfDay >= NIGHT_START_MIN || minuteOfDay < NIGHT_END_MIN;

function emptyDay(date: ISODate): DayWork {
  return { date, minutes: 0, night: 0, overtime: 0, nightOvertime: 0, holiday: 0, holidayExtra: 0, late: false, early: false, planned: false };
}

/**
 * Gom các lượt chấm công thành ngày công. Lượt chưa ra ca bị bỏ qua (không tự cộng giờ).
 * Kết quả sắp theo ngày; ngày chỉ có lịch mà không có lượt vẫn xuất hiện (`minutes = 0`).
 */
export function workDays(entries: readonly WorkEntry[], opts: { holidays?: readonly Holiday[]; plans?: readonly PlanSlot[] } = {}): DayWork[] {
  const holidays = new Map((opts.holidays ?? []).map((h) => [h.date, h.multiplier]));
  const days = new Map<ISODate, DayWork>();
  const day = (d: ISODate) => days.get(d) ?? days.set(d, emptyDay(d)).get(d)!;
  const closed = entries
    .filter((e): e is { clockIn: Date; clockOut: Date } => e.clockOut !== null && e.clockOut > e.clockIn)
    .sort((a, b) => a.clockIn.getTime() - b.clockIn.getTime());

  for (const e of closed) {
    const d = day(vnDateOf(e.clockIn));
    const start = vnMinute(e.clockIn);
    const end = vnMinute(e.clockOut);
    for (let m = start; m < end; m++) {
      const minuteOfDay = ((m % 1440) + 1440) % 1440;
      const calDate = vnDateOf(dateOfVnMinute(m));
      const night = isNight(minuteOfDay);
      const mult = holidays.get(calDate);
      const ot = d.minutes >= REGULAR_DAY_MIN;
      d.minutes++;
      if (night) d.night++;
      if (mult !== undefined) {
        d.holiday++;
        d.holidayExtra += mult - 1;
      } else if (ot) d.overtime++;
      if (ot && night) d.nightOvertime++;
    }
  }

  for (const p of opts.plans ?? []) {
    const d = day(p.date);
    d.planned = true;
    const mine = closed.filter((e) => vnDateOf(e.clockIn) === p.date);
    if (mine.length === 0) continue;
    const firstIn = mine[0].clockIn;
    const lastOut = mine.reduce((max, e) => (e.clockOut > max ? e.clockOut : max), mine[0].clockOut);
    d.late = firstIn.getTime() > vnInstant(p.date, p.start).getTime() + LATE_GRACE_MIN * MIN_MS;
    d.early = lastOut.getTime() < vnInstant(p.date, p.end).getTime() - LATE_GRACE_MIN * MIN_MS;
  }
  for (const d of days.values()) d.holidayExtra = Math.round(d.holidayExtra * 100) / 100;
  return [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function workTotals(days: readonly DayWork[]): WorkTotals {
  const t: WorkTotals = { minutes: 0, night: 0, overtime: 0, nightOvertime: 0, holiday: 0, holidayExtra: 0, days: 0, late: 0, early: 0 };
  for (const d of days) {
    t.minutes += d.minutes;
    t.night += d.night;
    t.overtime += d.overtime;
    t.nightOvertime += d.nightOvertime;
    t.holiday += d.holiday;
    t.holidayExtra += d.holidayExtra;
    if (d.minutes > 0) t.days++;
    if (d.late) t.late++;
    if (d.early) t.early++;
  }
  t.holidayExtra = Math.round(t.holidayExtra * 100) / 100;
  return t;
}

/** Ra ca muộn hơn lịch > 15 phút → `late_out` (dọn dẹp thật thì giữ, ngồi lại thì sửa giờ). */
export function isLateOut(clockOut: Date, plan: PlanSlot | null | undefined): boolean {
  if (!plan) return false;
  return clockOut.getTime() > vnInstant(plan.date, plan.end).getTime() + LATE_OUT_MIN * MIN_MS;
}

/** Mốc 03:00 VN gần nhất ≤ now. */
export function forgotCutoff(now: Date): Date {
  const today = vnInstant(vnDateOf(now), FORGOT_CUTOFF);
  return now >= today ? today : vnInstant(addDays(vnDateOf(now), -1), FORGOT_CUTOFF);
}

/** Lượt còn mở từ trước mốc 03:00 gần nhất → quên ra ca. */
export const isForgotten = (e: WorkEntry, now: Date) => e.clockOut === null && e.clockIn < forgotCutoff(now);

/** IP công khai có thuộc Wi-Fi quán không. Chưa cấu hình → không gắn cờ (chưa biết đâu là quán). */
export const isOffSite = (ip: string, storeIps: readonly string[]) => storeIps.length > 0 && !storeIps.includes(ip);

// ── Kỳ lương (tháng) ──

export type Period = `${number}-${number}`;
const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const isPeriod = (v: string): v is Period => PERIOD_RE.test(v);
export const periodOf = (date: ISODate) => date.slice(0, 7) as Period;
export const periodStart = (p: Period) => `${p}-01` as ISODate;
export function nextPeriod(p: Period): Period {
  const [y, m] = p.split("-").map(Number);
  return (m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`) as Period;
}
export function prevPeriod(p: Period): Period {
  const [y, m] = p.split("-").map(Number);
  return (m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`) as Period;
}
/** [đầu kỳ, đầu kỳ sau) theo giờ VN. */
export const periodRange = (p: Period) => ({ from: vnInstant(periodStart(p), "00:00"), to: vnInstant(periodStart(nextPeriod(p)), "00:00") });
/** "2026-11" → "11/2026". */
export const periodLabel = (p: Period) => `${p.slice(5)}/${p.slice(0, 4)}`;

/** 375 → "6 giờ 15 phút" · 60 → "1 giờ" · 20 → "20 phút". */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} phút`;
  return m === 0 ? `${h} giờ` : `${h} giờ ${m} phút`;
}

/** Thứ Hai của tuần chứa `date`. */
export function weekStart(date: ISODate): ISODate {
  const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}
