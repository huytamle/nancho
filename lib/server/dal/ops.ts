import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { AdminError } from "@/lib/admin-contract";
import { countTotal, pettyExpected, registerExpected, type CashCounts } from "@/lib/domain/cash";
import type { ExpenseCategory, ExpenseSource } from "@/lib/domain/expense-command";
import { canAssignRoles, hasRole, type Role } from "@/lib/domain/roles";
import { addDays, vnDateOf, vnInstant, type ISODate } from "@/lib/domain/time";
import { countAlertText, expenseSummaryText, shiftClosedText, type ExpenseSummary } from "@/lib/ops-text";
import { hash } from "@node-rs/argon2";
import { getDb, type Db, type Executor } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { loadSettings } from "@/lib/server/dal/settings";

// Vận hành nội bộ (§17.2–17.4): ca & két, hộp chi định mức, chi phí, phân công vai trò.
// Server Action/webhook lo zod + phiên; quyền nghiệp vụ kiểm tra ở đây để integration test gọi thẳng.
// Mọi thao tác ghi ops_events (actor = "staff:<id>").

export type OpsActor = { id: number; name: string; roles: Role[] };
export type OpsCtx = { actor: OpsActor; now: Date; db?: Db };
type Ctx = OpsCtx;
export type OpsFail = { ok: false; reason: AdminError };
type Fail = OpsFail;
export const fail = (reason: AdminError): Fail => ({ ok: false, reason });

const tag = (a: OpsActor) => `staff:${a.id}`;
const MANAGERS: Role[] = ["owner", "manager"];
export const canSpend = (a: { roles: Role[] }) => hasRole(a.roles, MANAGERS);
const CANCEL_WINDOW_MS = 24 * 3_600_000;

export async function logEvent(db: Executor, type: string, actor: OpsActor, data: object, now: Date) {
  await db.insert(t.opsEvents).values({ type, actor: tag(actor), data, createdAt: now });
}

// ── Két (register) ──

/** Lần đếm đóng ca gần nhất và số còn lại trong két sau các lần nộp về chủ sau đó. */
async function lastRegisterLeft(db: Executor): Promise<number | null> {
  const [last] = await db
    .select({ total: t.cashEntries.total, createdAt: t.cashEntries.createdAt })
    .from(t.cashEntries)
    .where(and(eq(t.cashEntries.box, "register"), eq(t.cashEntries.kind, "close")))
    .orderBy(desc(t.cashEntries.createdAt), desc(t.cashEntries.id))
    .limit(1);
  if (!last) return null;
  const [{ drops }] = await db
    .select({ drops: sql<number>`coalesce(sum(${t.cashEntries.total}), 0)::int` })
    .from(t.cashEntries)
    .where(and(eq(t.cashEntries.box, "register"), eq(t.cashEntries.kind, "drop"), gte(t.cashEntries.createdAt, last.createdAt)));
  return last.total - drops;
}

/** Tổng COD pizza hoàn tất trong khoảng [from, to) — theo thời điểm đơn chuyển `completed`. */
async function codCollected(db: Executor, from: Date, to: Date): Promise<number> {
  const [{ sum }] = await db
    .select({ sum: sql<number>`coalesce(sum(${t.orders.total}), 0)::int` })
    .from(t.orders)
    .where(
      and(
        eq(t.orders.paymentMethod, "cod"),
        eq(t.orders.status, "completed"),
        sql`exists (select 1 from ${t.orderEvents} e where e.order_id = ${t.orders.id} and e.type = 'status_changed'
          and e.data->>'to' = 'completed' and e.created_at >= ${from.toISOString()}::timestamptz and e.created_at < ${to.toISOString()}::timestamptz)`,
      ),
    );
  return sum;
}

export type CountOutcome = { ok: true; total: number; expected: number | null; variance: number | null; telegram: string | null };

