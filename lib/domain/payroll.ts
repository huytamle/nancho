// Bảng công & lương (BLUEPRINT §17.7). Thuần. Tiền là số nguyên VND; mỗi dòng phiếu lương làm tròn đến đồng.
// Đơn giá theo giờ có lịch sử (`effective_from`) — áp theo ngày công nên đổi giá giữa tháng tách thành hai dòng.

import type { ISODate } from "@/lib/domain/time";
import type { Role } from "@/lib/domain/roles";
import type { DayWork } from "@/lib/domain/worktime";

export type PayrollSettings = {
  /** Lương tối thiểu giờ (vùng III: 20.000đ/giờ — owner cập nhật khi Nhà nước đổi mức). */
  minHourly: number;
  payDay: number;
  /** Quỹ thưởng = % tổng doanh thu tháng (café Sapo + pizza hoàn tất), chia theo giờ công. */
  revenueBonusPct: number;
  complianceBonus: number;
  /** Tiêu chí thưởng tuân thủ (§16 #15). */
  maxLate: number;
  minChecklistPct: number;
  maxCashVariance: number;
};

export const DEFAULT_PAYROLL: PayrollSettings = {
  minHourly: 20_000,
  payDay: 5,
  revenueBonusPct: 1,
  complianceBonus: 300_000,
  maxLate: 2,
  minChecklistPct: 95,
  maxCashVariance: 20_000,
};

/** Phụ cấp theo % đơn giá giờ thường (BLLĐ 2019 Đ.98). */
export const NIGHT_PCT = 30;
export const OVERTIME_PCT = 50;
export const NIGHT_OVERTIME_PCT = 20;
export const DEFAULT_HOLIDAY_MULTIPLIER = 3;

export type PayRate = { hourlyRate: number; effectiveFrom: ISODate };

/** Đơn giá áp cho ngày công `date` (bản ghi có `effective_from` ≤ date, mới nhất). */
export function rateOn(rates: readonly PayRate[], date: ISODate): number | null {
  let best: PayRate | null = null;
  for (const r of rates) if (r.effectiveFrom <= date && (!best || r.effectiveFrom > best.effectiveFrom)) best = r;
  return best?.hourlyRate ?? null;
}

export const validRate = (rate: number, minHourly: number) => Number.isInteger(rate) && rate >= minHourly && rate <= 10_000_000;

export const PAY_LINE_KINDS = ["base", "night", "overtime", "holiday", "revenue_bonus", "compliance_bonus", "adjustment"] as const;
export type PayLineKind = (typeof PAY_LINE_KINDS)[number];
export type PayLine = { kind: PayLineKind; label: string; minutes?: number; rate?: number; amount: number };

const LABEL: Record<PayLineKind, string> = {
  base: "Lương theo giờ",
  night: "Phụ cấp làm đêm",
  overtime: "Làm thêm giờ (+50%)",
  holiday: "Làm ngày lễ",
  revenue_bonus: "Thưởng doanh thu",
  compliance_bonus: "Thưởng tuân thủ",
  adjustment: "Điều chỉnh",
};
export const payLineLabel = (k: PayLineKind) => LABEL[k];

/** phút × đơn giá giờ × pct% → đồng (làm tròn). */
const pay = (minutes: number, rate: number, pct = 100) => Math.round((minutes * rate * pct) / 6000);

/**
 * Các dòng lương từ ngày công. Thiếu đơn giá cho một ngày có giờ công → `{ missingRate: date }`.
 * Mỗi đơn giá một nhóm dòng: lương giờ (100% mọi phút) + đêm (30%; làm thêm ban đêm +20%) + làm thêm (+50%) + lễ (hệ số − 1).
 */
