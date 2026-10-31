"use server";

import { headers } from "next/headers";
import * as z from "zod";
import { isISODate, isHHmm, parseVnLocal, type ISODate } from "@/lib/domain/time";
import { isPeriod, type Period } from "@/lib/domain/worktime";
import { MAX_AMOUNT } from "@/lib/domain/money-text";
import {
  ackPayslipCore,
  ackTimesheetCore,
  advancePayslipCore,
  buildPayslipsCore,
  clockInCore,
  clockOutCore,
  copyLastWeekCore,
  disputeTimesheetCore,
  editPayslipCore,
  markStoreIpCore,
  reviewTimeEntryCore,
  saveHolidayCore,
  savePayRateCore,
  savePayrollSettingsCore,
  savePlanCore,
  saveTimeEntryCore,
  submitTimesheetCore,
} from "@/lib/server/dal/payroll";
import { PIN_RE } from "@/lib/server/dal/staff";
import { notifyOps, runOps as run } from "@/lib/server/ops/run";
import { clientIp, MIN, rateLimit } from "@/lib/server/rate-limit";

// Chấm công, lịch ca, bảng công, lương (§17.7). Giờ vào/ra lấy theo đồng hồ server, IP từ header proxy.

const id = z.number().int().positive();
const date = z.string().refine(isISODate).transform((v) => v as ISODate);
const period = z.string().refine(isPeriod).transform((v) => v as Period);
const hm = z.string().refine(isHHmm);
const local = z.string().transform((v, c) => {
  const d = parseVnLocal(v);
  if (!d) c.addIssue({ code: "custom", message: "datetime" });
  return d as Date;
});
const reason = z.string().trim().max(200);

export async function clockIn() {
  const ip = await clientIp();
  return run(z.object({}), {}, (_i, actor, now) => clockInCore({ ip }, { actor, now }));
}

export async function clockOut() {
  const ip = await clientIp();
  return run(z.object({}), {}, (_i, actor, now) => clockOutCore({ ip }, { actor, now }));
}

const Entry = z.object({ id: id.optional(), staffId: id, clockIn: local, clockOut: local, reason });
export async function saveTimeEntry(raw: z.input<typeof Entry>) {
  return run(Entry, raw, (i, actor, now) => saveTimeEntryCore(i, { actor, now }));
}

const ById = z.object({ id });
export async function reviewTimeEntry(raw: z.input<typeof ById>) {
  return run(ById, raw, (i, actor, now) => reviewTimeEntryCore(i, { actor, now }));
}

const Plan = z.object({ staffId: id, date, start: hm.nullable(), end: hm.nullable() });
export async function savePlan(raw: z.input<typeof Plan>) {
  return run(Plan, raw, (i, actor, now) => savePlanCore(i, { actor, now }));
}

const Week = z.object({ week: date });
export async function copyLastWeek(raw: z.input<typeof Week>) {
  return run(Week, raw, (i, actor, now) => copyLastWeekCore(i, { actor, now }));
}

export async function markStoreIp() {
  const ip = await clientIp();
  return run(z.object({}), {}, (_i, actor, now) => markStoreIpCore({ ip }, { actor, now }));
}

const Submit = z.object({ staffId: id, period });
export async function submitTimesheet(raw: z.input<typeof Submit>) {
  return run(Submit, raw, (i, actor, now) => submitTimesheetCore(i, { actor, now }));
}

const Ack = z.object({ period, pin: z.string().regex(PIN_RE) });
export async function ackTimesheet(raw: z.input<typeof Ack>) {
  const ip = await clientIp();
  const device = (await headers()).get("user-agent") ?? "";
  return run(Ack, raw, async (i, actor, now) => {
    // PIN nhập lại để xác nhận — chặn dò PIN như màn đăng nhập.
    if (!(await rateLimit([{ key: `ack:${actor.id}`, limit: 5, windowSec: 15 * MIN }], now))) return { ok: false as const, reason: "rate_limited" as const };
    return ackTimesheetCore({ ...i, ip, device }, { actor, now });
  });
}

const Dispute = z.object({ period, reason });
export async function disputeTimesheet(raw: z.input<typeof Dispute>) {
  return run(Dispute, raw, async (i, actor, now) => {
    const res = await disputeTimesheetCore(i, { actor, now });
    if (!res.ok) return res;
    notifyOps(res.telegram);
    return { ok: true as const };
  });
}

// ── Lương (chỉ chủ quán — DAL kiểm) ──

const money = z.number().int().min(0).max(MAX_AMOUNT);

const Rate = z.object({ staffId: id, hourlyRate: money, effectiveFrom: date });
export async function savePayRate(raw: z.input<typeof Rate>) {
  return run(Rate, raw, (i, actor, now) => savePayRateCore(i, { actor, now }));
}

const Settings = z.object({
  minHourly: z.number().int().min(1).max(1_000_000),
  payDay: z.number().int().min(1).max(28),
  revenueBonusPct: z.number().min(0).max(20),
  complianceBonus: money,
  maxLate: z.number().int().min(0).max(31),
  minChecklistPct: z.number().min(0).max(100),
  maxCashVariance: money,
});
export async function savePayrollSettings(raw: z.input<typeof Settings>) {
  return run(Settings, raw, (i, actor, now) => savePayrollSettingsCore(i, { actor, now }));
}

const Holiday = z.object({ date, name: z.string().trim().min(1).max(60), multiplier: z.number().min(1).max(5), remove: z.boolean().optional() });
export async function saveHoliday(raw: z.input<typeof Holiday>) {
  return run(Holiday, raw, (i, actor, now) => saveHolidayCore(i, { actor, now }));
}

const Build = z.object({ period });
export async function buildPayslips(raw: z.input<typeof Build>) {
  return run(Build, raw, (i, actor, now) => buildPayslipsCore(i, { actor, now }));
}

const Edit = z.object({ id, compliance: z.boolean().nullable(), adjustment: z.number().int().min(-MAX_AMOUNT).max(MAX_AMOUNT), adjustmentNote: reason });
export async function editPayslip(raw: z.input<typeof Edit>) {
  return run(Edit, raw, (i, actor, now) => editPayslipCore(i, { actor, now }));
}

const Advance = z.object({ id, to: z.enum(["approved", "paid"]), method: z.enum(["cash", "bank"]).optional() });
export async function advancePayslip(raw: z.input<typeof Advance>) {
  return run(Advance, raw, (i, actor, now) => advancePayslipCore(i, { actor, now }));
}

export async function ackPayslip(raw: z.input<typeof ById>) {
  return run(ById, raw, (i, actor, now) => ackPayslipCore(i, { actor, now }));
}