export async function openShiftCore(input: { counts: CashCounts; note?: string }, ctx: Ctx): Promise<(CountOutcome & { shiftId: number }) | Fail> {
  const db = ctx.db ?? getDb();
  const { ops } = await loadSettings(db);
  try {
    return await db.transaction(async (tx) => {
      const [shift] = await tx
        .insert(t.shifts)
        .values({ serviceDate: vnDateOf(ctx.now), openedBy: ctx.actor.id, openedAt: ctx.now, note: input.note || null })
        .returning({ id: t.shifts.id });
      const total = countTotal(input.counts);
      const expected = await lastRegisterLeft(tx);
      await tx.insert(t.cashEntries).values({
        box: "register",
        kind: "open",
        shiftId: shift.id,
        counts: input.counts,
        total,
        expected,
        staffId: ctx.actor.id,
        createdAt: ctx.now,
      });
      await logEvent(tx, "shift_opened", ctx.actor, { shiftId: shift.id, total, expected }, ctx.now);
      const variance = expected === null ? null : total - expected;
      return {
        ok: true as const,
        shiftId: shift.id,
        total,
        expected,
        variance,
        telegram: variance ? countAlertText({ what: "open", by: ctx.actor.name, counted: total, expected: expected!, tolerance: ops.cashTolerance }) : null,
      };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return fail("shift_open");
    throw err;
  }
}

export type CloseShiftInput = {
  shiftId: number;
  counts: CashCounts;
  cafeCash: number;
  cafeTransfer: number;
  cafeOther: number;
  sapoPhoto: string | null;
  drop: number;
  note?: string;
};

export async function closeShiftCore(input: CloseShiftInput, ctx: Ctx): Promise<(CountOutcome & { codCollected: number }) | Fail> {
  const db = ctx.db ?? getDb();
  const { ops } = await loadSettings(db);
  const cafe = input.cafeCash + input.cafeTransfer + input.cafeOther;
  if (cafe > 0 && !input.sapoPhoto) return fail("photo_required");
  return db.transaction(async (tx) => {
    const [shift] = await tx.select().from(t.shifts).where(eq(t.shifts.id, input.shiftId)).for("update");
    if (!shift) return fail("not_found");
    if (shift.status !== "open") return fail("no_shift");
    const entries = await tx.select().from(t.cashEntries).where(eq(t.cashEntries.shiftId, shift.id));
    const opening = entries.find((e) => e.kind === "open")?.total ?? 0;
    const drops = entries.filter((e) => e.kind === "drop").reduce((n, e) => n + e.total, 0);
    const cod = await codCollected(tx, shift.openedAt, ctx.now);
    const total = countTotal(input.counts);
    const expected = registerExpected({ opening, cafeCash: input.cafeCash, codCollected: cod, drops });
    if (input.drop > total) return fail("invalid");

    await tx.insert(t.cashEntries).values({
      box: "register",
      kind: "close",
      shiftId: shift.id,
      counts: input.counts,
      total,
      expected,
      staffId: ctx.actor.id,
      createdAt: ctx.now,
    });
    if (input.drop > 0) {
      // Nộp về chủ SAU khi đếm (ms sau) → không tính vào số đáng có của lần đếm này, chỉ trừ vào két ca sau.
      await tx.insert(t.cashEntries).values({
        box: "register",
        kind: "drop",
        shiftId: shift.id,
        total: input.drop,
        staffId: ctx.actor.id,
        note: "Nộp về chủ khi đóng ca",
        createdAt: new Date(ctx.now.getTime() + 1),
      });
    }
    await tx
      .update(t.shifts)
      .set({
        status: "closed",
        closedBy: ctx.actor.id,
        closedAt: ctx.now,
        cafeCash: input.cafeCash,
        cafeTransfer: input.cafeTransfer,
        cafeOther: input.cafeOther,
        sapoPhoto: input.sapoPhoto,
        note: input.note ? [shift.note, input.note].filter(Boolean).join(" · ") : shift.note,
      })
      .where(eq(t.shifts.id, shift.id));
    await logEvent(tx, "shift_closed", ctx.actor, { shiftId: shift.id, total, expected, cod, drop: input.drop }, ctx.now);
    return {
      ok: true as const,
      total,
      expected,
      variance: total - expected,
      codCollected: cod,
      telegram: shiftClosedText({
        date: `${shift.serviceDate.slice(8)}/${shift.serviceDate.slice(5, 7)}`,
        by: ctx.actor.name,
        counted: total,
        expected,
        tolerance: ops.cashTolerance,
        cafeCash: input.cafeCash,
        cafeTransfer: input.cafeTransfer,
        cafeOther: input.cafeOther,
        codCollected: cod,
        drop: input.drop,
      }),
    };
  });
}

/** Nộp tiền két về chủ giữa ca (owner/manager). */
export async function dropCashCore(input: { amount: number; note?: string }, ctx: Ctx): Promise<{ ok: true } | Fail> {
  if (!canSpend(ctx.actor)) return fail("forbidden");
  const db = ctx.db ?? getDb();
  const [shift] = await db.select({ id: t.shifts.id }).from(t.shifts).where(eq(t.shifts.status, "open"));
  if (!shift) return fail("no_shift");
  await db.insert(t.cashEntries).values({
    box: "register",
    kind: "drop",
    shiftId: shift.id,
    total: input.amount,
    staffId: ctx.actor.id,
    note: input.note || null,
    createdAt: ctx.now,
  });
  await logEvent(db, "cash_dropped", ctx.actor, { shiftId: shift.id, amount: input.amount }, ctx.now);
  return { ok: true };
}

// ── Hộp chi (petty, quỹ định mức) ──

/** Khoản rút khỏi hộp chi: chi từ hộp + hoàn tiền túi bằng tiền hộp; chưa huỷ. */
const pettyOutflow = and(
  isNull(t.expenses.cancelledAt),
  or(eq(t.expenses.source, "petty"), and(eq(t.expenses.status, "reimbursed"), eq(t.expenses.reimbursedFrom, "petty"))),
);

export async function pettyState(db: Executor = getDb()) {
  const { ops } = await loadSettings(db);
  const [{ spent }] = await db
    .select({ spent: sql<number>`coalesce(sum(${t.expenses.amount}), 0)::int` })
    .from(t.expenses)
    .where(and(pettyOutflow, isNull(t.expenses.replenishId)));
  return { float: ops.pettyFloat, unreplenished: spent, expected: pettyExpected(ops.pettyFloat, spent), tolerance: ops.cashTolerance };
}

export async function checkPettyCore(input: { counts: CashCounts }, ctx: Ctx): Promise<CountOutcome> {
  const db = ctx.db ?? getDb();
  const state = await pettyState(db);
  const total = countTotal(input.counts);
  const [open] = await db.select({ id: t.shifts.id }).from(t.shifts).where(eq(t.shifts.status, "open"));
  await db.insert(t.cashEntries).values({
    box: "petty",
    kind: "check",
    shiftId: open?.id ?? null,
    counts: input.counts,
    total,
    expected: state.expected,
    staffId: ctx.actor.id,
    createdAt: ctx.now,
  });
  await logEvent(db, "petty_checked", ctx.actor, { total, expected: state.expected }, ctx.now);
  const variance = total - state.expected;
  return {
    ok: true,
    total,
    expected: state.expected,
    variance,
    telegram: variance ? countAlertText({ what: "petty", by: ctx.actor.name, counted: total, expected: state.expected, tolerance: state.tolerance }) : null,
  };
}

/** Nạp bù hộp chi đúng bằng tổng chứng từ chưa nạp (owner) → các chứng từ đó đóng kỳ. */
export async function replenishPettyCore(ctx: Ctx): Promise<{ ok: true; amount: number; count: number } | Fail> {
  if (!ctx.actor.roles.includes("owner")) return fail("forbidden");
  const db = ctx.db ?? getDb();
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: t.expenses.id, amount: t.expenses.amount })
      .from(t.expenses)
      .where(and(pettyOutflow, isNull(t.expenses.replenishId)))
      .for("update");
    const amount = rows.reduce((n, r) => n + r.amount, 0);
    if (amount === 0) return { ok: true as const, amount: 0, count: 0 };
    const [entry] = await tx
      .insert(t.cashEntries)
      .values({ box: "petty", kind: "replenish", total: amount, staffId: ctx.actor.id, createdAt: ctx.now })
      .returning({ id: t.cashEntries.id });
    await tx.update(t.expenses).set({ replenishId: entry.id }).where(inArray(t.expenses.id, rows.map((r) => r.id)));
    await logEvent(tx, "petty_replenished", ctx.actor, { amount, count: rows.length, entryId: entry.id }, ctx.now);
    return { ok: true as const, amount, count: rows.length };
  });
}

