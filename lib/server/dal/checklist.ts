import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  canAccess,
  canEditOps,
  isDone,
  markIssue,
  outOfRange,
  progress,
  rangeLabel,
  runDate,
  validItems,
  type ChecklistItem,
  type ChecklistMark,
  type ChecklistMoment,
} from "@/lib/domain/checklist";
import type { Role } from "@/lib/domain/roles";
import { vnDateOf, vnTimeLabel, type ISODate } from "@/lib/domain/time";
import { checklistAlertText } from "@/lib/ops-text";
import { getDb, type Db } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { fail, logEvent, type OpsActor, type OpsCtx, type OpsFail } from "@/lib/server/dal/ops";

// Checklist hằng ngày (§17.5): mẫu theo vai trò & thời điểm, một lượt/ngày (tuần) mà nhiều người cùng tick.
// Quyền ở đây (int test gọi thẳng): nhân viên chỉ làm mẫu gắn vai mình; owner/manager làm & sửa tất cả.

export type ChecklistMarkView = { by: string; at: string; value: number | null; photo: string | null; out: boolean; canUndo: boolean };
export type ChecklistItemView = ChecklistItem & { range: string; done: boolean; mark: ChecklistMarkView | null };
export type ChecklistRunView = {
  templateId: number;
  title: string;
  moment: ChecklistMoment;
  date: ISODate;
  items: ChecklistItemView[];
  done: number;
  total: number;
  complete: boolean;
};
export type TemplateView = { id: number; title: string; roles: Role[]; moment: ChecklistMoment; items: ChecklistItem[]; sort: number; isActive: boolean };
export type WorkView = { today: ISODate; canEdit: boolean; runs: ChecklistRunView[]; templates: TemplateView[] };

const MOMENT_ORDER: Record<ChecklistMoment, number> = { open: 0, during: 1, close: 2, weekly: 3 };

export async function loadWorkView(viewer: OpsActor, now: Date, db: Db = getDb()): Promise<WorkView> {
  const today = vnDateOf(now);
  const canEdit = canEditOps(viewer.roles);
  const all = await db.select().from(t.checklistTemplates).orderBy(asc(t.checklistTemplates.sort), asc(t.checklistTemplates.id));
  const mine = all.filter((x) => x.isActive && canAccess(viewer.roles, x.roles));
  const runs = mine.length
    ? await db
        .select()
        .from(t.checklistRuns)
        .where(inArray(t.checklistRuns.templateId, mine.map((x) => x.id)))
        .then((rs) => rs.filter((r) => r.serviceDate === runDate(mine.find((x) => x.id === r.templateId)!.moment, today)))
    : [];
  const names = new Map((await db.select({ id: t.staff.id, name: t.staff.name }).from(t.staff)).map((s) => [s.id, s.name]));

  return {
    today,
    canEdit,
    runs: mine
      .map((tpl) => {
        const done = runs.find((r) => r.templateId === tpl.id)?.done ?? {};
        const p = progress(tpl.items, done);
        return {
          templateId: tpl.id,
          title: tpl.title,
          moment: tpl.moment,
          date: runDate(tpl.moment, today),
          items: tpl.items.map((item) => {
            const m = done[item.id];
            return {
              ...item,
              range: item.value ? rangeLabel(item.value) : "",
              done: isDone(item, m),
              mark: m
                ? {
                    by: names.get(m.by) ?? `#${m.by}`,
                    at: vnTimeLabel(new Date(m.at)),
                    value: m.value ?? null,
                    photo: m.photo ?? null,
                    out: !!item.value && typeof m.value === "number" && outOfRange(item.value, m.value),
                    canUndo: canEdit || m.by === viewer.id,
                  }
                : null,
            };
          }),
          ...p,
        };
      })
      .sort((a, b) => MOMENT_ORDER[a.moment] - MOMENT_ORDER[b.moment]),
    // Mẫu (kể cả đã tắt) chỉ cho người được sửa.
    templates: canEdit ? all.map((x) => ({ id: x.id, title: x.title, roles: x.roles, moment: x.moment, items: x.items, sort: x.sort, isActive: x.isActive })) : [],
  };
}

