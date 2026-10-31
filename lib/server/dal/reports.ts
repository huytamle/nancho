import "server-only";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { progress } from "@/lib/domain/checklist";
import { shoppingList, type ShoppingLine } from "@/lib/domain/metrics";
import { saleUsage } from "@/lib/domain/stock";
import { addDays, vnDateOf, vnInstant, vnWeekday, type ISODate } from "@/lib/domain/time";
import type { Product } from "@/lib/domain/types";
import { weekStart } from "@/lib/domain/worktime";
import {
  dayReportText,
  dayText,
  eveningReportText,
  feedbackDigestText,
  marketText,
  scheduleText,
  type DayReport,
  type EveningReport,
  type FeedbackItem,
  type ScheduleDay,
} from "@/lib/metrics-text";
import { getDb, type Db, type Executor } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { loadSettings } from "@/lib/server/dal/settings";
import { onHandMap } from "@/lib/server/dal/stock";
import type { Summarize } from "@/lib/server/notify/ai";

// Báo cáo tối & trợ thủ Telegram (§17.10, M11). Mỗi báo cáo gửi **một lần mỗi ngày** — đánh dấu `ops_events`
// (`evening_report:<ngày>`, `day_report:<ngày>`, `market:<ngày>`, `feedback_digest:<ngày>`), chỉ đánh dấu khi gửi được.

type Send = (text: string) => Promise<boolean>;
const day0 = (d: ISODate) => vnInstant(d, "00:00");

/** Gửi một lần cho `key`. Giữ chỗ trước (khoá advisory theo key) để hai request song song không gửi đôi. */
async function once(db: Db, key: string, now: Date, build: () => Promise<string | null>, send: Send): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
    const [done] = await tx.select({ id: t.opsEvents.id }).from(t.opsEvents).where(eq(t.opsEvents.type, key)).limit(1);
    if (done) return false;
    const text = await build();
    if (!text || !(await send(text))) return false;
    await tx.insert(t.opsEvents).values({ type: key, actor: "system", data: {}, createdAt: now });
    return true;
  });
}

/** Ngày bán kế tiếp sau `after` (có mẻ, ngày không đóng). */
export async function nextSaleDay(db: Executor, after: ISODate): Promise<ISODate | null> {
  const [r] = await db
    .select({ d: t.batches.serviceDate })
    .from(t.batches)
    .innerJoin(t.serviceDays, eq(t.serviceDays.date, t.batches.serviceDate))
    .where(and(gt(t.batches.serviceDate, after), ne(t.serviceDays.status, "closed")))
    .orderBy(asc(t.batches.serviceDate))
    .limit(1);
  return r?.d ?? null;
}

async function isSaleDay(db: Executor, date: ISODate): Promise<boolean> {
  const [r] = await db
    .select({ id: t.batches.id })
    .from(t.batches)
    .innerJoin(t.serviceDays, eq(t.serviceDays.date, t.batches.serviceDate))
    .where(and(eq(t.batches.serviceDate, date), ne(t.serviceDays.status, "closed")))
    .limit(1);
  return !!r;
}

/** Danh sách cần mua: dưới mức tối thiểu + lượng còn cần cho đơn đã đặt của ngày bán `next`. */
export async function shoppingFor(db: Executor, next: ISODate | null): Promise<ShoppingLine[]> {
  const items = (await db.select().from(t.ingredients)).filter((i) => i.trackStock);
  if (items.length === 0) return [];
  const onHand = await onHandMap(db, items.map((i) => i.id));
  let need = new Map<string, number>();
  if (next) {
    const orders = await db
      .select({ id: t.orders.id })
      .from(t.orders)
      .where(and(eq(t.orders.serviceDate, next), inArray(t.orders.status, ["placed", "confirmed", "baking"])));
    if (orders.length) {
      const lines = await db.select().from(t.orderItems).where(inArray(t.orderItems.orderId, orders.map((o) => o.id)));
      const products = (await db.select().from(t.products)) as Product[];
      need = saleUsage(orders.map((o) => ({ items: lines.filter((l) => l.orderId === o.id) })), products, await db.select().from(t.recipeLines));
    }
  }
  return shoppingList(
    items.map((i) => ({ id: i.id, label: i.label, unit: i.unit, onHand: onHand.get(i.id) ?? 0, parLevel: i.parLevel, purchaseUnit: i.purchaseUnit, purchaseFactor: i.purchaseFactor })),
    need,
    (i) => i.id,
  );
}

