import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { averageScore, canEditFeedback, canRate, cleanFeedback, SCORE_EMOJI, type FeedbackInput, type Score } from "@/lib/domain/feedback";
import { vnDateOf } from "@/lib/domain/time";
import { getDb, type Executor } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { ratableFor } from "@/lib/server/dal/orders";
import { feedbackText } from "@/lib/server/notify/messages";

// Chấm điểm khẩu vị (§18.5). Không cần đăng nhập: token đơn 128-bit là đủ; Server Action lo rate-limit.

export type FeedbackOutcome = { ok: true; telegram: string } | { ok: false; reason: "not_found" | "closed" | "locked" | "invalid" };

export async function submitFeedbackCore(token: string, input: FeedbackInput, ctx: { now: Date; db?: Executor }): Promise<FeedbackOutcome> {
  const db = ctx.db ?? getDb();
  const [o] = await db.select().from(t.orders).where(eq(t.orders.trackingToken, token)).limit(1);
  if (!o) return { ok: false, reason: "not_found" };
  if (!canRate(o.status, o.serviceDate, vnDateOf(ctx.now))) return { ok: false, reason: "closed" };

  const items = await ratableFor(await db.select().from(t.orderItems).where(eq(t.orderItems.orderId, o.id)), db);
  const clean = cleanFeedback(input, items);
  if (!clean) return { ok: false, reason: "invalid" };

  const [existing] = await db.select().from(t.feedback).where(eq(t.feedback.orderId, o.id)).limit(1);
  if (existing && !canEditFeedback(existing.createdAt, ctx.now)) return { ok: false, reason: "locked" };

  // Một bản mỗi đơn: hai lần gửi song song → lần sau thành cập nhật; chỉ cập nhật khi còn trong 24 giờ.
  const [row] = await db
    .insert(t.feedback)
    .values({ orderId: o.id, ...clean, createdAt: ctx.now, updatedAt: ctx.now })
    .onConflictDoUpdate({
      target: t.feedback.orderId,
      set: { ratings: clean.ratings, tags: clean.tags, comment: clean.comment, updatedAt: ctx.now },
      setWhere: sql`${t.feedback.createdAt} >= ${new Date(ctx.now.getTime() - 24 * 3_600_000).toISOString()}::timestamptz`,
    })
    .returning({ id: t.feedback.id });
  if (!row) return { ok: false, reason: "locked" };

  const nameOf = new Map(items.map((i) => [i.productId, i.name.replace(/^Pan Pizza /, "").replace(/ — .*$/, "")]));
  return {
    ok: true,
    telegram: feedbackText({
      seq: o.seq,
      edited: !!existing,
      comment: clean.comment,
      lines: Object.entries(clean.ratings).map(([id, s]) => ({ name: nameOf.get(id) ?? id, emoji: SCORE_EMOJI[s], tags: clean.tags[id] ?? [] })),
    }),
  };
}

export type ProductFeedback = { average: number | null; count: number; unhappy: number; tags: { tag: string; n: number }[] };

/** Điểm khẩu vị 4 tuần của một món — trang công thức trong Sổ tay (owner/manager). */
export async function productFeedback(productId: string, now: Date, db: Executor = getDb()): Promise<ProductFeedback> {
  const since = new Date(now.getTime() - 28 * 86_400_000);
  const rows = await db
    .select({ ratings: t.feedback.ratings, tags: t.feedback.tags })
    .from(t.feedback)
    .where(and(gte(t.feedback.createdAt, since), sql`${t.feedback.ratings} ? ${productId}`));
  const scores = rows.map((r) => r.ratings[productId]).filter((s): s is Score => s === 1 || s === 2 || s === 3);
  const tagCount = new Map<string, number>();
  for (const r of rows) for (const tag of r.tags[productId] ?? []) tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
  return {
    average: averageScore(scores),
    count: scores.length,
    unhappy: scores.filter((s) => s === 1).length,
    tags: [...tagCount].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n),
  };
}