export type MarkInput = { templateId: number; itemId: string; value?: number | null; photo?: string | null; undo?: boolean };
export type MarkOutcome = { ok: true; complete: boolean; out: boolean; telegram: string | null };

/** Đánh dấu / bỏ đánh dấu một mục của lượt hôm nay. Số đo ngoài ngưỡng → tin Telegram ⚠ (§17.5). */
export async function markChecklistItemCore(input: MarkInput, ctx: OpsCtx): Promise<MarkOutcome | OpsFail> {
  const db = ctx.db ?? getDb();
  const [tpl] = await db.select().from(t.checklistTemplates).where(eq(t.checklistTemplates.id, input.templateId));
  if (!tpl || !tpl.isActive) return fail("not_found");
  if (!canAccess(ctx.actor.roles, tpl.roles)) return fail("forbidden");
  const item = tpl.items.find((i) => i.id === input.itemId);
  if (!item) return fail("not_found");
  if (!input.undo) {
    const issue = markIssue(item, input);
    if (issue) return fail(issue === "value_required" ? "value_required" : "photo_needed");
  }
  const date = runDate(tpl.moment, vnDateOf(ctx.now));

  return db.transaction(async (tx) => {
    await tx.insert(t.checklistRuns).values({ templateId: tpl.id, serviceDate: date }).onConflictDoNothing();
    const [run] = await tx
      .select()
      .from(t.checklistRuns)
      .where(and(eq(t.checklistRuns.templateId, tpl.id), eq(t.checklistRuns.serviceDate, date)))
      .for("update");
    const done = { ...run.done };
    const prev = done[item.id];
    if (input.undo) {
      if (!prev) return { ok: true as const, complete: progress(tpl.items, done).complete, out: false, telegram: null };
      if (prev.by !== ctx.actor.id && !canEditOps(ctx.actor.roles)) return fail("forbidden");
      delete done[item.id];
    } else {
      const mark: ChecklistMark = { by: ctx.actor.id, at: ctx.now.toISOString() };
      if (item.value) mark.value = input.value!;
      if (input.photo) mark.photo = input.photo;
      done[item.id] = mark;
    }
    const { complete } = progress(tpl.items, done);
    await tx
      .update(t.checklistRuns)
      .set({ done, completedAt: complete ? (run.completedAt ?? ctx.now) : null })
      .where(eq(t.checklistRuns.id, run.id));
    await logEvent(tx, input.undo ? "checklist_unmark" : "checklist_mark", ctx.actor, { templateId: tpl.id, date, itemId: item.id, value: input.value ?? undefined }, ctx.now);

    const out = !input.undo && !!item.value && outOfRange(item.value, input.value!);
    return {
      ok: true as const,
      complete,
      out,
      telegram: out
        ? checklistAlertText({ title: tpl.title, label: item.label, value: input.value!, spec: item.value!, by: ctx.actor.name, time: vnTimeLabel(ctx.now) })
        : null,
    };
  });
}

export type TemplateInput = { id?: number; title: string; roles: Role[]; moment: ChecklistMoment; items: ChecklistItem[]; sort: number; isActive: boolean };

/** Thêm / sửa mẫu (owner, manager). Lượt đã làm giữ nguyên; tiến độ luôn tính theo mẫu hiện tại. */
export async function saveChecklistTemplateCore(input: TemplateInput, ctx: OpsCtx): Promise<{ ok: true; id: number } | OpsFail> {
  if (!canEditOps(ctx.actor.roles)) return fail("forbidden");
  if (!validItems(input.items) || input.roles.length === 0) return fail("invalid");
  const db = ctx.db ?? getDb();
  const values = { title: input.title, roles: input.roles, moment: input.moment, items: input.items, sort: input.sort, isActive: input.isActive };
  let id = input.id;
  if (id === undefined) {
    [{ id }] = await db.insert(t.checklistTemplates).values(values).returning({ id: t.checklistTemplates.id });
  } else {
    const rows = await db.update(t.checklistTemplates).set(values).where(eq(t.checklistTemplates.id, id)).returning({ id: t.checklistTemplates.id });
    if (rows.length === 0) return fail("not_found");
  }
  await logEvent(db, "checklist_template_saved", ctx.actor, { id, title: input.title, items: input.items.length, isActive: input.isActive }, ctx.now);
  return { ok: true, id };
}