// ── Chi phí ──

export type ExpenseInput = {
  amount: number;
  description: string;
  category: ExpenseCategory;
  source: ExpenseSource;
  spentAt?: Date;
  photo?: string | null;
  telegramFileId?: string | null;
};

export async function recordExpenseCore(input: ExpenseInput, ctx: Ctx): Promise<{ ok: true; id: number } | Fail> {
  if (!canSpend(ctx.actor)) return fail("forbidden");
  const id = await insertExpense(ctx.db ?? getDb(), input, ctx.actor, ctx.now);
  return { ok: true, id };
}

/** Ghi một chứng từ chi (đã kiểm quyền) — dùng chung cho form, bot, nhập kho và trả nợ NCC (M10). */
export async function insertExpense(db: Executor, input: ExpenseInput & { supplierId?: number | null }, actor: OpsActor, now: Date): Promise<number> {
  const ctx = { actor, now };
  const [row] = await db
    .insert(t.expenses)
    .values({
      spentAt: input.spentAt ?? ctx.now,
      amount: input.amount,
      description: input.description.trim(),
      category: input.category,
      source: input.source,
      status: input.source === "pocket" ? "pending" : "recorded",
      spentBy: ctx.actor.id,
      photo: input.photo ?? null,
      telegramFileId: input.telegramFileId ?? null,
      supplierId: input.supplierId ?? null,
      createdAt: ctx.now,
    })
    .returning({ id: t.expenses.id });
  await logEvent(db, "expense_recorded", ctx.actor, { id: row.id, amount: input.amount, source: input.source }, ctx.now);
  return row.id;
}

