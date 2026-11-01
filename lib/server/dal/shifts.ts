import "server-only";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { canEditOps } from "@/lib/domain/checklist";
import { onPayroll } from "@/lib/domain/payroll";
import { addDays, isHHmm, vnDateOf, type ISODate } from "@/lib/domain/time";
import { getDb, type Db, type Executor } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { fail, logEvent, type OpsActor, type OpsCtx, type OpsFail } from "@/lib/server/dal/ops";

// Đăng ký / nhường / xin nghỉ ca. Nhân viên chỉ *đề nghị*; lịch (`shift_plans`) chỉ đổi khi quản lý duyệt —
// vì lịch quyết định đi muộn/về sớm và giờ công. Không ai tự duyệt đề nghị của chính mình.

type Ok<T = object> = { ok: true } & T;
type Fail = OpsFail;
type Row = typeof t.shiftRequests.$inferSelect;

const hhmm = (v: string) => v.slice(0, 5);
const dm = (d: ISODate) => `${d.slice(8)}/${d.slice(5, 7)}`;
const KIND_TEXT = { claim: "đăng ký ca", give: "nhường ca", leave: "xin nghỉ" } as const;

async function staffOf(db: Executor, id: number) {
  const [s] = await db.select({ id: t.staff.id, name: t.staff.name, roles: t.staff.roles, isActive: t.staff.isActive }).from(t.staff).where(eq(t.staff.id, id));
  return s && s.isActive && onPayroll(s.roles) ? s : null;
}

async function planOf(db: Executor, staffId: number, date: ISODate) {
  const [p] = await db.select().from(t.shiftPlans).where(and(eq(t.shiftPlans.staffId, staffId), eq(t.shiftPlans.date, date)));
  return p ?? null;
}

export type ShiftRequestInput = {
  kind: "claim" | "give" | "leave";
  date: ISODate;
  start?: string | null;
  end?: string | null;
  targetId?: number | null;
  note?: string;
};

export async function requestShiftCore(input: ShiftRequestInput, ctx: OpsCtx): Promise<Ok<{ telegram: string | null }> | Fail> {
  const { actor, now } = ctx;
  if (!onPayroll(actor.roles)) return fail("forbidden");
  const db = ctx.db ?? getDb();
  if (input.date < vnDateOf(now)) return fail("too_late");
  const mine = await planOf(db, actor.id, input.date);
  let start: string | null = null;
  let end: string | null = null;
  let targetId: number | null = null;
  if (input.kind === "claim") {
    if (!input.start || !input.end || !isHHmm(input.start) || !isHHmm(input.end) || input.end <= input.start) return fail("invalid");
    if (mine) return fail("conflict");
    [start, end] = [input.start, input.end];
  } else {
    if (!mine) return fail("not_found"); // chỉ nhường/nghỉ ca mình đang có
    if (input.kind === "give" && input.targetId) {
      if (input.targetId === actor.id || !(await staffOf(db, input.targetId))) return fail("invalid");
      targetId = input.targetId;
    }
  }
  // Một đề nghị đang chờ cho mỗi (người, ngày).
  const active = await db
    .select({ id: t.shiftRequests.id })
    .from(t.shiftRequests)
    .where(and(eq(t.shiftRequests.staffId, actor.id), eq(t.shiftRequests.date, input.date), inArray(t.shiftRequests.status, ["open", "pending"])));
  if (active.length) return fail("duplicate");
  const status = input.kind === "give" ? "open" : "pending";
  const note = (input.note ?? "").trim().slice(0, 200);
  await db.insert(t.shiftRequests).values({ kind: input.kind, staffId: actor.id, date: input.date, start, end, targetId, status, note });
  await logEvent(db, "shift_requested", actor, { kind: input.kind, date: input.date, targetId }, now);
  const telegram = status === "pending" ? `📅 ${actor.name} ${KIND_TEXT[input.kind]} ${dm(input.date)} — chờ duyệt trong Vận hành → Công.` : null;
  return { ok: true, telegram };
}

/** Đồng nghiệp nhận (hoặc từ chối) ca được nhường → sang chờ quản lý duyệt. */
export async function respondShiftCore(input: { id: number; accept: boolean }, ctx: OpsCtx): Promise<Ok<{ telegram: string | null }> | Fail> {
  const { actor, now } = ctx;
  if (!onPayroll(actor.roles)) return fail("forbidden");
  const db = ctx.db ?? getDb();
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(t.shiftRequests).where(eq(t.shiftRequests.id, input.id)).for("update");
    if (!r || r.kind !== "give") return fail("not_found");
    if (r.status !== "open" || r.staffId === actor.id || (r.targetId !== null && r.targetId !== actor.id)) return fail("too_late");
    if (!input.accept) {
      if (r.targetId !== actor.id) return fail("forbidden"); // chỉ người được chỉ định mới từ chối
      await tx.update(t.shiftRequests).set({ status: "rejected" }).where(eq(t.shiftRequests.id, r.id));
      await logEvent(tx, "shift_declined", actor, { id: r.id }, now);
      return { ok: true, telegram: null };
    }
    if (r.date < vnDateOf(now)) return fail("too_late");
    if (await planOf(tx, actor.id, r.date)) return fail("conflict");
    await tx.update(t.shiftRequests).set({ status: "pending", targetId: actor.id }).where(eq(t.shiftRequests.id, r.id));
    await logEvent(tx, "shift_accepted", actor, { id: r.id }, now);
    return { ok: true, telegram: `📅 ${actor.name} nhận ca ${dm(r.date)} của đồng nghiệp — chờ duyệt trong Vận hành → Công.` };
  });
}

