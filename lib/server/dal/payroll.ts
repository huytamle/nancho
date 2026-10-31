import "server-only";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { canEditOps, progress } from "@/lib/domain/checklist";
import {
  canManageTime,
  canonicalJson,
  complianceMisses,
  onPayroll,
  payLineLabel,
  payslipTotal,
  revenuePool,
  splitPool,
  validRate,
  workLines,
  type ComplianceMiss,
  type ComplianceStats,
  type PayLine,
  type PayRate,
  type PayrollSettings,
  type PayslipStatus,
  type TimesheetStatus,
} from "@/lib/domain/payroll";
import { hasRole, type Role } from "@/lib/domain/roles";
import { addDays, isISODate, vnDateOf, type ISODate } from "@/lib/domain/time";
import {
  entryMinutes,
  forgotCutoff,
  isForgotten,
  isLateOut,
  isOffSite,
  MAX_ENTRY_MIN,
  nextPeriod,
  periodOf,
  periodRange,
  periodStart,
  prevPeriod,
  weekStart,
  workDays,
  workTotals,
  type DayWork,
  type Period,
  type PlanSlot,
  type TimeFlag,
  type WorkTotals,
} from "@/lib/domain/worktime";
import { forgotOutText, paydayText, periodName, timesheetDisputeText, timesheetDraftText, timesheetRemindText } from "@/lib/ops-text";
import { getDb, type Db, type Executor } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { fail, logEvent, type OpsActor, type OpsCtx, type OpsFail } from "@/lib/server/dal/ops";
import { loadSettings } from "@/lib/server/dal/settings";
import { verifyStaffPin } from "@/lib/server/dal/staff";

// Chấm công, lịch ca, bảng công & lương (§17.7). Quyền nghiệp vụ kiểm tra ở đây (int test gọi thẳng):
// không ai tự duyệt/sửa công của mình; bảng công của quản lý do chủ quán gửi; tiền lương CHỈ chủ quán thấy —
// `loadTimeView` không bao giờ có đơn giá/số tiền của người khác, `loadPayrollView` trả null cho ai không phải owner.

type Ctx = OpsCtx;
type Fail = OpsFail;
type Ok<T = object> = { ok: true } & T;

const isOwner = (a: { roles: readonly Role[] }) => a.roles.includes("owner");
const currentPeriod = (now: Date) => periodOf(vnDateOf(now));
const hhmm = (v: string) => v.slice(0, 5);

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

async function staffRow(db: Executor, id: number) {
  const [s] = await db.select({ id: t.staff.id, name: t.staff.name, roles: t.staff.roles, isActive: t.staff.isActive }).from(t.staff).where(eq(t.staff.id, id));
  return s ?? null;
}

/** Bảng công kỳ này đã gửi/xác nhận → giờ công trong kỳ bị khoá. */
async function periodLocked(db: Executor, staffId: number, period: Period): Promise<boolean> {
  const [ts] = await db
    .select({ status: t.timesheets.status })
    .from(t.timesheets)
    .where(and(eq(t.timesheets.staffId, staffId), eq(t.timesheets.period, period)));
  return !!ts && ts.status !== "draft";
}

async function planFor(db: Executor, staffId: number, date: ISODate): Promise<PlanSlot | null> {
  const [p] = await db.select().from(t.shiftPlans).where(and(eq(t.shiftPlans.staffId, staffId), eq(t.shiftPlans.date, date)));
  return p ? { date: p.date, start: hhmm(p.start), end: hhmm(p.end) } : null;
}

/** Quên ra ca: đóng lượt với 0 phút (không tự cộng giờ) + cờ `forgot_out` — quản lý sửa giờ kèm lý do. */
async function markForgotten(db: Executor, id: number) {
  await db
    .update(t.timeEntries)
    .set({ clockOut: sql`${t.timeEntries.clockIn}`, flags: sql`array_append(${t.timeEntries.flags}, 'forgot_out')` })
    .where(and(eq(t.timeEntries.id, id), isNull(t.timeEntries.clockOut)));
}

// ── Vào/ra ca ──

export async function clockInCore(input: { ip: string }, ctx: Ctx): Promise<Ok<{ at: string; offSite: boolean; closedForgotten: boolean }> | Fail> {
  if (!onPayroll(ctx.actor.roles)) return fail("forbidden");
  const db = ctx.db ?? getDb();
  const { ops } = await loadSettings(db);
  try {
    return await db.transaction(async (tx) => {
      const [open] = await tx
        .select()
        .from(t.timeEntries)
        .where(and(eq(t.timeEntries.staffId, ctx.actor.id), isNull(t.timeEntries.clockOut)))
        .for("update");
      let closedForgotten = false;
      if (open) {
        if (!isForgotten(open, ctx.now)) return fail("clocked_in");
        await markForgotten(tx, open.id);
        await logEvent(tx, "forgot_out", ctx.actor, { entryId: open.id }, ctx.now);
        closedForgotten = true;
      }
      if (await periodLocked(tx, ctx.actor.id, currentPeriod(ctx.now))) return fail("locked");
      const offSite = isOffSite(input.ip, ops.storeIps);
      const [row] = await tx
        .insert(t.timeEntries)
        .values({ staffId: ctx.actor.id, clockIn: ctx.now, inIp: input.ip, flags: offSite ? ["off_site"] : [], createdAt: ctx.now })
        .returning({ id: t.timeEntries.id });
      await logEvent(tx, "clock_in", ctx.actor, { entryId: row.id, ip: input.ip, offSite }, ctx.now);
      return { ok: true as const, at: ctx.now.toISOString(), offSite, closedForgotten };
    });
  } catch (err) {
    // Bấm hai lần cùng lúc: index "một lượt mở mỗi người" chặn lượt thứ hai.
    if (isUniqueViolation(err)) return fail("clocked_in");
    throw err;
  }
}

