// Checklist hằng ngày & quyền xem sổ tay (BLUEPRINT §17.5–17.6). Thuần — không DB/Next/React.

import { hasRole, type Role } from "@/lib/domain/roles";
import { addDays, vnWeekday, type ISODate } from "@/lib/domain/time";

export const CHECKLIST_MOMENTS = ["open", "during", "close", "weekly"] as const;
export type ChecklistMoment = (typeof CHECKLIST_MOMENTS)[number];

/** Giá trị đo có ngưỡng (VD tủ mát ≤ 5 °C). Thiếu `min`/`max` = không chặn phía đó. */
export type ValueSpec = { unit: string; min?: number; max?: number };
export type ChecklistItem = { id: string; label: string; photo?: boolean; value?: ValueSpec };
/** Một mục đã làm: ai (staff id), lúc nào (ISO), số đo, ảnh (`ops_files`). */
export type ChecklistMark = { by: number; at: string; value?: number; photo?: string };
export type ChecklistDone = Record<string, ChecklistMark>;

export const MAX_ITEMS = 40;
export const ITEM_ID = /^[a-z0-9-]{1,24}$/;

const EDITORS: Role[] = ["owner", "manager"];

/** Owner/manager sửa mẫu checklist, sửa sổ tay và xem tất cả (§17.2). */
export const canEditOps = (roles: readonly Role[]) => hasRole(roles, EDITORS);

/** Được làm checklist / mở trang sổ tay gắn `target` vai trò: owner/manager luôn được, còn lại phải có vai giao nhau. */
export const canAccess = (roles: readonly Role[], target: readonly Role[]) => canEditOps(roles) || hasRole(roles, target);

/** Ngày của lượt checklist: hằng ngày = hôm nay; `weekly` = Thứ Hai của tuần đó (một lượt mỗi tuần). */
export function runDate(moment: ChecklistMoment, today: ISODate): ISODate {
  if (moment !== "weekly") return today;
  return addDays(today, -((vnWeekday(today) + 6) % 7));
}

export const outOfRange = (spec: ValueSpec, value: number) =>
  (spec.min !== undefined && value < spec.min) || (spec.max !== undefined && value > spec.max);

/** "≤ 5 °C" · "≥ 60 °C" · "0–5 °C" · "" (không ngưỡng). */
export function rangeLabel(spec: ValueSpec): string {
  const u = spec.unit ? ` ${spec.unit}` : "";
  if (spec.min !== undefined && spec.max !== undefined) return `${spec.min}–${spec.max}${u}`;
  if (spec.max !== undefined) return `≤ ${spec.max}${u}`;
  if (spec.min !== undefined) return `≥ ${spec.min}${u}`;
  return "";
}

/** Mục chỉ tính "xong" khi có đủ số đo/ảnh theo mẫu hiện tại (mẫu có thể vừa thêm yêu cầu). */
export const isDone = (item: ChecklistItem, mark: ChecklistMark | undefined) =>
  !!mark && (!item.value || typeof mark.value === "number") && (!item.photo || !!mark.photo);

/** Tiến độ theo mẫu hiện tại — mục đã xoá khỏi mẫu không tính. */
export function progress(items: readonly ChecklistItem[], done: ChecklistDone) {
  const n = items.filter((i) => isDone(i, done[i.id])).length;
  return { done: n, total: items.length, complete: items.length > 0 && n === items.length };
}

export type MarkIssue = "value_required" | "photo_required";

/** Kiểm tra dữ liệu khi đánh dấu một mục. */
export function markIssue(item: ChecklistItem, input: { value?: number | null; photo?: string | null }): MarkIssue | null {
  if (item.value && (typeof input.value !== "number" || !Number.isFinite(input.value))) return "value_required";
  if (item.photo && !input.photo) return "photo_required";
  return null;
}

/** Mẫu hợp lệ: 1–40 mục, id duy nhất đúng dạng, nhãn 1–120 ký tự, `min ≤ max`. */
export function validItems(items: readonly ChecklistItem[]): boolean {
  if (items.length === 0 || items.length > MAX_ITEMS) return false;
  const ids = new Set<string>();
  for (const i of items) {
    if (!ITEM_ID.test(i.id) || ids.has(i.id)) return false;
    ids.add(i.id);
    const label = i.label.trim();
    if (label.length === 0 || label.length > 120) return false;
    if (i.value && i.value.min !== undefined && i.value.max !== undefined && i.value.min > i.value.max) return false;
  }
  return true;
}

// ── Sổ tay (§17.6) ──

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "Mở lò & ủ đế" → "mo-lo-u-de" (bỏ dấu tiếng Việt, tối đa 60 ký tự). */
export function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}