export async function cancelShiftRequestCore(input: { id: number }, ctx: OpsCtx): Promise<Ok | Fail> {
  const db = ctx.db ?? getDb();
  const [r] = await db.select().from(t.shiftRequests).where(eq(t.shiftRequests.id, input.id));
  if (!r || r.staffId !== ctx.actor.id) return fail("not_found");
  if (r.status !== "open" && r.status !== "pending") return fail("too_late");
  await db.update(t.shiftRequests).set({ status: "cancelled" }).where(and(eq(t.shiftRequests.id, r.id), inArray(t.shiftRequests.status, ["open", "pending"])));
  await logEvent(db, "shift_cancelled", ctx.actor, { id: r.id }, ctx.now);
  return { ok: true };
}

/** Quản lý duyệt/từ chối. Duyệt = áp vào `shift_plans` trong cùng giao dịch; lịch đã đổi giữa chừng → `conflict`. */
export async function decideShiftCore(input: { id: number; approve: boolean }, ctx: OpsCtx): Promise<Ok | Fail> {
  const { actor, now } = ctx;
  if (!canEditOps(actor.roles)) return fail("forbidden");
  const db = ctx.db ?? getDb();
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(t.shiftRequests).where(eq(t.shiftRequests.id, input.id)).for("update");
    if (!r) return fail("not_found");
    if (r.staffId === actor.id) return fail("self_review");
    if (r.status !== "pending") return fail("too_late");
    if (input.approve) {
      if (r.date < vnDateOf(now)) return fail("too_late");
      const mine = await planOf(tx, r.staffId, r.date);
      if (r.kind === "claim") {
        if (mine) return fail("conflict");
        await tx.insert(t.shiftPlans).values({ staffId: r.staffId, date: r.date, start: r.start!, end: r.end! });
      } else {
        if (!mine) return fail("conflict");
        if (r.kind === "give") {
          if (!r.targetId || (await planOf(tx, r.targetId, r.date))) return fail("conflict");
          await tx.insert(t.shiftPlans).values({ staffId: r.targetId, date: r.date, start: mine.start, end: mine.end });
        }
        await tx.delete(t.shiftPlans).where(eq(t.shiftPlans.id, mine.id));
      }
    }
    await tx.update(t.shiftRequests).set({ status: input.approve ? "approved" : "rejected", decidedBy: actor.id }).where(eq(t.shiftRequests.id, r.id));
    await logEvent(tx, input.approve ? "shift_approved" : "shift_rejected", actor, { id: r.id, kind: r.kind, staffId: r.staffId }, now);
    return { ok: true };
  });
}

// ── DTO ──

export type ShiftRequestView = {
  id: number;
  kind: Row["kind"];
  status: Row["status"];
  date: ISODate;
  start: string | null;
  end: string | null;
  from: string;
  to: string | null;
  note: string;
};

export type ShiftsView = {
  colleagues: { id: number; name: string }[];
  /** Đề nghị của mình (còn chờ + 5 cái gần nhất). */
  mine: ShiftRequestView[];
  /** Ca đồng nghiệp nhường mình có thể nhận. */
  offers: ShiftRequestView[];
  /** Chờ quản lý duyệt (chỉ owner/manager; không gồm của chính mình). */
  review: ShiftRequestView[];
};

export async function loadShifts(viewer: OpsActor, now: Date, db: Db = getDb()): Promise<ShiftsView> {
  const today = vnDateOf(now);
  const people = await db.select({ id: t.staff.id, name: t.staff.name, roles: t.staff.roles, isActive: t.staff.isActive }).from(t.staff).orderBy(asc(t.staff.name));
  const name = (id: number | null) => (id === null ? null : (people.find((p) => p.id === id)?.name ?? `#${id}`));
  const rows = await db
    .select()
    .from(t.shiftRequests)
    .where(gte(t.shiftRequests.date, addDays(today, -14)))
    .orderBy(desc(t.shiftRequests.createdAt));
  const view = (r: Row): ShiftRequestView => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    date: r.date,
    start: r.start && hhmm(r.start),
    end: r.end && hhmm(r.end),
    from: name(r.staffId)!,
    to: name(r.targetId),
    note: r.note,
  });
  const payroll = onPayroll(viewer.roles);
  const mine = rows.filter((r) => r.staffId === viewer.id);
  return {
    colleagues: payroll ? people.filter((p) => p.isActive && onPayroll(p.roles) && p.id !== viewer.id).map((p) => ({ id: p.id, name: p.name })) : [],
    mine: [...mine.filter((r) => r.status === "open" || r.status === "pending"), ...mine.filter((r) => r.status !== "open" && r.status !== "pending").slice(0, 5)].map(view),
    offers: payroll ? rows.filter((r) => r.kind === "give" && r.status === "open" && r.staffId !== viewer.id && r.date >= today && (r.targetId === null || r.targetId === viewer.id)).map(view) : [],
    review: canEditOps(viewer.roles) ? rows.filter((r) => r.status === "pending" && r.staffId !== viewer.id && r.date >= today).map(view) : [],
  };
}