export async function clockOutCore(input: { ip: string }, ctx: Ctx): Promise<Ok<{ minutes: number; forgot: boolean; lateOut: boolean; offSite: boolean }> | Fail> {
  const db = ctx.db ?? getDb();
  const { ops } = await loadSettings(db);
  return db.transaction(async (tx) => {
    const [open] = await tx
      .select()
      .from(t.timeEntries)
      .where(and(eq(t.timeEntries.staffId, ctx.actor.id), isNull(t.timeEntries.clockOut)))
      .for("update");
    if (!open) return fail("not_clocked_in");
    if (isForgotten(open, ctx.now)) {
      await markForgotten(tx, open.id);
      await logEvent(tx, "forgot_out", ctx.actor, { entryId: open.id }, ctx.now);
      return { ok: true as const, minutes: 0, forgot: true, lateOut: false, offSite: false };
    }
    const flags = new Set<TimeFlag>(open.flags);
    const offSite = isOffSite(input.ip, ops.storeIps);
    const lateOut = isLateOut(ctx.now, await planFor(tx, ctx.actor.id, vnDateOf(open.clockIn)));
    if (offSite) flags.add("off_site");
    if (lateOut) flags.add("late_out");
    await tx.update(t.timeEntries).set({ clockOut: ctx.now, outIp: input.ip, flags: [...flags] }).where(eq(t.timeEntries.id, open.id));
    const minutes = entryMinutes({ clockIn: open.clockIn, clockOut: ctx.now });
    await logEvent(tx, "clock_out", ctx.actor, { entryId: open.id, ip: input.ip, minutes, flags: [...flags] }, ctx.now);
    return { ok: true as const, minutes, forgot: false, lateOut, offSite };
  });
}

/** Cron: gắn cờ quên ra ca cho lượt còn mở từ trước 03:00. Trả tin Telegram (null nếu không có ai). */
export async function flagForgottenCore(now: Date, db: Db = getDb()): Promise<string | null> {
  const rows = await db
    .select({ id: t.timeEntries.id, clockIn: t.timeEntries.clockIn, name: t.staff.name })
    .from(t.timeEntries)
    .innerJoin(t.staff, eq(t.staff.id, t.timeEntries.staffId))
    .where(and(isNull(t.timeEntries.clockOut), lt(t.timeEntries.clockIn, forgotCutoff(now))));
  for (const r of rows) await markForgotten(db, r.id);
  if (rows.length === 0) return null;
  await db.insert(t.opsEvents).values({ type: "forgot_out", actor: "system", data: { entryIds: rows.map((r) => r.id) }, createdAt: now });
  return forgotOutText(rows.map((r) => ({ name: r.name, clockIn: r.clockIn })));
}

// ── Sửa giờ (quản lý/chủ quán, kèm lý do) ──

export type TimeEntryInput = { id?: number; staffId: number; clockIn: Date; clockOut: Date; reason: string };

export async function saveTimeEntryCore(input: TimeEntryInput, ctx: Ctx): Promise<Ok<{ id: number }> | Fail> {
  const db = ctx.db ?? getDb();
  const target = await staffRow(db, input.staffId);
  if (!target) return fail("not_found");
  if (!canManageTime(ctx.actor, target)) return fail("forbidden");
  const reason = input.reason.trim();
  if (reason.length < 3) return fail("reason_required");
  const minutes = entryMinutes(input);
  if (input.clockOut <= input.clockIn || minutes > MAX_ENTRY_MIN || input.clockOut > ctx.now) return fail("invalid");
  return db.transaction(async (tx) => {
    let before: { clockIn: Date; clockOut: Date | null; flags: TimeFlag[] } | null = null;
    if (input.id) {
      const [row] = await tx
        .select()
        .from(t.timeEntries)
        .where(and(eq(t.timeEntries.id, input.id), eq(t.timeEntries.staffId, input.staffId)))
        .for("update");
      if (!row) return fail("not_found");
      before = row;
      if (await periodLocked(tx, input.staffId, periodOf(vnDateOf(row.clockIn)))) return fail("locked");
    }
    if (await periodLocked(tx, input.staffId, periodOf(vnDateOf(input.clockIn)))) return fail("locked");
    // Không chồng lên lượt khác của cùng người (tránh cộng giờ hai lần).
    const [overlap] = await tx
      .select({ id: t.timeEntries.id })
      .from(t.timeEntries)
      .where(
        and(
          eq(t.timeEntries.staffId, input.staffId),
          input.id ? ne(t.timeEntries.id, input.id) : undefined,
          lt(t.timeEntries.clockIn, input.clockOut),
          sql`coalesce(${t.timeEntries.clockOut}, 'infinity'::timestamptz) > ${input.clockIn.toISOString()}::timestamptz`,
        ),
      )
      .limit(1);
    if (overlap) return fail("invalid");
    const flags = [...new Set<TimeFlag>([...(before?.flags ?? []).filter((f) => f !== "forgot_out"), "edited"])];
    let id = input.id ?? 0;
    if (input.id) {
      await tx
        .update(t.timeEntries)
        .set({ clockIn: input.clockIn, clockOut: input.clockOut, flags, editReason: reason })
        .where(eq(t.timeEntries.id, input.id));
    } else {
      const [row] = await tx
        .insert(t.timeEntries)
        .values({ staffId: input.staffId, clockIn: input.clockIn, clockOut: input.clockOut, flags, editReason: reason, createdAt: ctx.now })
        .returning({ id: t.timeEntries.id });
      id = row.id;
    }
    await logEvent(
      tx,
      "time_edited",
      ctx.actor,
      {
        entryId: id,
        staffId: input.staffId,
        from: before ? { in: before.clockIn.toISOString(), out: before.clockOut?.toISOString() ?? null } : null,
        to: { in: input.clockIn.toISOString(), out: input.clockOut.toISOString() },
        reason,
      },
      ctx.now,
    );
    return { ok: true as const, id };
  });
}

/** Quản lý xác nhận lượt bị gắn cờ là đúng (dọn dẹp thật / làm ở chỗ khác có lý do) → bỏ cờ `off_site`/`late_out`. */
export async function reviewTimeEntryCore(input: { id: number }, ctx: Ctx): Promise<Ok | Fail> {
  const db = ctx.db ?? getDb();
  const [row] = await db.select().from(t.timeEntries).where(eq(t.timeEntries.id, input.id));
  if (!row) return fail("not_found");
  const target = await staffRow(db, row.staffId);
  if (!target || !canManageTime(ctx.actor, target)) return fail("forbidden");
  if (row.flags.includes("forgot_out")) return fail("unresolved");
  if (await periodLocked(db, row.staffId, periodOf(vnDateOf(row.clockIn)))) return fail("locked");
  await db
    .update(t.timeEntries)
    .set({ flags: row.flags.filter((f) => f !== "off_site" && f !== "late_out") })
    .where(eq(t.timeEntries.id, row.id));
  await logEvent(db, "time_reviewed", ctx.actor, { entryId: row.id, staffId: row.staffId, flags: row.flags }, ctx.now);
  return { ok: true };
}

// ── Lịch ca tuần ──