// ── Báo cáo tối pizza ──

export async function eveningReport(now: Date, db: Executor = getDb()): Promise<EveningReport | null> {
  const date = vnDateOf(now);
  if (!(await isSaleDay(db, date))) return null;
  const orders = await db.select().from(t.orders).where(eq(t.orders.serviceDate, date));
  const sold = orders.filter((o) => o.status !== "cancelled" && o.status !== "no_show");
  const sum = (xs: typeof orders) => xs.reduce((n, o) => n + o.total, 0);
  const transferPaid = sum(sold.filter((o) => o.paymentMethod === "transfer" && o.paymentStatus === "paid"));
  const cod = sold.filter((o) => o.paymentMethod === "cod");

  const handovers = await db.select().from(t.cashHandovers).where(eq(t.cashHandovers.serviceDate, date));
  const handed = new Set(handovers.flatMap((h) => h.orderIds));
  const pending = sum(cod.filter((o) => o.status === "completed" && o.fulfillment === "delivery" && !handed.has(o.id)));

  const fb = await db
    .select({ ratings: t.feedback.ratings })
    .from(t.feedback)
    .where(and(gte(t.feedback.createdAt, day0(date)), lt(t.feedback.createdAt, day0(addDays(date, 1)))));
  const scores = fb.flatMap((f) => Object.entries(f.ratings));
  const names = new Map((await db.select({ id: t.products.id, name: t.products.name }).from(t.products)).map((p) => [p.id, p.name.replace(/^Pan Pizza /, "")]));
  const low = [...new Set(scores.filter(([, s]) => s === 1).map(([id]) => names.get(id) ?? id))];
  const avg = scores.length ? Math.round((scores.reduce((n, [, s]) => n + s, 0) / scores.length) * 10) / 10 : null;

  const a = (await db.select().from(t.ingredients).orderBy(asc(t.ingredients.sort))).filter((i) => i.trackStock && i.countClass === "A");
  const onHand = a.length ? await onHandMap(db, a.map((i) => i.id)) : new Map<string, number>();
  const next = await nextSaleDay(db, date);

  return {
    date,
    orders: sold.length,
    revenue: sum(sold),
    transferPaid,
    cod: sum(cod),
    collected: transferPaid + sum(cod.filter((o) => o.status === "completed")),
    cancelled: orders.filter((o) => o.status === "cancelled").length,
    noShow: orders.filter((o) => o.status === "no_show").length,
    handover: { expected: handovers.reduce((n, h) => n + h.expected, 0), received: handovers.reduce((n, h) => n + h.received, 0), pending },
    taste: { count: fb.length, avg, low },
    stockA: a.map((i) => ({ label: i.label, onHand: onHand.get(i.id) ?? 0, unit: i.unit })),
    next,
    shopping: await shoppingFor(db, next),
  };
}

/** Cron 20:15 các ngày bán. Không phải ngày bán → không gửi. */
export async function runEveningReport(now: Date, send: Send, db: Db = getDb()): Promise<{ eveningSent: boolean }> {
  const date = vnDateOf(now);
  const sent = await once(db, `evening_report:${date}`, now, async () => {
    const r = await eveningReport(now, db);
    return r ? eveningReportText(r) : null;
  }, send);
  return { eveningSent: sent };
}

// ── Báo cáo cả ngày (sau khi đóng ca café) ──