type ExpenseRow = typeof t.expenses.$inferSelect;

async function lockExpense(tx: Executor, id: number): Promise<ExpenseRow | undefined> {
  const [row] = await tx.select().from(t.expenses).where(eq(t.expenses.id, id)).for("update");
  return row;
}

/** Người ghi được huỷ trong 24 giờ, owner lúc nào cũng được — trừ khi đã nạp bù / đã hoàn. */
export function canCancelExpense(e: Pick<ExpenseRow, "spentBy" | "createdAt" | "cancelledAt" | "replenishId" | "status">, actor: OpsActor, now: Date) {
  if (e.cancelledAt || e.replenishId !== null || e.status === "reimbursed") return false;
  return actor.roles.includes("owner") || (e.spentBy === actor.id && now.getTime() - e.createdAt.getTime() <= CANCEL_WINDOW_MS);
}

export async function cancelExpenseCore(id: number, ctx: Ctx): Promise<{ ok: true; row: ExpenseRow } | Fail> {
  const db = ctx.db ?? getDb();
  return db.transaction(async (tx) => {
    const e = await lockExpense(tx, id);
    if (!e) return fail("not_found");
    if (e.cancelledAt) return fail("locked");
    if (!canCancelExpense(e, ctx.actor, ctx.now)) return fail(e.spentBy === ctx.actor.id || ctx.actor.roles.includes("owner") ? "locked" : "forbidden");
    const [row] = await tx.update(t.expenses).set({ cancelledAt: ctx.now }).where(eq(t.expenses.id, id)).returning();
    await logEvent(tx, "expense_cancelled", ctx.actor, { id }, ctx.now);
    return { ok: true as const, row };
  });
}

export async function setExpenseCategoryCore(id: number, category: ExpenseCategory, ctx: Ctx): Promise<{ ok: true; row: ExpenseRow } | Fail> {
  const db = ctx.db ?? getDb();
  const [e] = await db.select().from(t.expenses).where(eq(t.expenses.id, id));
  if (!e) return fail("not_found");
  if (e.cancelledAt) return fail("locked");
  if (e.spentBy !== ctx.actor.id && !canSpend(ctx.actor)) return fail("forbidden");
  const [row] = await db.update(t.expenses).set({ category }).where(eq(t.expenses.id, id)).returning();
  await logEvent(db, "expense_category", ctx.actor, { id, from: e.category, to: category }, ctx.now);
  return { ok: true, row };
}

/** Duyệt/hoàn tiền túi: owner, hoặc manager với khoản không phải của mình (§17.1). */
function reviewGuard(e: ExpenseRow, actor: OpsActor): AdminError | null {
  if (actor.roles.includes("owner")) return null;
  if (!actor.roles.includes("manager")) return "forbidden";
  return e.spentBy === actor.id ? "self_review" : null;
}

export async function reviewPocketCore(id: number, decision: "approve" | "reject", ctx: Ctx): Promise<{ ok: true } | Fail> {
  const db = ctx.db ?? getDb();
  return db.transaction(async (tx) => {
    const e = await lockExpense(tx, id);
    if (!e) return fail("not_found");
    const guard = reviewGuard(e, ctx.actor);
    if (guard) return fail(guard);
    if (e.source !== "pocket" || e.status !== "pending" || e.cancelledAt) return fail("locked");
    await tx
      .update(t.expenses)
      .set({ status: decision === "approve" ? "approved" : "rejected", approvedBy: ctx.actor.id })
      .where(eq(t.expenses.id, id));
    await logEvent(tx, `pocket_${decision}d`, ctx.actor, { id }, ctx.now);
    return { ok: true as const };
  });
}