export async function savePlanCore(input: { staffId: number; date: ISODate; start: string | null; end: string | null }, ctx: Ctx): Promise<Ok | Fail> {
  if (!canEditOps(ctx.actor.roles)) return fail("forbidden");
  const db = ctx.db ?? getDb();
  const target = await staffRow(db, input.staffId);
  if (!target || !onPayroll(target.roles)) return fail("not_found");
  const where = and(eq(t.shiftPlans.staffId, input.staffId), eq(t.shiftPlans.date, input.date));
  if (input.start === null || input.end === null) {
    await db.delete(t.shiftPlans).where(where);
  } else {
    if (input.end <= input.start) return fail("invalid");
    await db
      .insert(t.shiftPlans)
      .values({ staffId: input.staffId, date: input.date, start: input.start, end: input.end })
      .onConflictDoUpdate({ target: [t.shiftPlans.staffId, t.shiftPlans.date], set: { start: input.start, end: input.end } });
  }
  await logEvent(db, "plan_saved", ctx.actor, input, ctx.now);
  return { ok: true };
}

/** [Chép tuần trước]: chép lịch tuần trước sang tuần `week` — ngày đã có lịch thì giữ nguyên. */
export async function copyLastWeekCore(input: { week: ISODate }, ctx: Ctx): Promise<Ok<{ count: number }> | Fail> {
  if (!canEditOps(ctx.actor.roles)) return fail("forbidden");
  const db = ctx.db ?? getDb();
  const week = weekStart(input.week);
  const prev = await db
    .select()
    .from(t.shiftPlans)
    .where(and(gte(t.shiftPlans.date, addDays(week, -7)), lt(t.shiftPlans.date, week)));
  if (prev.length === 0) return { ok: true, count: 0 };
  const inserted = await db
    .insert(t.shiftPlans)
    .values(prev.map((p) => ({ staffId: p.staffId, date: addDays(p.date, 7), start: p.start, end: p.end })))
    .onConflictDoNothing()
    .returning({ id: t.shiftPlans.id });
  await logEvent(db, "plan_copied", ctx.actor, { week, count: inserted.length }, ctx.now);
  return { ok: true, count: inserted.length };
}

/** [Đây là Wi-Fi quán]: thêm IP công khai hiện tại vào danh sách (giữ 5 IP gần nhất — nhà mạng hay đổi IP). */
export async function markStoreIpCore(input: { ip: string }, ctx: Ctx): Promise<Ok | Fail> {
  if (!canEditOps(ctx.actor.roles)) return fail("forbidden");
  if (!input.ip || input.ip === "unknown") return fail("invalid");
  const db = ctx.db ?? getDb();
  const { ops } = await loadSettings(db);
  const value = { ...ops, storeIps: [input.ip, ...ops.storeIps.filter((x) => x !== input.ip)].slice(0, 5) };
  await db.insert(t.settings).values({ key: "ops", value }).onConflictDoUpdate({ target: t.settings.key, set: { value } });
  await logEvent(db, "store_ip", ctx.actor, { ip: input.ip }, ctx.now);
  return { ok: true };
}

// ── Bảng công tháng ──

export type TimesheetSnapshot = {
  v: 1;
  staff: { id: number; name: string };
  period: Period;
  days: DayWork[];
  entries: { in: string; out: string | null; flags: TimeFlag[] }[];
  totals: WorkTotals;
};

const sha256 = (v: unknown) => createHash("sha256").update(canonicalJson(v)).digest("hex");

async function computeTimesheet(db: Executor, staffId: number, period: Period) {
  const { from, to } = periodRange(period);
  const entries = await db
    .select()
    .from(t.timeEntries)
    .where(and(eq(t.timeEntries.staffId, staffId), gte(t.timeEntries.clockIn, from), lt(t.timeEntries.clockIn, to)))
    .orderBy(asc(t.timeEntries.clockIn));
  const start = periodStart(period);
  const next = periodStart(nextPeriod(period));
  const plans = await db
    .select()
    .from(t.shiftPlans)
    .where(and(eq(t.shiftPlans.staffId, staffId), gte(t.shiftPlans.date, start), lt(t.shiftPlans.date, next)));
  // Ca qua nửa đêm ngày cuối tháng có thể chạm ngày lễ 01 của tháng sau.
  const hols = await db.select().from(t.holidays).where(and(gte(t.holidays.date, start), lte(t.holidays.date, next)));
  const days = workDays(entries, {
    holidays: hols.map((h) => ({ date: h.date, multiplier: h.multiplier })),
    plans: plans.map((p) => ({ date: p.date, start: hhmm(p.start), end: hhmm(p.end) })),
  });
  return { entries, days, totals: workTotals(days) };
}

export async function submitTimesheetCore(input: { staffId: number; period: Period }, ctx: Ctx): Promise<Ok | Fail> {
  const db = ctx.db ?? getDb();
  const target = await staffRow(db, input.staffId);
  if (!target) return fail("not_found");
  if (!canManageTime(ctx.actor, target)) return fail("forbidden");
  if (input.period >= currentPeriod(ctx.now)) return fail("period_open");
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(t.timesheets)
      .where(and(eq(t.timesheets.staffId, input.staffId), eq(t.timesheets.period, input.period)))
      .for("update");
    if (existing && existing.status !== "draft") return fail("locked");
    const { entries, days, totals } = await computeTimesheet(tx, input.staffId, input.period);
    if (entries.some((e) => e.clockOut === null || e.flags.includes("forgot_out"))) return fail("unresolved");
    const snapshot: TimesheetSnapshot = {
      v: 1,
      staff: { id: target.id, name: target.name },
      period: input.period,
      days,
      entries: entries.map((e) => ({ in: e.clockIn.toISOString(), out: e.clockOut?.toISOString() ?? null, flags: e.flags })),
      totals,
    };
    const values = {
      status: "submitted" as const,
      minutes: totals.minutes,
      nightMinutes: totals.night,
      overtimeMinutes: totals.overtime,
      holidayMinutes: totals.holiday,
      lateCount: totals.late,
      snapshot,
      snapshotHash: sha256(snapshot),
      submittedBy: ctx.actor.id,
      submittedAt: ctx.now,
      disputeReason: null,
    };
    await tx
      .insert(t.timesheets)
      .values({ staffId: input.staffId, period: input.period, ...values, createdAt: ctx.now })
      .onConflictDoUpdate({ target: [t.timesheets.staffId, t.timesheets.period], set: values });
    await logEvent(tx, "timesheet_submitted", ctx.actor, { staffId: input.staffId, period: input.period, hash: values.snapshotHash }, ctx.now);
    return { ok: true as const };
  });
}

