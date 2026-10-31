import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import { progress } from "@/lib/domain/checklist";
import type { ExpenseCategory } from "@/lib/domain/expense-command";
import { buildPnl, change, estimateLabor, fillRate, revenuePerHour, type Pnl, type Segment, type StockValue } from "@/lib/domain/metrics";
import { hasRole, type Role } from "@/lib/domain/roles";
import { addDays, vnDateOf, vnInstant, type ISODate } from "@/lib/domain/time";
import { entryMinutes, nextPeriod, periodLabel, periodOf, periodStart, prevPeriod, weekStart, workDays, workTotals, type Period } from "@/lib/domain/worktime";
import { getDb, type Executor } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import type { OpsActor } from "@/lib/server/dal/ops";
import { loadSettings } from "@/lib/server/dal/settings";

// Chỉ số quản lý & P&L (§17.10, M11). Chỉ owner/manager. Chi phí nhân sự (lương) **chỉ owner** — DTO của manager
// không có các trường đó (kể cả null), không chỉ ẩn trên UI.
//
// Doanh thu: pizza = đơn `completed` theo ngày phục vụ; café = số Sapo của các ca đã đóng theo ngày ca.
// Giá vốn theo kho tính bằng giá trị dòng kho (qty × unit_cost) theo `created_at`; chi phí theo `spent_at`.

export const METRICS_ROLES: Role[] = ["owner", "manager"];
export const canSeeMetrics = (a: { roles: Role[] }) => hasRole(a.roles, METRICS_ROLES);
const isOwner = (a: { roles: readonly Role[] }) => a.roles.includes("owner");

type Rev = Record<Segment, number>;
/** [from, to) theo ngày VN. */
type Span = { from: ISODate; to: ISODate };
const instant = (d: ISODate) => vnInstant(d, "00:00");
const periodSpan = (p: Period): Span => ({ from: periodStart(p), to: periodStart(nextPeriod(p)) });

export async function revenueBetween(db: Executor, s: Span): Promise<Rev> {
  const [{ pizza }] = await db
    .select({ pizza: sql<number>`coalesce(sum(${t.orders.total}), 0)::int` })
    .from(t.orders)
    .where(and(eq(t.orders.status, "completed"), gte(t.orders.serviceDate, s.from), lt(t.orders.serviceDate, s.to)));
  const [{ cafe }] = await db
    .select({ cafe: sql<number>`coalesce(sum(coalesce(${t.shifts.cafeCash}, 0) + coalesce(${t.shifts.cafeTransfer}, 0) + coalesce(${t.shifts.cafeOther}, 0)), 0)::int` })
    .from(t.shifts)
    .where(and(eq(t.shifts.status, "closed"), gte(t.shifts.serviceDate, s.from), lt(t.shifts.serviceDate, s.to)));
  return { pizza, cafe };
}