export async function reimbursePocketCore(id: number, from: "petty" | "bank", ctx: Ctx): Promise<{ ok: true } | Fail> {
  const db = ctx.db ?? getDb();
  return db.transaction(async (tx) => {
    const e = await lockExpense(tx, id);
    if (!e) return fail("not_found");
    const guard = reviewGuard(e, ctx.actor);
    if (guard) return fail(guard);
    if (e.status !== "approved" || e.cancelledAt) return fail("locked");
    await tx.update(t.expenses).set({ status: "reimbursed", reimbursedFrom: from, reimbursedAt: ctx.now }).where(eq(t.expenses.id, id));
    await logEvent(tx, "pocket_reimbursed", ctx.actor, { id, from }, ctx.now);
    return { ok: true as const };
  });
}

export async function attachExpensePhotoCore(id: number, photo: { fileId: string | null; telegramFileId?: string }, ctx: Ctx): Promise<{ ok: true } | Fail> {
  const db = ctx.db ?? getDb();
  const [e] = await db.select({ spentBy: t.expenses.spentBy, cancelledAt: t.expenses.cancelledAt }).from(t.expenses).where(eq(t.expenses.id, id));
  if (!e) return fail("not_found");
  if (e.spentBy !== ctx.actor.id && !canSpend(ctx.actor)) return fail("forbidden");
  await db
    .update(t.expenses)
    .set({ ...(photo.fileId ? { photo: photo.fileId } : {}), ...(photo.telegramFileId ? { telegramFileId: photo.telegramFileId } : {}) })
    .where(eq(t.expenses.id, id));
  return { ok: true };
}

/** Khoảng thời gian một tháng theo giờ VN. `month` = "YYYY-MM". */
export function monthRange(month: string): { from: Date; to: Date; label: string; prev: string } {
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01` as ISODate;
  const next = (m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`) as ISODate;
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return { from: vnInstant(first, "00:00"), to: vnInstant(next, "00:00"), label: `tháng ${m}/${y}`, prev };
}

/** Chi phí còn hiệu lực (chưa huỷ, không bị từ chối) trong khoảng [from, to). */
const effective = (from: Date, to: Date) =>
  and(isNull(t.expenses.cancelledAt), ne(t.expenses.status, "rejected"), gte(t.expenses.spentAt, from), lt(t.expenses.spentAt, to));

export async function expenseSummary(month: string, db: Executor = getDb()): Promise<ExpenseSummary> {
  const { from, to, label, prev } = monthRange(month);
  const rows = await db
    .select({ category: t.expenses.category, source: t.expenses.source, status: t.expenses.status, amount: t.expenses.amount })
    .from(t.expenses)
    .where(effective(from, to));
  const p = monthRange(prev);
  const [{ previous }] = await db
    .select({ previous: sql<number>`coalesce(sum(${t.expenses.amount}), 0)::int` })
    .from(t.expenses)
    .where(effective(p.from, p.to));
  const sum = <K extends string>(key: (r: (typeof rows)[number]) => K) => {
    const m = new Map<K, number>();
    for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + r.amount);
    return m;
  };
  return {
    label,
    total: rows.reduce((n, r) => n + r.amount, 0),
    count: rows.length,
    byCategory: [...sum((r) => r.category)].map(([category, amount]) => ({ category, amount })),
    bySource: [...sum((r) => r.source)].map(([source, amount]) => ({ source, amount })),
    pendingPocket: rows.filter((r) => r.source === "pocket" && (r.status === "pending" || r.status === "approved")).reduce((n, r) => n + r.amount, 0),
    previousTotal: previous || null,
  };
}

export const monthOf = (now: Date) => vnDateOf(now).slice(0, 7);

/** Cron ngày 1: gửi tổng chi tháng trước một lần (đánh dấu bằng ops_events). */
export async function sendMonthlyExpenseSummary(now: Date, send: (text: string) => Promise<boolean>, db: Db = getDb()) {
  const today = vnDateOf(now);
  if (!today.endsWith("-01")) return false;
  const month = addDays(today, -1).slice(0, 7);
  const key = `expense_summary:${month}`;
  const [done] = await db.select({ id: t.opsEvents.id }).from(t.opsEvents).where(eq(t.opsEvents.type, key)).limit(1);
  if (done) return false;
  const sent = await send(expenseSummaryText(await expenseSummary(month, db)));
  if (sent) await db.insert(t.opsEvents).values({ type: key, actor: "system", data: { month }, createdAt: now });
  return sent;
}