/** Nhân viên xác nhận bảng công của mình bằng PIN → khoá (lưu thời điểm, IP, thiết bị, hash của snapshot). */
export async function ackTimesheetCore(input: { period: Period; pin: string; ip: string; device: string }, ctx: Ctx): Promise<Ok | Fail> {
  const db = ctx.db ?? getDb();
  if (!(await verifyStaffPin(ctx.actor.id, input.pin, db))) return fail("wrong_pin");
  return db.transaction(async (tx) => {
    const [ts] = await tx
      .select()
      .from(t.timesheets)
      .where(and(eq(t.timesheets.staffId, ctx.actor.id), eq(t.timesheets.period, input.period)))
      .for("update");
    if (!ts || ts.status === "draft") return fail("not_found");
    if (ts.status !== "submitted") return fail("locked");
    if (sha256(ts.snapshot) !== ts.snapshotHash) return fail("invalid");
    await tx
      .update(t.timesheets)
      .set({ status: "acknowledged", ackAt: ctx.now, ackIp: input.ip, ackDevice: input.device.slice(0, 300) })
      .where(eq(t.timesheets.id, ts.id));
    await logEvent(tx, "timesheet_ack", ctx.actor, { period: input.period, hash: ts.snapshotHash, ip: input.ip }, ctx.now);
    return { ok: true as const };
  });
}

/** "Chưa đồng ý" + lý do → bảng công về nháp để quản lý sửa giờ rồi gửi lại. */
export async function disputeTimesheetCore(input: { period: Period; reason: string }, ctx: Ctx): Promise<Ok<{ telegram: string }> | Fail> {
  const reason = input.reason.trim();
  if (reason.length < 3) return fail("reason_required");
  const db = ctx.db ?? getDb();
  const [row] = await db
    .update(t.timesheets)
    .set({ status: "draft", snapshot: null, snapshotHash: null, disputeReason: reason })
    .where(and(eq(t.timesheets.staffId, ctx.actor.id), eq(t.timesheets.period, input.period), eq(t.timesheets.status, "submitted")))
    .returning({ id: t.timesheets.id });
  if (!row) return fail("locked");
  await logEvent(db, "timesheet_disputed", ctx.actor, { period: input.period, reason }, ctx.now);
  return { ok: true, telegram: timesheetDisputeText({ name: ctx.actor.name, period: input.period, reason }) };
}

// ── Lương (chỉ chủ quán) ──

async function payslipLocked(db: Executor, staffId: number, fromPeriod: Period) {
  const [p] = await db
    .select({ id: t.payslips.id })
    .from(t.payslips)
    .where(and(eq(t.payslips.staffId, staffId), gte(t.payslips.period, fromPeriod), ne(t.payslips.status, "draft")))
    .limit(1);
  return !!p;
}

export async function savePayRateCore(input: { staffId: number; hourlyRate: number; effectiveFrom: ISODate }, ctx: Ctx): Promise<Ok | Fail> {
  if (!isOwner(ctx.actor)) return fail("forbidden");
  if (!isISODate(input.effectiveFrom)) return fail("invalid");
  const db = ctx.db ?? getDb();
  const { payroll } = await loadSettings(db);
  if (!validRate(input.hourlyRate, payroll.minHourly)) return fail("below_min");
  const target = await staffRow(db, input.staffId);
  if (!target || !onPayroll(target.roles)) return fail("not_found");
  // Kỳ đã duyệt/trả lương không đổi theo đơn giá mới.
  if (await payslipLocked(db, input.staffId, periodOf(input.effectiveFrom))) return fail("locked");
  await db
    .insert(t.payRates)
    .values({ staffId: input.staffId, hourlyRate: input.hourlyRate, effectiveFrom: input.effectiveFrom, createdBy: ctx.actor.id, createdAt: ctx.now })
    .onConflictDoUpdate({ target: [t.payRates.staffId, t.payRates.effectiveFrom], set: { hourlyRate: input.hourlyRate, createdBy: ctx.actor.id } });
  await logEvent(db, "pay_rate", ctx.actor, input, ctx.now);
  return { ok: true };
}

export async function savePayrollSettingsCore(input: PayrollSettings, ctx: Ctx): Promise<Ok | Fail> {
  if (!isOwner(ctx.actor)) return fail("forbidden");
  const db = ctx.db ?? getDb();
  await db.insert(t.settings).values({ key: "payroll", value: input }).onConflictDoUpdate({ target: t.settings.key, set: { value: input } });
  await logEvent(db, "payroll_settings", ctx.actor, input, ctx.now);
  return { ok: true };
}

export async function saveHolidayCore(input: { date: ISODate; name: string; multiplier: number; remove?: boolean }, ctx: Ctx): Promise<Ok | Fail> {
  if (!isOwner(ctx.actor)) return fail("forbidden");
  const db = ctx.db ?? getDb();
  if (input.remove) {
    await db.delete(t.holidays).where(eq(t.holidays.date, input.date));
  } else {
    await db
      .insert(t.holidays)
      .values({ date: input.date, name: input.name.trim(), multiplier: input.multiplier })
      .onConflictDoUpdate({ target: t.holidays.date, set: { name: input.name.trim(), multiplier: input.multiplier } });
  }
  await logEvent(db, "holiday", ctx.actor, input, ctx.now);
  return { ok: true };
}

/** Doanh thu tháng: pizza (đơn hoàn tất theo ngày phục vụ) + café (số Sapo các ca đã đóng). */
export async function periodRevenue(period: Period, db: Executor = getDb()) {
  const start = periodStart(period);
  const next = periodStart(nextPeriod(period));
  const [{ pizza }] = await db
    .select({ pizza: sql<number>`coalesce(sum(${t.orders.total}), 0)::int` })
    .from(t.orders)
    .where(and(eq(t.orders.status, "completed"), gte(t.orders.serviceDate, start), lt(t.orders.serviceDate, next)));
  const [{ cafe }] = await db
    .select({
      cafe: sql<number>`coalesce(sum(coalesce(${t.shifts.cafeCash}, 0) + coalesce(${t.shifts.cafeTransfer}, 0) + coalesce(${t.shifts.cafeOther}, 0)), 0)::int`,
    })
    .from(t.shifts)
    .where(and(eq(t.shifts.status, "closed"), gte(t.shifts.serviceDate, start), lt(t.shifts.serviceDate, next)));
  return { pizza, cafe, total: pizza + cafe };
}