export async function dayReport(date: ISODate, db: Executor = getDb()): Promise<DayReport> {
  const { ops } = await loadSettings(db);
  const from = day0(date);
  const to = day0(addDays(date, 1));
  const shifts = await db.select().from(t.shifts).where(and(eq(t.shifts.serviceDate, date), eq(t.shifts.status, "closed"))).orderBy(asc(t.shifts.closedAt));
  const names = new Map((await db.select({ id: t.staff.id, name: t.staff.name }).from(t.staff)).map((s) => [s.id, s.name]));
  const closes = shifts.length
    ? await db
        .select()
        .from(t.cashEntries)
        .where(and(eq(t.cashEntries.kind, "close"), inArray(t.cashEntries.shiftId, shifts.map((s) => s.id))))
        .orderBy(asc(t.cashEntries.createdAt))
    : [];
  const [petty] = await db
    .select()
    .from(t.cashEntries)
    .where(and(eq(t.cashEntries.box, "petty"), eq(t.cashEntries.kind, "check"), gte(t.cashEntries.createdAt, from), lt(t.cashEntries.createdAt, to)))
    .orderBy(desc(t.cashEntries.createdAt))
    .limit(1);
  const [{ pizza }] = await db
    .select({ pizza: sql<number>`coalesce(sum(${t.orders.total}), 0)::int` })
    .from(t.orders)
    .where(and(eq(t.orders.serviceDate, date), eq(t.orders.status, "completed")));

  const tpls = (await db.select().from(t.checklistTemplates).where(eq(t.checklistTemplates.isActive, true)).orderBy(asc(t.checklistTemplates.sort))).filter(
    (x) => x.moment !== "weekly",
  );
  const runs = tpls.length
    ? await db
        .select()
        .from(t.checklistRuns)
        .where(and(eq(t.checklistRuns.serviceDate, date), inArray(t.checklistRuns.templateId, tpls.map((x) => x.id))))
    : [];
  const checklists = tpls.map((tpl) => {
    const done = runs.find((r) => r.templateId === tpl.id)?.done ?? {};
    const p = progress(tpl.items, done);
    return { title: tpl.title, done: p.done, total: p.total, photos: Object.values(done).filter((m) => m.photo).length };
  });

  const counts = await db
    .select({ lines: t.stockCounts.lines })
    .from(t.stockCounts)
    .where(and(eq(t.stockCounts.kind, "quick"), gte(t.stockCounts.createdAt, from), lt(t.stockCounts.createdAt, to)));
  const labels = new Map((await db.select({ id: t.ingredients.id, label: t.ingredients.label }).from(t.ingredients)).map((i) => [i.id, i.label]));
  const quick = counts.flatMap((c) => c.lines).map((l) => ({ label: labels.get(l.ingredientId) ?? l.ingredientId, diffPct: l.pct, over: l.over }));

  const [exp] = await db
    .select({ total: sql<number>`coalesce(sum(${t.expenses.amount}), 0)::int`, count: sql<number>`count(*)::int` })
    .from(t.expenses)
    .where(and(isNull(t.expenses.cancelledAt), ne(t.expenses.status, "rejected"), gte(t.expenses.spentAt, from), lt(t.expenses.spentAt, to)));

  return {
    date,
    cafe: {
      cash: shifts.reduce((n, s) => n + (s.cafeCash ?? 0), 0),
      transfer: shifts.reduce((n, s) => n + (s.cafeTransfer ?? 0), 0),
      other: shifts.reduce((n, s) => n + (s.cafeOther ?? 0), 0),
    },
    pizza,
    shifts: closes.map((c) => ({ by: names.get(c.staffId) ?? "", counted: c.total, expected: c.expected ?? c.total })),
    petty: petty && petty.expected !== null ? { counted: petty.total, expected: petty.expected } : null,
    checklists: checklists.filter((c) => c.total > 0),
    quick,
    expenses: exp,
    tolerance: ops.cashTolerance,
  };
}