// ── Nhân viên & vai trò ──

export async function setStaffRolesCore(targetId: number, roles: Role[], ctx: Ctx): Promise<{ ok: true } | Fail> {
  const db = ctx.db ?? getDb();
  const [target] = await db.select({ id: t.staff.id, roles: t.staff.roles }).from(t.staff).where(eq(t.staff.id, targetId));
  if (!target) return fail("not_found");
  const next = [...new Set(roles)];
  if (!canAssignRoles(ctx.actor, target, next)) return fail("forbidden");
  await db.update(t.staff).set({ roles: next }).where(eq(t.staff.id, targetId));
  await logEvent(db, "roles_changed", ctx.actor, { staffId: targetId, from: target.roles, to: next }, ctx.now);
  return { ok: true };
}

// ── Nhân viên tự đăng ký qua Clerk (M12) ──

/** Vai được xin: mọi vai trừ chủ quán. Vai quản lý chỉ chủ quán duyệt (canAssignRoles). */
export const REQUESTABLE: Role[] = ["manager", "kitchen", "server", "barista", "shipper"];

export type StaffRequestState = { status: "none" } | { status: "pending"; name: string; roles: Role[] } | { status: "linked" };

export async function staffRequestState(clerkUserId: string, db: Executor = getDb()): Promise<StaffRequestState> {
  const [s] = await db.select().from(t.staff).where(eq(t.staff.clerkUserId, clerkUserId)).limit(1);
  if (!s) return { status: "none" };
  return s.pending ? { status: "pending", name: s.name, roles: s.roles } : { status: "linked" };
}

/** Gửi yêu cầu vào nội bộ: tạo nhân viên `pending` với vai xin + PIN tự đặt (dùng cho máy chung & xác nhận bảng công). */
export async function requestStaffAccessCore(
  input: { clerkUserId: string; name: string; roles: Role[]; pin: string },
  now: Date,
  db: Db = getDb(),
): Promise<{ ok: true } | Fail> {
  const roles = [...new Set(input.roles)].filter((r) => REQUESTABLE.includes(r));
  if (roles.length === 0) return fail("invalid");
  const [existing] = await db.select({ id: t.staff.id }).from(t.staff).where(eq(t.staff.clerkUserId, input.clerkUserId)).limit(1);
  if (existing) return fail("duplicate");
  const [row] = await db
    .insert(t.staff)
    .values({ name: input.name.trim(), roles, pinHash: await hash(input.pin), clerkUserId: input.clerkUserId, pending: true })
    .onConflictDoNothing()
    .returning({ id: t.staff.id });
  if (!row) return fail("duplicate"); // trùng tên
  await db.insert(t.opsEvents).values({ type: "staff_requested", actor: "clerk:" + input.clerkUserId, data: { staffId: row.id, roles }, createdAt: now });
  return { ok: true };
}

/** Duyệt/từ chối yêu cầu. Quản lý duyệt vai nghiệp vụ; vai quản lý cần chủ quán (cùng luật phân công §17.2). */
export async function reviewStaffRequestCore(
  input: { staffId: number; decision: "approve" | "reject"; roles: Role[] },
  ctx: Ctx,
): Promise<{ ok: true } | Fail> {
  const db = ctx.db ?? getDb();
  const [target] = await db.select().from(t.staff).where(and(eq(t.staff.id, input.staffId), eq(t.staff.pending, true))).limit(1);
  if (!target) return fail("not_found");
  if (input.decision === "reject") {
    // Từ chối thì xoá hẳn (chưa có ca/công nào). Quản lý không từ chối được người xin vai quản lý.
    if (!canAssignRoles(ctx.actor, { id: target.id, roles: [] }, target.roles)) return fail("forbidden");
    await db.delete(t.staff).where(and(eq(t.staff.id, target.id), eq(t.staff.pending, true)));
  } else {
    const next = [...new Set(input.roles)];
    if (!canAssignRoles(ctx.actor, { id: target.id, roles: [] }, next)) return fail("forbidden");
    await db.update(t.staff).set({ roles: next, pending: false }).where(eq(t.staff.id, target.id));
  }
  await logEvent(db, input.decision === "approve" ? "staff_approved" : "staff_rejected", ctx.actor, { staffId: target.id, roles: input.roles }, ctx.now);
  return { ok: true };
}