/** Doanh thu theo ngày trong khoảng (chỉ ngày có số). */
async function dailyRevenue(db: Executor, s: Span): Promise<{ date: ISODate; pizza: number; cafe: number }[]> {
  const pizza = await db
    .select({ date: t.orders.serviceDate, v: sql<number>`sum(${t.orders.total})::int` })
    .from(t.orders)
    .where(and(eq(t.orders.status, "completed"), gte(t.orders.serviceDate, s.from), lt(t.orders.serviceDate, s.to)))
    .groupBy(t.orders.serviceDate);
  const cafe = await db
    .select({ date: t.shifts.serviceDate, v: sql<number>`sum(coalesce(${t.shifts.cafeCash}, 0) + coalesce(${t.shifts.cafeTransfer}, 0) + coalesce(${t.shifts.cafeOther}, 0))::int` })
    .from(t.shifts)
    .where(and(eq(t.shifts.status, "closed"), gte(t.shifts.serviceDate, s.from), lt(t.shifts.serviceDate, s.to)))
    .groupBy(t.shifts.serviceDate);
  const days = new Map<ISODate, { date: ISODate; pizza: number; cafe: number }>();
  const at = (d: ISODate) => days.get(d) ?? days.set(d, { date: d, pizza: 0, cafe: 0 }).get(d)!;
  for (const r of pizza) at(r.date).pizza = r.v;
  for (const r of cafe) at(r.date).cafe = r.v;
  return [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Giá trị kho theo mảng: tồn đầu, nhập, tồn cuối, hao hụt (huỷ + lệch kiểm kê; dương = mất). */
export async function stockValues(db: Executor, s: Span): Promise<{ stock: Record<Segment, StockValue>; shrink: Rev }> {
  const from = instant(s.from).toISOString();
  const to = instant(s.to).toISOString();
  const v = sql`${t.stockMoves.qty} * ${t.stockMoves.unitCost}`;
  const inRange = sql`${t.stockMoves.createdAt} >= ${from}::timestamptz AND ${t.stockMoves.createdAt} < ${to}::timestamptz`;
  const rows = await db
    .select({
      segment: t.ingredients.segment,
      opening: sql<number>`coalesce(round(sum(${v}) filter (where ${t.stockMoves.createdAt} < ${from}::timestamptz)), 0)::int`,
      purchases: sql<number>`coalesce(round(sum(${v}) filter (where ${inRange} AND ${t.stockMoves.kind} = 'purchase')), 0)::int`,
      closing: sql<number>`coalesce(round(sum(${v}) filter (where ${t.stockMoves.createdAt} < ${to}::timestamptz)), 0)::int`,
      shrink: sql<number>`coalesce(round(-sum(${v}) filter (where ${inRange} AND ${t.stockMoves.kind} IN ('waste', 'adjust'))), 0)::int`,
    })
    .from(t.stockMoves)
    .innerJoin(t.ingredients, eq(t.ingredients.id, t.stockMoves.ingredientId))
    .groupBy(t.ingredients.segment);
  const zero = (): StockValue => ({ opening: 0, purchases: 0, closing: 0 });
  const stock = { pizza: zero(), cafe: zero() };
  const shrink = { pizza: 0, cafe: 0 };
  for (const r of rows) {
    stock[r.segment] = { opening: r.opening, purchases: r.purchases, closing: r.closing };
    shrink[r.segment] = r.shrink;
  }
  return { stock, shrink };
}

/** Chi phí còn hiệu lực theo nhóm. `pnl` = loại chứng từ đã nhập kho (giá vốn qua kho) và tiền trả nợ NCC (giá vốn ghi khi nhận). */
export async function expensesByCategory(db: Executor, s: Span, opts: { pnl: boolean }): Promise<Partial<Record<ExpenseCategory, number>>> {
  const rows = await db
    .select({ category: t.expenses.category, amount: sql<number>`sum(${t.expenses.amount})::int` })
    .from(t.expenses)
    .where(
      and(
        isNull(t.expenses.cancelledAt),
        ne(t.expenses.status, "rejected"),
        gte(t.expenses.spentAt, instant(s.from)),
        lt(t.expenses.spentAt, instant(s.to)),
        opts.pnl ? isNull(t.expenses.supplierId) : undefined,
        opts.pnl
          ? sql`NOT EXISTS (SELECT 1 FROM ${t.stockMoves} m WHERE m.ref_type = 'expense' AND m.ref_id = ${t.expenses.id}::text AND m.kind = 'purchase')`
          : undefined,
      ),
    )
    .groupBy(t.expenses.category);
  return Object.fromEntries(rows.map((r) => [r.category, r.amount]));
}

/** Phiếu nợ NCC nhận trong khoảng mà không nhập kho (chỉ ghi nợ) — vẫn là giá vốn. Phiếu chưa có giá không tính. */
async function unstockedBills(db: Executor, s: Span): Promise<number> {
  const [{ v }] = await db
    .select({ v: sql<number>`coalesce(sum(${t.supplierBills.amount}), 0)::int` })
    .from(t.supplierBills)
    .where(
      and(
        ne(t.supplierBills.status, "cancelled"),
        isNotNull(t.supplierBills.amount),
        gte(t.supplierBills.receivedAt, instant(s.from)),
        lt(t.supplierBills.receivedAt, instant(s.to)),
        sql`NOT EXISTS (SELECT 1 FROM ${t.stockMoves} m WHERE m.ref_type = 'bill' AND m.ref_id = ${t.supplierBills.id}::text)`,
      ),
    );
  return v;
}

/** Phút công theo người (lượt đã ra ca, giờ vào trong khoảng). */
export async function laborMinutes(db: Executor, s: Span): Promise<Map<number, number>> {
  const rows = await db
    .select({ staffId: t.timeEntries.staffId, clockIn: t.timeEntries.clockIn, clockOut: t.timeEntries.clockOut })
    .from(t.timeEntries)
    .where(and(isNotNull(t.timeEntries.clockOut), gte(t.timeEntries.clockIn, instant(s.from)), lt(t.timeEntries.clockIn, instant(s.to))));
  const out = new Map<number, number>();
  for (const r of rows) out.set(r.staffId, (out.get(r.staffId) ?? 0) + entryMinutes({ clockIn: r.clockIn, clockOut: r.clockOut! }));
  return out;
}

/** Chi phí nhân sự tháng (chỉ gọi cho owner): Σ phiếu lương nếu đã tạo, chưa có → ước tính phút × đơn giá. */
async function laborCost(db: Executor, period: Period, minutes: Map<number, number>): Promise<{ amount: number; estimated: boolean; missingRate: number }> {
  const slips = await db.select({ total: t.payslips.total }).from(t.payslips).where(eq(t.payslips.period, period));
  if (slips.length) return { amount: slips.reduce((n, s) => n + s.total, 0), estimated: false, missingRate: 0 };
  const end = addDays(periodStart(nextPeriod(period)), -1);
  const rates = await db.select().from(t.payRates).where(sql`${t.payRates.effectiveFrom} <= ${end}`).orderBy(desc(t.payRates.effectiveFrom));
  const rows = [...minutes].map(([staffId, m]) => ({ minutes: m, hourlyRate: rates.find((r) => r.staffId === staffId)?.hourlyRate ?? null }));
  return { ...estimateLabor(rows), estimated: true };
}

const LABOR_KEYS = ["labor", "laborPct", "prime", "primePct", "net"] as const;
type LaborKeys = (typeof LABOR_KEYS)[number];
export type PnlView = Omit<Pnl, LaborKeys> & Partial<Pick<Pnl, LaborKeys>>;

/** P&L tháng theo mảng. Người không phải owner nhận bản **không có** trường nhân sự. */
export async function pnlFor(period: Period, viewer: { roles: Role[] }, db: Executor = getDb()): Promise<{ pnl: PnlView; minutes: number; estimated: boolean | null; missingRate: number }> {
  const span = periodSpan(period);
  const owner = isOwner(viewer);
  const [revenue, { stock, shrink }, expenses, bills, minutes] = await Promise.all([
    revenueBetween(db, span),
    stockValues(db, span),
    expensesByCategory(db, span, { pnl: true }),
    unstockedBills(db, span),
    laborMinutes(db, span),
  ]);
  const labor = owner ? await laborCost(db, period, minutes) : null;
  const full = buildPnl({ revenue, stock, shrink, expenses, unstockedBills: bills, labor: labor?.amount ?? null });
  const total = [...minutes.values()].reduce((n, m) => n + m, 0);
  if (owner) return { pnl: full, minutes: total, estimated: labor!.estimated, missingRate: labor!.missingRate };
  const rest: PnlView = { ...full };
  for (const k of LABOR_KEYS) delete rest[k];
  return { pnl: rest, minutes: total, estimated: null, missingRate: 0 };
}

/** Kỳ từ đối số `/pl`: "--10" → tháng 10 gần nhất không sau tháng này; "2026-10" giữ nguyên; null → tháng này. */
export function resolvePeriod(arg: string | null, today: ISODate): Period {
  const current = periodOf(today);
  if (!arg) return current;
  if (!arg.startsWith("--")) return (arg <= current ? arg : current) as Period;
  const y = Number(current.slice(0, 4));
  const p = `${y}-${arg.slice(2)}` as Period;
  return p <= current ? p : (`${y - 1}-${arg.slice(2)}` as Period);
}

export type CashVarianceRow = { at: string; box: "register" | "petty"; by: string; counted: number; expected: number; variance: number };

export type MetricsView = {
  period: Period;
  periodLabel: string;
  periods: Period[];
  isOwner: boolean;
  revenue: { today: Rev; week: Rev; month: Rev; prevMonth: Rev; monthChangePct: number | null };
  daily: { date: ISODate; pizza: number; cafe: number }[];
  pnl: PnlView;
  /** Chỉ owner: phiếu lương chưa tạo → số ước tính; số người chưa có đơn giá. */
  laborNote?: { estimated: boolean; missingRate: number };
  laborMinutes: number;
  revenuePerHour: number | null;
  cash: CashVarianceRow[];
  cashTolerance: number;
  expenses: { category: ExpenseCategory; amount: number; prev: number; changePct: number | null }[];
  ops: { checklistPct: number | null; late: number; fillRate: number | null };
};

export async function loadMetricsView(viewer: OpsActor, now: Date, opts: { period?: Period | null }, db: Executor = getDb()): Promise<MetricsView | null> {
  if (!canSeeMetrics(viewer)) return null;
  const today = vnDateOf(now);
  const thisPeriod = periodOf(today);
  const period = opts.period && opts.period <= thisPeriod ? opts.period : thisPeriod;
  const span = periodSpan(period);
  const prev = periodSpan(prevPeriod(period));
  const week = weekStart(today);
  const { ops } = await loadSettings(db);

  const [todayRev, weekRev, monthRev, prevRev, daily, pnl, expNow, expPrev] = await Promise.all([
    revenueBetween(db, { from: today, to: addDays(today, 1) }),
    revenueBetween(db, { from: week, to: addDays(week, 7) }),
    revenueBetween(db, span),
    revenueBetween(db, prev),
    dailyRevenue(db, span),
    pnlFor(period, viewer, db),
    expensesByCategory(db, span, { pnl: false }),
    expensesByCategory(db, prev, { pnl: false }),
  ]);
  const total = (r: Rev) => r.pizza + r.cafe;

  // Lệch két (đóng ca) & hộp chi (kiểm hộp) trong kỳ.
  const names = new Map((await db.select({ id: t.staff.id, name: t.staff.name }).from(t.staff)).map((s) => [s.id, s.name]));
  const counts = await db
    .select()
    .from(t.cashEntries)
    .where(
      and(
        inArray(t.cashEntries.kind, ["close", "check"]),
        isNotNull(t.cashEntries.expected),
        gte(t.cashEntries.createdAt, instant(span.from)),
        lt(t.cashEntries.createdAt, instant(span.to)),
      ),
    )
    .orderBy(desc(t.cashEntries.createdAt));
  const cash = counts.map((c) => ({
    at: c.createdAt.toISOString(),
    box: c.box,
    by: names.get(c.staffId) ?? "",
    counted: c.total,
    expected: c.expected!,
    variance: c.total - c.expected!,
  }));

  const cats = [...new Set([...Object.keys(expNow), ...Object.keys(expPrev)])] as ExpenseCategory[];
  const expenses = cats
    .map((category) => ({ category, amount: expNow[category] ?? 0, prev: expPrev[category] ?? 0, changePct: change(expNow[category] ?? 0, expPrev[category] ?? 0) }))
    .sort((a, b) => b.amount - a.amount);

  const until = span.to < addDays(today, 1) ? span.to : addDays(today, 1);
  const opsStats = await opsMetrics(db, { from: span.from, to: until });

  // 6 kỳ gần nhất cho bộ chọn.
  const periods: Period[] = [thisPeriod];
  for (let i = 0; i < 5; i++) periods.push(prevPeriod(periods.at(-1)!));

  const revenue = total(monthRev);
  return {
    period,
    periodLabel: periodLabel(period),
    periods,
    isOwner: isOwner(viewer),
    revenue: { today: todayRev, week: weekRev, month: monthRev, prevMonth: prevRev, monthChangePct: change(revenue, total(prevRev)) },
    daily,
    pnl: pnl.pnl,
    ...(isOwner(viewer) ? { laborNote: { estimated: !!pnl.estimated, missingRate: pnl.missingRate } } : {}),
    laborMinutes: pnl.minutes,
    revenuePerHour: revenuePerHour(revenue, pnl.minutes),
    cash,
    cashTolerance: ops.cashTolerance,
    expenses,
    ops: opsStats,
  };
}

/** Checklist hoàn thành % (ngày có ca), số lần đi muộn (theo lịch ca), tỉ lệ lấp đầy lò (mẻ đã qua). */
async function opsMetrics(db: Executor, s: Span): Promise<MetricsView["ops"]> {
  const dates = (
    await db
      .select({ d: t.shifts.serviceDate })
      .from(t.shifts)
      .where(and(gte(t.shifts.serviceDate, s.from), lt(t.shifts.serviceDate, s.to)))
      .groupBy(t.shifts.serviceDate)
  ).map((r) => r.d);
  let checklistPct: number | null = null;
  if (dates.length) {
    const tpls = (await db.select().from(t.checklistTemplates).where(eq(t.checklistTemplates.isActive, true))).filter((x) => x.moment !== "weekly");
    const runs = tpls.length
      ? await db
          .select()
          .from(t.checklistRuns)
          .where(and(inArray(t.checklistRuns.templateId, tpls.map((x) => x.id)), inArray(t.checklistRuns.serviceDate, dates)))
      : [];
    let done = 0;
    let all = 0;
    for (const d of dates)
      for (const tpl of tpls) {
        const p = progress(tpl.items, runs.find((r) => r.templateId === tpl.id && r.serviceDate === d)?.done ?? {});
        done += p.done;
        all += p.total;
      }
    checklistPct = all ? Math.round((done / all) * 1000) / 10 : null;
  }

  const entries = await db
    .select({ staffId: t.timeEntries.staffId, clockIn: t.timeEntries.clockIn, clockOut: t.timeEntries.clockOut })
    .from(t.timeEntries)
    .where(and(gte(t.timeEntries.clockIn, instant(s.from)), lt(t.timeEntries.clockIn, instant(s.to))));
  const plans = await db
    .select()
    .from(t.shiftPlans)
    .where(and(gte(t.shiftPlans.date, s.from), lt(t.shiftPlans.date, s.to)));
  let late = 0;
  for (const id of new Set(plans.map((p) => p.staffId))) {
    const days = workDays(
      entries.filter((e) => e.staffId === id),
      { plans: plans.filter((p) => p.staffId === id).map((p) => ({ date: p.date, start: p.start.slice(0, 5), end: p.end.slice(0, 5) })) },
    );
    late += workTotals(days).late;
  }

  const batches = await db
    .select({ capPan: t.batches.capPan, capBbq: t.batches.capBbq, usedPan: t.batches.usedPan, usedBbq: t.batches.usedBbq })
    .from(t.batches)
    .innerJoin(t.serviceDays, eq(t.serviceDays.date, t.batches.serviceDate))
    .where(and(gte(t.batches.serviceDate, s.from), lt(t.batches.serviceDate, s.to), ne(t.serviceDays.status, "closed")))
    .orderBy(asc(t.batches.readyAt));
  return { checklistPct, late, fillRate: fillRate(batches) };
}