/** % mục checklist (mở/trong/đóng ca, mẫu gắn vai của người đó) đã xong trong các ngày người đó làm. */
async function checklistPct(db: Executor, roles: Role[], dates: ISODate[]): Promise<number | null> {
  if (dates.length === 0) return null;
  const tpls = (await db.select().from(t.checklistTemplates).where(eq(t.checklistTemplates.isActive, true))).filter(
    (x) => x.moment !== "weekly" && hasRole(roles, x.roles),
  );
  if (tpls.length === 0) return null;
  const runs = await db
    .select()
    .from(t.checklistRuns)
    .where(and(inArray(t.checklistRuns.templateId, tpls.map((x) => x.id)), inArray(t.checklistRuns.serviceDate, dates)));
  let done = 0;
  let total = 0;
  for (const date of dates)
    for (const tpl of tpls) {
      const p = progress(tpl.items, runs.find((r) => r.templateId === tpl.id && r.serviceDate === date)?.done ?? {});
      done += p.done;
      total += p.total;
    }
  return total === 0 ? null : Math.round((done / total) * 1000) / 10;
}

/** Lệch két lớn nhất (trị tuyệt đối) trong các ca người đó đóng. */
async function maxCashVariance(db: Executor, staffId: number, period: Period): Promise<number | null> {
  const [{ v }] = await db
    .select({ v: sql<number | null>`max(abs(${t.cashEntries.total} - ${t.cashEntries.expected}))::int` })
    .from(t.cashEntries)
    .innerJoin(t.shifts, eq(t.shifts.id, t.cashEntries.shiftId))
    .where(
      and(
        eq(t.cashEntries.kind, "close"),
        isNotNull(t.cashEntries.expected),
        eq(t.shifts.closedBy, staffId),
        gte(t.shifts.serviceDate, periodStart(period)),
        lt(t.shifts.serviceDate, periodStart(nextPeriod(period))),
      ),
    );
  return v;
}

export type PayslipMeta = {
  revenue: number;
  pool: number;
  poolMinutes: number;
  stats: ComplianceStats;
  misses: ComplianceMiss[];
  /** Owner sửa tay trước khi duyệt: true/false; null = theo tiêu chí. */
  complianceOverride: boolean | null;
  adjustmentNote: string | null;
};

const ADJUSTMENT_LABEL = payLineLabel("adjustment");

function finishLines(work: PayLine[], extra: { share: number; minutes: number; compliance: number; adjustment: number; adjustmentNote: string | null }): PayLine[] {
  const lines: PayLine[] = [
    ...work,
    { kind: "revenue_bonus", label: payLineLabel("revenue_bonus"), minutes: extra.minutes, amount: extra.share },
    { kind: "compliance_bonus", label: payLineLabel("compliance_bonus"), amount: extra.compliance },
  ];
  if (extra.adjustment !== 0) lines.push({ kind: "adjustment", label: extra.adjustmentNote ? `${ADJUSTMENT_LABEL}: ${extra.adjustmentNote}` : ADJUSTMENT_LABEL, amount: extra.adjustment });
  return lines;
}

/**
 * Tạo / tính lại phiếu lương nháp cho mọi bảng công ĐÃ XÁC NHẬN của kỳ. Quỹ thưởng chia theo giờ công của mọi
 * nhân viên có công trong kỳ (bảng công đã gửi dùng snapshot, chưa gửi tính sống). Phiếu đã duyệt/trả giữ nguyên.
 */
export async function buildPayslipsCore(input: { period: Period }, ctx: Ctx): Promise<Ok<{ count: number; waiting: number }> | Fail> {
  if (!isOwner(ctx.actor)) return fail("forbidden");
  if (input.period >= currentPeriod(ctx.now)) return fail("period_open");
  const db = ctx.db ?? getDb();
  const { payroll } = await loadSettings(db);
  const { from, to } = periodRange(input.period);
  const people = (await db.select().from(t.staff)).filter((s) => onPayroll(s.roles));
  const sheets = await db.select().from(t.timesheets).where(eq(t.timesheets.period, input.period));
  const worked = new Set(
    (
      await db
        .selectDistinct({ id: t.timeEntries.staffId })
        .from(t.timeEntries)
        .where(and(gte(t.timeEntries.clockIn, from), lt(t.timeEntries.clockIn, to)))
    ).map((r) => r.id),
  );

  const weights: { id: number; minutes: number }[] = [];
  for (const p of people) {
    const ts = sheets.find((s) => s.staffId === p.id);
    if (ts && ts.status !== "draft") weights.push({ id: p.id, minutes: ts.minutes });
    else if (worked.has(p.id)) weights.push({ id: p.id, minutes: (await computeTimesheet(db, p.id, input.period)).totals.minutes });
  }
  const revenue = (await periodRevenue(input.period, db)).total;
  const pool = revenuePool(revenue, payroll.revenueBonusPct);
  const shares = splitPool(pool, weights);
  const poolMinutes = weights.reduce((n, w) => n + w.minutes, 0);
  const rates = await db.select().from(t.payRates);
  const existing = await db.select().from(t.payslips).where(eq(t.payslips.period, input.period));

  const acked = sheets.filter((s) => s.status === "acknowledged");
  const drafts: (typeof t.payslips.$inferInsert)[] = [];
  for (const ts of acked) {
    const prev = existing.find((p) => p.staffId === ts.staffId);
    if (prev && prev.status !== "draft") continue;
    const person = people.find((p) => p.id === ts.staffId);
    if (!person) continue;
    const snap = ts.snapshot as TimesheetSnapshot;
    const work = workLines(
      snap.days,
      rates.filter((r) => r.staffId === ts.staffId).map((r): PayRate => ({ hourlyRate: r.hourlyRate, effectiveFrom: r.effectiveFrom })),
    );
    if (!Array.isArray(work)) return fail("missing_rate");
    const stats: ComplianceStats = {
      late: ts.lateCount,
      checklistPct: await checklistPct(db, person.roles, snap.days.filter((d) => d.minutes > 0).map((d) => d.date)),
      maxCashVariance: await maxCashVariance(db, ts.staffId, input.period),
    };
    const misses = complianceMisses(stats, payroll);
    const prevMeta = (prev?.meta ?? null) as PayslipMeta | null;
    const override = prevMeta?.complianceOverride ?? null;
    const adjustment = prev?.lines.find((l) => l.kind === "adjustment")?.amount ?? 0;
    const lines = finishLines(work, {
      share: shares.get(ts.staffId) ?? 0,
      minutes: ts.minutes,
      compliance: (override ?? misses.length === 0) ? payroll.complianceBonus : 0,
      adjustment,
      adjustmentNote: prevMeta?.adjustmentNote ?? null,
    });
    const meta: PayslipMeta = { revenue, pool, poolMinutes, stats, misses, complianceOverride: override, adjustmentNote: prevMeta?.adjustmentNote ?? null };
    drafts.push({ staffId: ts.staffId, period: input.period, timesheetId: ts.id, lines, meta, total: Math.max(0, payslipTotal(lines)), status: "draft", createdAt: ctx.now });
  }
  await db.transaction(async (tx) => {
    for (const d of drafts) {
      await tx
        .insert(t.payslips)
        .values(d)
        .onConflictDoUpdate({
          target: [t.payslips.staffId, t.payslips.period],
          set: { timesheetId: d.timesheetId, lines: d.lines, meta: d.meta, total: d.total },
          setWhere: eq(t.payslips.status, "draft"),
        });
    }
    await logEvent(tx, "payslips_built", ctx.actor, { period: input.period, count: drafts.length, revenue, pool }, ctx.now);
  });
  const waiting = weights.filter((w) => !acked.some((s) => s.staffId === w.id)).length;
  return { ok: true, count: drafts.length, waiting };
}