/** Gắn tài khoản Clerk vào nhân viên đang đăng nhập bằng PIN (chủ quán & nhân viên cũ chuyển sang Clerk). */
export async function linkClerkCore(staffId: number, clerkUserId: string, db: Db = getDb()): Promise<{ ok: true } | Fail> {
  return db.transaction(async (tx) => {
    await tx.delete(t.staff).where(and(eq(t.staff.clerkUserId, clerkUserId), eq(t.staff.pending, true)));
    const [taken] = await tx.select({ id: t.staff.id }).from(t.staff).where(eq(t.staff.clerkUserId, clerkUserId)).limit(1);
    if (taken && taken.id !== staffId) return fail("duplicate");
    await tx.update(t.staff).set({ clerkUserId }).where(eq(t.staff.id, staffId));
    return { ok: true } as const;
  });
}

export async function linkTelegramCore(staffId: number, telegramUserId: number, now: Date, db: Db = getDb()) {
  return db.transaction(async (tx) => {
    await tx.update(t.staff).set({ telegramUserId: null }).where(eq(t.staff.telegramUserId, telegramUserId));
    const [s] = await tx
      .update(t.staff)
      .set({ telegramUserId })
      .where(and(eq(t.staff.id, staffId), eq(t.staff.isActive, true)))
      .returning({ id: t.staff.id, name: t.staff.name, roles: t.staff.roles });
    if (s) await tx.insert(t.opsEvents).values({ type: "telegram_linked", actor: `staff:${s.id}`, data: { telegramUserId }, createdAt: now });
    return s ?? null;
  });
}

export async function staffByTelegram(telegramUserId: number, db: Executor = getDb()): Promise<OpsActor | null> {
  const [s] = await db
    .select({ id: t.staff.id, name: t.staff.name, roles: t.staff.roles })
    .from(t.staff)
    .where(and(eq(t.staff.telegramUserId, telegramUserId), eq(t.staff.isActive, true)));
  return s ?? null;
}

// ── Ảnh (báo cáo Sapo, hoá đơn) — bytea trong Postgres ──

export const FILE_MAX_BYTES = 1_048_576;
export const FILE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export async function saveFile(input: { mime: string; bytes: Buffer; by: number | null }, db: Executor = getDb()): Promise<string> {
  const [row] = await db
    .insert(t.opsFiles)
    .values({ mime: input.mime, bytes: input.bytes, size: input.bytes.length, createdBy: input.by })
    .returning({ id: t.opsFiles.id });
  return row.id;
}

export async function loadFile(id: string, db: Executor = getDb()) {
  const [row] = await db.select({ mime: t.opsFiles.mime, bytes: t.opsFiles.bytes, createdBy: t.opsFiles.createdBy }).from(t.opsFiles).where(eq(t.opsFiles.id, id));
  return row ?? null;
}

// ── Màn hình Vận hành: DTO ──

export type ExpenseView = {
  id: number;
  spentAt: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  source: ExpenseSource;
  status: ExpenseRow["status"];
  by: string;
  photo: string | null;
  cancelled: boolean;
  replenished: boolean;
  canCancel: boolean;
  canReview: boolean;
};

export type ShiftView = {
  id: number;
  serviceDate: ISODate;
  openedAt: string;
  openedBy: string;
  opening: number;
  closedAt: string | null;
  closedBy: string | null;
  counted: number | null;
  expected: number | null;
  cafeCash: number | null;
  cafeTransfer: number | null;
  cafeOther: number | null;
  drop: number;
  sapoPhoto: string | null;
};

export type StaffView = { id: number; name: string; roles: Role[]; telegram: boolean; isActive: boolean; pending: boolean; clerk: boolean };

export type OpsView = {
  serverNow: string;
  viewer: { id: number; name: string; roles: Role[]; canSpend: boolean; isOwner: boolean; canAssign: boolean };
  settings: { cashTolerance: number; pettyFloat: number };
  openShift: ShiftView | null;
  recentShifts: ShiftView[];
  petty: { float: number; unreplenished: number };
  expenses: ExpenseView[];
  month: ExpenseSummary;
  staff: StaffView[];
  telegramBot: string | null;
};

