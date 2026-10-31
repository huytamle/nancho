// Chấm điểm khẩu vị 1 chạm (BLUEPRINT §18.5). Thuần — dùng chung client/server.
// Điểm: 3 = 😋 Ngon · 2 = 🙂 Được · 1 = 😕 Chưa hợp (trung bình càng cao càng tốt).

import { addDays, type ISODate } from "@/lib/domain/time";
import type { Kind, OrderStatus } from "@/lib/domain/types";

export type Score = 1 | 2 | 3;
export const SCORES: Score[] = [3, 2, 1];
export const SCORE_EMOJI: Record<Score, string> = { 3: "😋", 2: "🙂", 1: "😕" };
export const SCORE_LABEL: Record<Score, string> = { 3: "Ngon", 2: "Được", 1: "Chưa hợp" };

/** Chip gợi ý khi chọn 😕, theo loại món. */
export const FEEDBACK_TAGS: Partial<Record<Kind, readonly string[]>> = {
  bbq: ["ngọt hơn", "cay hơn", "mềm hơn", "ít mặn"],
  pizza: ["nhiều phô mai hơn", "đế mỏng hơn", "ít dầu"],
};

export const COMMENT_MAX = 300;
export const RATE_WINDOW_DAYS = 7;
export const EDIT_WINDOW_MS = 24 * 3_600_000;

export type RatableItem = { productId: string; name: string; kind: Kind };

/**
 * Món được chấm: món chính không phải quà; combo tách thành pizza + BBQ đã chọn (để chỉnh từng công thức).
 * Add-on không chấm. Mỗi món một lần dù đặt nhiều.
 */
export function ratableItems(
  items: { productId: string; isGift: boolean; parentId: number | null; comboChoices: Record<string, string> | null }[],
  products: Map<string, { name: string; kind: Kind }>,
): RatableItem[] {
  const out = new Map<string, RatableItem>();
  const add = (id: string) => {
    const p = products.get(id);
    if (p && p.kind !== "addon" && p.kind !== "combo" && !out.has(id)) out.set(id, { productId: id, name: p.name, kind: p.kind });
  };
  for (const i of items) {
    if (i.isGift || i.parentId !== null) continue;
    if (i.comboChoices) Object.values(i.comboChoices).forEach(add);
    else add(i.productId);
  }
  const rank = (k: Kind) => (k === "pizza" ? 0 : k === "bbq" ? 1 : 2);
  return [...out.values()].sort((a, b) => rank(a.kind) - rank(b.kind));
}

/** Mở chấm điểm khi đơn hoàn tất, trong 7 ngày kể từ ngày phục vụ. */
export const canRate = (status: OrderStatus, serviceDate: ISODate, today: ISODate) =>
  status === "completed" && today <= addDays(serviceDate, RATE_WINDOW_DAYS);

/** Sửa được trong 24 giờ kể từ lần gửi đầu. */
export const canEditFeedback = (createdAt: Date, now: Date) => now.getTime() - createdAt.getTime() <= EDIT_WINDOW_MS;

export type FeedbackInput = { ratings: Record<string, number>; tags: Record<string, string[]>; comment: string };
export type CleanFeedback = { ratings: Record<string, Score>; tags: Record<string, string[]>; comment: string | null };

/** Chỉ giữ món của đơn; chip chỉ cho 😕 và đúng loại món; cần ít nhất một điểm. */
export function cleanFeedback(input: FeedbackInput, items: RatableItem[]): CleanFeedback | null {
  const byId = new Map(items.map((i) => [i.productId, i]));
  const ratings: Record<string, Score> = {};
  const tags: Record<string, string[]> = {};
  for (const [id, raw] of Object.entries(input.ratings)) {
    const item = byId.get(id);
    if (!item || (raw !== 1 && raw !== 2 && raw !== 3)) continue;
    ratings[id] = raw;
    if (raw === 1) {
      const allowed = FEEDBACK_TAGS[item.kind] ?? [];
      const picked = [...new Set((input.tags[id] ?? []).filter((t) => allowed.includes(t)))];
      if (picked.length > 0) tags[id] = picked;
    }
  }
  if (Object.keys(ratings).length === 0) return null;
  const comment = input.comment.trim().slice(0, COMMENT_MAX);
  return { ratings, tags, comment: comment || null };
}

/** Điểm trung bình (1–3, một chữ số thập phân) của các lượt chấm một món. */
export function averageScore(scores: Score[]): number | null {
  if (scores.length === 0) return null;
  return Math.round((scores.reduce<number>((s, x) => s + x, 0) / scores.length) * 10) / 10;
}