/** Owner sửa thưởng tuân thủ (bật/tắt/theo tiêu chí) và khoản điều chỉnh trước khi duyệt. */
export async function editPayslipCore(
  input: { id: number; compliance: boolean | null; adjustment: number; adjustmentNote: string },
  ctx: Ctx,
): Promise<Ok | Fail> {
  if (!isOwner(ctx.actor)) return fail("forbidden");
  const db = ctx.db ?? getDb();
  const { payroll } = await loadSettings(db);
  const [p] = await db.select().from(t.payslips).where(eq(t.payslips.id, input.id));
  if (!p) return fail("not_found");
  if (p.status !== "draft") return fail("locked");
  const meta = p.meta as PayslipMeta;
  const note = input.adjustmentNote.trim() || null;
  if (input.adjustment !== 0 && !note) return fail("reason_required");
  const work = p.lines.filter((l) => l.kind !== "revenue_bonus" && l.kind !== "compliance_bonus" && l.kind !== "adjustment");
  const lines = finishLines(work, {
    share: p.lines.find((l) => l.kind === "revenue_bonus")?.amount ?? 0,
    minutes: p.lines.find((l) => l.kind === "revenue_bonus")?.minutes ?? 0,
    compliance: (input.compliance ?? meta.misses.length === 0) ? payroll.complianceBonus : 0,
    adjustment: input.adjustment,
    adjustmentNote: note,
  });
  const total = payslipTotal(lines);
  if (total < 0) return fail("invalid");
  await db
    .update(t.payslips)
    .set({ lines, total, meta: { ...meta, complianceOverride: input.compliance, adjustmentNote: note } })
    .where(eq(t.payslips.id, p.id));
  await logEvent(db, "payslip_edited", ctx.actor, { id: p.id, compliance: input.compliance, adjustment: input.adjustment, note }, ctx.now);
  return { ok: true };
}

export async function advancePayslipCore(input: { id: number; to: "approved" | "paid"; method?: "cash" | "bank" }, ctx: Ctx): Promise<Ok | Fail> {
  if (!isOwner(ctx.actor)) return fail("forbidden");
  const db = ctx.db ?? getDb();
  const from: PayslipStatus = input.to === "approved" ? "draft" : "approved";
  const set =
    input.to === "approved"
      ? { status: "approved" as const, approvedBy: ctx.actor.id, approvedAt: ctx.now }
      : { status: "paid" as const, paidAt: ctx.now, paidMethod: input.method ?? "bank" };
  const [row] = await db
    .update(t.payslips)
    .set(set)
    .where(and(eq(t.payslips.id, input.id), eq(t.payslips.status, from)))
    .returning({ id: t.payslips.id });
  if (!row) return fail("locked");
  await logEvent(db, `payslip_${input.to}`, ctx.actor, input, ctx.now);
  return { ok: true };
}

/** Nhân viên bấm [Đã nhận lương]. */
export async function ackPayslipCore(input: { id: number }, ctx: Ctx): Promise<Ok | Fail> {
  const db = ctx.db ?? getDb();
  const [row] = await db
    .update(t.payslips)
    .set({ staffAckAt: ctx.now })
    .where(and(eq(t.payslips.id, input.id), eq(t.payslips.staffId, ctx.actor.id), eq(t.payslips.status, "paid"), isNull(t.payslips.staffAckAt)))
    .returning({ id: t.payslips.id });
  if (!row) return fail("not_found");
  await logEvent(db, "payslip_received", ctx.actor, input, ctx.now);
  return { ok: true };
}

// ── DTO màn "Công" (mọi nhân viên) — KHÔNG có trường tiền của người khác ──

export type TimeEntryView = {
  id: number;
  staffId: number;
  name: string;
  clockIn: string;
  clockOut: string | null;
  minutes: number;
  flags: TimeFlag[];
  editReason: string | null;
};
export type PlanView = { staffId: number; date: ISODate; start: string; end: string };
export type TimesheetRow = {
  staffId: number;
  name: string;
  status: TimesheetStatus;
  totals: WorkTotals;
  flagged: number;
  disputeReason: string | null;
  canSubmit: boolean;
};
export type MyTimesheet = { period: Period; status: Exclude<TimesheetStatus, "draft">; days: DayWork[]; totals: WorkTotals; submittedAt: string | null; ackAt: string | null; hash: string };
export type MyPayslip = { id: number; period: Period; lines: PayLine[]; total: number; status: Exclude<PayslipStatus, "draft">; paidAt: string | null; paidMethod: "cash" | "bank" | null; received: boolean };

export type TimeView = {
  serverNow: string;
  today: ISODate;
  ip: string;
  /** null = chủ quán chưa đánh dấu Wi-Fi quán. */
  atStore: boolean | null;
  me: {
    onPayroll: boolean;
    open: { id: number; clockIn: string; flags: TimeFlag[] } | null;
    week: PlanView[];
    month: { period: Period; totals: WorkTotals };
    entries: TimeEntryView[];
    timesheets: MyTimesheet[];
    payslips: MyPayslip[];
  };
  manage: null | {
    period: Period;
    week: ISODate;
    staff: { id: number; name: string }[];
    plans: PlanView[];
    review: TimeEntryView[];
    entries: TimeEntryView[];
    timesheets: TimesheetRow[];
    storeIps: string[];
  };
};