export function workLines(days: readonly DayWork[], rates: readonly PayRate[]): PayLine[] | { missingRate: ISODate } {
  const groups = new Map<number, { minutes: number; night: number; nightOt: number; overtime: number; holidayExtra: number; holiday: number }>();
  for (const d of days) {
    if (d.minutes === 0) continue;
    const rate = rateOn(rates, d.date);
    if (rate === null) return { missingRate: d.date };
    const g = groups.get(rate) ?? groups.set(rate, { minutes: 0, night: 0, nightOt: 0, overtime: 0, holidayExtra: 0, holiday: 0 }).get(rate)!;
    g.minutes += d.minutes;
    g.night += d.night;
    g.nightOt += d.nightOvertime;
    g.overtime += d.overtime;
    g.holiday += d.holiday;
    g.holidayExtra += d.holidayExtra;
  }
  const lines: PayLine[] = [];
  for (const [rate, g] of [...groups].sort((a, b) => a[0] - b[0])) {
    lines.push({ kind: "base", label: LABEL.base, minutes: g.minutes, rate, amount: pay(g.minutes, rate) });
    if (g.night > 0) {
      lines.push({ kind: "night", label: LABEL.night, minutes: g.night, rate, amount: pay(g.night, rate, NIGHT_PCT) + pay(g.nightOt, rate, NIGHT_OVERTIME_PCT) });
    }
    if (g.overtime > 0) lines.push({ kind: "overtime", label: LABEL.overtime, minutes: g.overtime, rate, amount: pay(g.overtime, rate, OVERTIME_PCT) });
    if (g.holiday > 0) lines.push({ kind: "holiday", label: LABEL.holiday, minutes: g.holiday, rate, amount: pay(g.holidayExtra, rate) });
  }
  return lines;
}

/** Quỹ thưởng doanh thu (làm tròn xuống đồng). */
export const revenuePool = (revenue: number, pct: number) => Math.floor((Math.max(0, revenue) * pct) / 100);

/**
 * Chia quỹ theo tỉ lệ phút công — phương pháp số dư lớn nhất: tổng các phần đúng bằng quỹ.
 * Hoà số dư → id nhỏ hơn trước (ổn định).
 */
export function splitPool(pool: number, weights: readonly { id: number; minutes: number }[]): Map<number, number> {
  const out = new Map<number, number>(weights.map((w) => [w.id, 0]));
  const total = weights.reduce((n, w) => n + Math.max(0, w.minutes), 0);
  if (pool <= 0 || total === 0) return out;
  const parts = weights.map((w) => {
    const exact = (pool * Math.max(0, w.minutes)) / total;
    return { id: w.id, floor: Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  let left = pool - parts.reduce((n, p) => n + p.floor, 0);
  for (const p of [...parts].sort((a, b) => b.rem - a.rem || a.id - b.id)) {
    out.set(p.id, p.floor + (left > 0 ? 1 : 0));
    if (left > 0) left--;
  }
  return out;
}

export type ComplianceStats = { late: number; checklistPct: number | null; maxCashVariance: number | null };
export type ComplianceMiss = "late" | "checklist" | "cash";

/** Đạt thưởng tuân thủ? Chỉ số chưa có dữ liệu (không làm checklist nào, không đóng ca nào) → không tính trượt. */
export function complianceMisses(s: ComplianceStats, p: Pick<PayrollSettings, "maxLate" | "minChecklistPct" | "maxCashVariance">): ComplianceMiss[] {
  const out: ComplianceMiss[] = [];
  if (s.late > p.maxLate) out.push("late");
  if (s.checklistPct !== null && s.checklistPct < p.minChecklistPct) out.push("checklist");
  if (s.maxCashVariance !== null && s.maxCashVariance > p.maxCashVariance) out.push("cash");
  return out;
}

export const payslipTotal = (lines: readonly PayLine[]) => lines.reduce((n, l) => n + l.amount, 0);

// ── Bảng công: ai gửi, ai xác nhận (§17.1 — không ai tự duyệt cho mình) ──

export type TimesheetStatus = "draft" | "submitted" | "acknowledged";
export type PayslipStatus = "draft" | "approved" | "paid";

/** Có tính công/lương không — chủ quán không chấm công. */
export const onPayroll = (roles: readonly Role[]) => !roles.includes("owner");

/**
 * Gửi bảng công / sửa giờ công của `target`: không phải của chính mình; bảng công của quản lý do chủ quán gửi;
 * của nhân viên do quản lý hoặc chủ quán.
 */
export function canManageTime(actor: { id: number; roles: readonly Role[] }, target: { id: number; roles: readonly Role[] }): boolean {
  if (actor.id === target.id || !onPayroll(target.roles)) return false;
  if (actor.roles.includes("owner")) return true;
  return actor.roles.includes("manager") && !target.roles.includes("manager");
}

/** JSON ổn định (khoá sắp xếp) — để băm `snapshot` khi xác nhận. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}