export async function loadOpsView(viewer: OpsActor, now: Date, db: Db = getDb()): Promise<OpsView> {
  const { ops } = await loadSettings(db);
  const names = new Map((await db.select({ id: t.staff.id, name: t.staff.name }).from(t.staff)).map((s) => [s.id, s.name]));
  const nameOf = (id: number | null) => (id === null ? null : (names.get(id) ?? `#${id}`));

  const shifts = await db.select().from(t.shifts).orderBy(desc(t.shifts.openedAt)).limit(8);
  const entries = shifts.length
    ? await db.select().from(t.cashEntries).where(inArray(t.cashEntries.shiftId, shifts.map((s) => s.id))).orderBy(asc(t.cashEntries.createdAt))
    : [];
  const isManager = canSpend(viewer);
  const toView = (s: (typeof shifts)[number]): ShiftView => {
    const es = entries.filter((e) => e.shiftId === s.id);
    const close = es.find((e) => e.kind === "close");
    return {
      id: s.id,
      serviceDate: s.serviceDate,
      openedAt: s.openedAt.toISOString(),
      openedBy: nameOf(s.openedBy)!,
      opening: es.find((e) => e.kind === "open")?.total ?? 0,
      closedAt: s.closedAt?.toISOString() ?? null,
      closedBy: nameOf(s.closedBy),
      counted: close?.total ?? null,
      // Đếm mù: số đáng có chỉ hiện sau khi đã đếm (ca đã đóng).
      expected: close?.expected ?? null,
      cafeCash: s.cafeCash,
      cafeTransfer: s.cafeTransfer,
      cafeOther: s.cafeOther,
      drop: es.filter((e) => e.kind === "drop").reduce((n, e) => n + e.total, 0),
      sapoPhoto: s.sapoPhoto,
    };
  };
  const open = shifts.find((s) => s.status === "open");

  const since = new Date(now.getTime() - 45 * 86_400_000);
  const rows = await db
    .select()
    .from(t.expenses)
    .where(or(gte(t.expenses.spentAt, since), inArray(t.expenses.status, ["pending", "approved"])))
    .orderBy(desc(t.expenses.spentAt), desc(t.expenses.id))
    .limit(200);
  const petty = await pettyState(db);
  const staff = isManager
    ? (await db.select().from(t.staff).orderBy(asc(t.staff.name))).map((s) => ({
        id: s.id,
        name: s.name,
        roles: s.roles,
        telegram: s.telegramUserId !== null,
        isActive: s.isActive,
        pending: s.pending,
        clerk: s.clerkUserId !== null,
      }))
    : [];
  const me = (await db.select({ tg: t.staff.telegramUserId, clerk: t.staff.clerkUserId }).from(t.staff).where(eq(t.staff.id, viewer.id)))[0];
  if (!isManager) staff.push({ id: viewer.id, name: viewer.name, roles: viewer.roles, telegram: me?.tg != null, isActive: true, pending: false, clerk: me?.clerk != null });

  return {
    serverNow: now.toISOString(),
    viewer: { id: viewer.id, name: viewer.name, roles: viewer.roles, canSpend: isManager, isOwner: viewer.roles.includes("owner"), canAssign: isManager },
    settings: { cashTolerance: ops.cashTolerance, pettyFloat: ops.pettyFloat },
    openShift: open ? toView(open) : null,
    recentShifts: shifts.filter((s) => s.status === "closed").map(toView),
    petty: { float: petty.float, unreplenished: petty.unreplenished },
    // Nhân viên không chi tiền chỉ thấy khoản của mình (không có) — chi phí chỉ dành cho owner/manager.
    expenses: isManager
      ? rows.map((e) => ({
          id: e.id,
          spentAt: e.spentAt.toISOString(),
          amount: e.amount,
          category: e.category,
          description: e.description,
          source: e.source,
          status: e.status,
          by: nameOf(e.spentBy)!,
          photo: e.photo,
          cancelled: e.cancelledAt !== null,
          replenished: e.replenishId !== null,
          canCancel: canCancelExpense(e, viewer, now),
          canReview: reviewGuard(e, viewer) === null,
        }))
      : [],
    month: isManager ? await expenseSummary(monthOf(now), db) : { label: "", total: 0, count: 0, byCategory: [], bySource: [], pendingPocket: 0 },
    staff,
    telegramBot: process.env.TELEGRAM_BOT_USERNAME || null,
  };
}

export async function saveOpsSettingsCore(input: { cashTolerance: number; pettyFloat: number }, ctx: Ctx): Promise<{ ok: true } | Fail> {
  if (!ctx.actor.roles.includes("owner")) return fail("forbidden");
  const db = ctx.db ?? getDb();
  const value = { ...(await loadSettings(db)).ops, ...input };
  await db.insert(t.settings).values({ key: "ops", value }).onConflictDoUpdate({ target: t.settings.key, set: { value } });
  await logEvent(db, "ops_settings", ctx.actor, input, ctx.now);
  return { ok: true };
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}