const REVIEW_FLAGS: TimeFlag[] = ["off_site", "forgot_out", "late_out"];

export async function loadTimeView(viewer: OpsActor, now: Date, opts: { ip: string; period?: Period | null; week?: ISODate | null }, db: Db = getDb()): Promise<TimeView> {
  const { ops } = await loadSettings(db);
  const today = vnDateOf(now);
  const people = await db.select({ id: t.staff.id, name: t.staff.name, roles: t.staff.roles, isActive: t.staff.isActive }).from(t.staff).orderBy(asc(t.staff.name));
  const nameOf = (id: number) => people.find((p) => p.id === id)?.name ?? `#${id}`;
  const toView = (e: typeof t.timeEntries.$inferSelect): TimeEntryView => ({
    id: e.id,
    staffId: e.staffId,
    name: nameOf(e.staffId),
    clockIn: e.clockIn.toISOString(),
    clockOut: e.clockOut?.toISOString() ?? null,
    minutes: e.clockOut ? entryMinutes({ clockIn: e.clockIn, clockOut: e.clockOut }) : 0,
    flags: e.flags,
    editReason: e.editReason,
  });
  const toPlan = (p: typeof t.shiftPlans.$inferSelect): PlanView => ({ staffId: p.staffId, date: p.date, start: hhmm(p.start), end: hhmm(p.end) });

  const thisPeriod = currentPeriod(now);
  const myWeek = weekStart(today);
  const [open] = await db.select().from(t.timeEntries).where(and(eq(t.timeEntries.staffId, viewer.id), isNull(t.timeEntries.clockOut)));
  const mine = await computeTimesheet(db, viewer.id, thisPeriod);
  const myPlans = await db
    .select()
    .from(t.shiftPlans)
    .where(and(eq(t.shiftPlans.staffId, viewer.id), gte(t.shiftPlans.date, myWeek), lt(t.shiftPlans.date, addDays(myWeek, 7))))
    .orderBy(asc(t.shiftPlans.date));
  const mySheets = await db
    .select()
    .from(t.timesheets)
    .where(and(eq(t.timesheets.staffId, viewer.id), ne(t.timesheets.status, "draft")))
    .orderBy(desc(t.timesheets.period))
    .limit(3);
  const mySlips = await db
    .select()
    .from(t.payslips)
    .where(and(eq(t.payslips.staffId, viewer.id), ne(t.payslips.status, "draft")))
    .orderBy(desc(t.payslips.period))
    .limit(6);

  let manage: TimeView["manage"] = null;
  if (canEditOps(viewer.roles)) {
    const period = opts.period && opts.period <= thisPeriod ? opts.period : prevPeriod(thisPeriod);
    const week = weekStart(opts.week ?? today);
    const payrollStaff = people.filter((p) => p.isActive && onPayroll(p.roles));
    const managed = payrollStaff.filter((p) => canManageTime(viewer, p));
    const managedIds = managed.map((p) => p.id);
    const { from, to } = periodRange(period);
    const entries = managedIds.length
      ? await db
          .select()
          .from(t.timeEntries)
          .where(and(inArray(t.timeEntries.staffId, managedIds), gte(t.timeEntries.clockIn, from), lt(t.timeEntries.clockIn, to)))
          .orderBy(asc(t.timeEntries.clockIn))
      : [];
    const review = managedIds.length
      ? (
          await db
            .select()
            .from(t.timeEntries)
            .where(and(inArray(t.timeEntries.staffId, managedIds), gte(t.timeEntries.clockIn, new Date(now.getTime() - 62 * 86_400_000))))
            .orderBy(desc(t.timeEntries.clockIn))
        ).filter((e) => e.flags.some((f) => REVIEW_FLAGS.includes(f)))
      : [];
    const sheets = await db.select().from(t.timesheets).where(eq(t.timesheets.period, period));
    const timesheets: TimesheetRow[] = [];
    for (const p of managed) {
      const ts = sheets.find((s) => s.staffId === p.id);
      const live = ts && ts.status !== "draft" ? (ts.snapshot as TimesheetSnapshot).totals : (await computeTimesheet(db, p.id, period)).totals;
      if (live.minutes === 0 && !ts) continue;
      timesheets.push({
        staffId: p.id,
        name: p.name,
        status: ts?.status ?? "draft",
        totals: live,
        flagged: entries.filter((e) => e.staffId === p.id && e.flags.some((f) => REVIEW_FLAGS.includes(f))).length,
        disputeReason: ts?.status === "draft" ? ts.disputeReason : null,
        canSubmit: (ts?.status ?? "draft") === "draft" && period < thisPeriod,
      });
    }
    const plans = await db
      .select()
      .from(t.shiftPlans)
      .where(and(gte(t.shiftPlans.date, week), lt(t.shiftPlans.date, addDays(week, 7))))
      .orderBy(asc(t.shiftPlans.date));
    manage = {
      period,
      week,
      staff: payrollStaff.map((p) => ({ id: p.id, name: p.name })),
      plans: plans.filter((p) => payrollStaff.some((s) => s.id === p.staffId)).map(toPlan),
      review: review.map(toView),
      entries: entries.map(toView),
      timesheets,
      storeIps: ops.storeIps,
    };
  }

  return {
    serverNow: now.toISOString(),
    today,
    ip: opts.ip,
    atStore: ops.storeIps.length === 0 ? null : ops.storeIps.includes(opts.ip),
    me: {
      onPayroll: onPayroll(viewer.roles),
      open: open ? { id: open.id, clockIn: open.clockIn.toISOString(), flags: open.flags } : null,
      week: myPlans.map(toPlan),
      month: { period: thisPeriod, totals: mine.totals },
      entries: mine.entries.map(toView).reverse(),
      timesheets: mySheets.map((s) => {
        const snap = s.snapshot as TimesheetSnapshot;
        return {
          period: s.period as Period,
          status: s.status as MyTimesheet["status"],
          days: snap.days,
          totals: snap.totals,
          submittedAt: s.submittedAt?.toISOString() ?? null,
          ackAt: s.ackAt?.toISOString() ?? null,
          hash: s.snapshotHash!,
        };
      }),
      payslips: mySlips.map((p) => ({
        id: p.id,
        period: p.period as Period,
        lines: p.lines,
        total: p.total,
        status: p.status as MyPayslip["status"],
        paidAt: p.paidAt?.toISOString() ?? null,
        paidMethod: p.paidMethod,
        received: p.staffAckAt !== null,
      })),
    },
    manage,
  };
}