/** Gọi ngay sau khi đóng ca café — một lần mỗi ngày (ca đóng đầu tiên của ngày gửi). */
export async function sendDayReport(now: Date, send: Send, db: Db = getDb()): Promise<boolean> {
  const date = vnDateOf(now);
  return once(db, `day_report:${date}`, now, async () => dayReportText(await dayReport(date, db)), send);
}

// ── Nhắc đi chợ (cron hằng ngày): hôm nay không bán, mai bán ──

export async function runMarketReminder(now: Date, send: Send, db: Db = getDb()): Promise<{ marketSent: boolean }> {
  const today = vnDateOf(now);
  const tomorrow = addDays(today, 1);
  if ((await isSaleDay(db, today)) || !(await isSaleDay(db, tomorrow))) return { marketSent: false };
  const sent = await once(db, `market:${today}`, now, async () => {
    const lines = await shoppingFor(db, tomorrow);
    return lines.length ? marketText(tomorrow, lines) : null;
  }, send);
  return { marketSent: sent };
}

// ── Tóm tắt góp ý tuần (Thứ Hai) ──

export async function runFeedbackDigest(now: Date, send: Send, summarize: Summarize, db: Db = getDb()): Promise<{ digestSent: boolean }> {
  const today = vnDateOf(now);
  if (vnWeekday(today) !== 1) return { digestSent: false };
  const from = addDays(today, -7);
  const sent = await once(db, `feedback_digest:${today}`, now, async () => {
    const rows = await db
      .select({ ratings: t.feedback.ratings, tags: t.feedback.tags, comment: t.feedback.comment, createdAt: t.feedback.createdAt })
      .from(t.feedback)
      .where(and(gte(t.feedback.createdAt, day0(from)), lt(t.feedback.createdAt, day0(today))))
      .orderBy(asc(t.feedback.createdAt));
    if (rows.length === 0) return null;
    const names = new Map((await db.select({ id: t.products.id, name: t.products.name }).from(t.products)).map((p) => [p.id, p.name.replace(/^Pan Pizza /, "")]));
    const items: FeedbackItem[] = rows.flatMap((r) =>
      Object.entries(r.ratings).map(([id, score], i) => ({
        date: vnDateOf(r.createdAt),
        product: names.get(id) ?? id,
        score,
        tags: r.tags[id] ?? [],
        // Góp ý chữ thuộc cả đơn — chỉ gắn vào món đầu để không lặp.
        comment: i === 0 ? r.comment : null,
      })),
    );
    const summary = await summarize(
      items.filter((i) => i.comment || i.tags.length || i.score === 1).map((i) => `${i.product} · ${i.score}/3${i.tags.length ? ` · ${i.tags.join(", ")}` : ""}${i.comment ? ` · "${i.comment}"` : ""}`),
    );
    return feedbackDigestText(`${dayText(from)}–${dayText(addDays(today, -1))}`, rows.length, items, summary);
  }, send);
  return { digestSent: sent };
}

// ── /lich ──

export async function scheduleWeek(now: Date, next: boolean, db: Executor = getDb()): Promise<string> {
  const start = addDays(weekStart(vnDateOf(now)), next ? 7 : 0);
  const end = addDays(start, 7);
  const plans = await db
    .select({ date: t.shiftPlans.date, start: t.shiftPlans.start, end: t.shiftPlans.end, name: t.staff.name })
    .from(t.shiftPlans)
    .innerJoin(t.staff, eq(t.staff.id, t.shiftPlans.staffId))
    .where(and(gte(t.shiftPlans.date, start), lt(t.shiftPlans.date, end), eq(t.staff.isActive, true)))
    .orderBy(asc(t.shiftPlans.date), asc(t.shiftPlans.start));
  const days: ScheduleDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return { date, slots: plans.filter((p) => p.date === date).map((p) => ({ name: p.name, start: p.start.slice(0, 5), end: p.end.slice(0, 5) })) };
  });
  return scheduleText(`${next ? "tuần sau" : "tuần này"} (${dayText(start)}–${dayText(addDays(end, -1))})`, days);
}