// ── DTO màn "Lương" (chỉ chủ quán) ──

export type PayslipView = {
  id: number;
  staffId: number;
  name: string;
  lines: PayLine[];
  total: number;
  status: PayslipStatus;
  meta: PayslipMeta;
  paidAt: string | null;
  paidMethod: "cash" | "bank" | null;
  received: boolean;
};

export type PayrollView = {
  period: Period;
  today: ISODate;
  canBuild: boolean;
  settings: PayrollSettings;
  staff: { id: number; name: string; rates: PayRate[]; current: number | null; timesheet: TimesheetStatus | null }[];
  holidays: { date: ISODate; name: string; multiplier: number }[];
  revenue: { pizza: number; cafe: number; total: number; pool: number };
  payslips: PayslipView[];
};

export async function loadPayrollView(viewer: OpsActor, now: Date, opts: { period?: Period | null }, db: Db = getDb()): Promise<PayrollView | null> {
  if (!isOwner(viewer)) return null;
  const { payroll } = await loadSettings(db);
  const thisPeriod = currentPeriod(now);
  const period = opts.period && opts.period <= thisPeriod ? opts.period : prevPeriod(thisPeriod);
  const today = vnDateOf(now);
  const people = (await db.select().from(t.staff).orderBy(asc(t.staff.name))).filter((p) => p.isActive && onPayroll(p.roles));
  const rates = await db.select().from(t.payRates).orderBy(desc(t.payRates.effectiveFrom));
  const sheets = await db.select().from(t.timesheets).where(eq(t.timesheets.period, period));
  const slips = await db.select().from(t.payslips).where(eq(t.payslips.period, period));
  const hols = await db
    .select()
    .from(t.holidays)
    .where(gte(t.holidays.date, addDays(today, -400)))
    .orderBy(asc(t.holidays.date));
  const revenue = await periodRevenue(period, db);
  const nameOf = (id: number) => people.find((p) => p.id === id)?.name ?? `#${id}`;
  return {
    period,
    today,
    canBuild: period < thisPeriod,
    settings: payroll,
    staff: people.map((p) => {
      const mine = rates.filter((r) => r.staffId === p.id).map((r) => ({ hourlyRate: r.hourlyRate, effectiveFrom: r.effectiveFrom }));
      return {
        id: p.id,
        name: p.name,
        rates: mine,
        current: mine.find((r) => r.effectiveFrom <= today)?.hourlyRate ?? null,
        timesheet: sheets.find((s) => s.staffId === p.id)?.status ?? null,
      };
    }),
    holidays: hols.map((h) => ({ date: h.date, name: h.name, multiplier: h.multiplier })),
    revenue: { ...revenue, pool: revenuePool(revenue.total, payroll.revenueBonusPct) },
    payslips: slips.map((p) => ({
      id: p.id,
      staffId: p.staffId,
      name: nameOf(p.staffId),
      lines: p.lines,
      total: p.total,
      status: p.status,
      meta: p.meta as PayslipMeta,
      paidAt: p.paidAt?.toISOString() ?? null,
      paidMethod: p.paidMethod,
      received: p.staffAckAt !== null,
    })),
  };
}

// ── Cron (§17.11): ngày 1 bảng công nháp, ngày 3 nhắc xác nhận, ngày trả lương nhắc trả ──

async function once(db: Db, key: string, now: Date, send: () => Promise<boolean>): Promise<boolean> {
  const [done] = await db.select({ id: t.opsEvents.id }).from(t.opsEvents).where(eq(t.opsEvents.type, key)).limit(1);
  if (done) return false;
  const sent = await send();
  if (sent) await db.insert(t.opsEvents).values({ type: key, actor: "system", data: {}, createdAt: now });
  return sent;
}

export async function runPayrollCron(now: Date, send: (text: string) => Promise<boolean>, db: Db = getDb()) {
  const forgot = await flagForgottenCore(now, db);
  const forgotSent = forgot ? await send(forgot) : false;
  const today = vnDateOf(now);
  const day = Number(today.slice(8));
  const period = prevPeriod(periodOf(today));
  const { payroll } = await loadSettings(db);
  const label = periodName(period);
  let reminder: string | null = null;

  const { from, to } = periodRange(period);
  const workers = async () => {
    const ids = (
      await db
        .selectDistinct({ id: t.timeEntries.staffId })
        .from(t.timeEntries)
        .where(and(gte(t.timeEntries.clockIn, from), lt(t.timeEntries.clockIn, to)))
    ).map((r) => r.id);
    return ids.length ? (await db.select().from(t.staff).where(inArray(t.staff.id, ids))).filter((s) => onPayroll(s.roles)) : [];
  };

  if (day === 1) {
    const people = await workers();
    if (people.length) {
      await db
        .insert(t.timesheets)
        .values(people.map((p) => ({ staffId: p.id, period, createdAt: now })))
        .onConflictDoNothing();
      if (await once(db, `timesheet_draft:${period}`, now, () => send(timesheetDraftText(label, people.length)))) reminder = "draft";
    }
  } else if (day === 3) {
    const people = await workers();
    const acked = new Set(
      (await db.select({ id: t.timesheets.staffId }).from(t.timesheets).where(and(eq(t.timesheets.period, period), eq(t.timesheets.status, "acknowledged")))).map((r) => r.id),
    );
    const left = people
      .filter((p) => !acked.has(p.id))
      .map((p) => p.name)
      .sort((a, b) => a.localeCompare(b, "vi"));
    if (left.length && (await once(db, `timesheet_remind:${period}`, now, () => send(timesheetRemindText(label, left))))) reminder = "remind";
  }
  if (day === payroll.payDay) {
    const people = await workers();
    const slips = await db.select({ staffId: t.payslips.staffId, status: t.payslips.status }).from(t.payslips).where(eq(t.payslips.period, period));
    const unpaid = slips.filter((s) => s.status !== "paid").length;
    const missing = people.filter((p) => !slips.some((s) => s.staffId === p.id)).length;
    if (people.length > 0 && (await once(db, `payday_remind:${period}`, now, () => send(paydayText(label, unpaid, missing))))) reminder = "payday";
  }
  return { forgotSent, reminder };
}
