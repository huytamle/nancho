// Vai trò nhân viên (BLUEPRINT §17.2). Một người kiêm nhiều vai trò; quyền đổi trạng thái đơn vẫn theo 3 vai
// của §7.5 (owner · kitchen · shipper) — `manager` làm việc ở bếp như `kitchen`; `server`/`barista` không vào bếp.

import { canTransition, type StaffRole, type TransitionContext, type TransitionResult } from "@/lib/domain/order-status";
import type { OrderStatus } from "@/lib/domain/types";

export const ROLES = ["owner", "manager", "kitchen", "server", "barista", "shipper"] as const;
export type Role = (typeof ROLES)[number];

export const isRole = (v: string): v is Role => (ROLES as readonly string[]).includes(v);

/** Có ít nhất một vai trò trong `wanted`. */
export const hasRole = (roles: readonly Role[], wanted: readonly Role[]) => wanted.some((r) => roles.includes(r));

/** Các vai trò đổi trạng thái đơn (§7.5) suy ra từ vai trò vận hành, theo thứ tự quyền giảm dần. */
export function orderRoles(roles: readonly Role[]): StaffRole[] {
  const out: StaffRole[] = [];
  if (roles.includes("owner")) out.push("owner");
  if (roles.includes("manager") || roles.includes("kitchen")) out.push("kitchen");
  if (roles.includes("shipper")) out.push("shipper");
  return out;
}

/** Vai trò chính ở Kitchen Dashboard (chọn tab); null = không vào bếp. */
export const primaryOrderRole = (roles: readonly Role[]): StaffRole | null => orderRoles(roles)[0] ?? null;

/** canTransition cho người kiêm nhiều vai: được nếu một trong các vai được. */
export function canTransitionAs(
  roles: readonly StaffRole[],
  from: OrderStatus,
  to: OrderStatus,
  ctx: Omit<TransitionContext, "actor">,
): TransitionResult {
  let first: TransitionResult = { ok: false, reason: "forbidden" };
  for (const [i, role] of roles.entries()) {
    const r = canTransition(from, to, { ...ctx, actor: { type: "staff", role } });
    if (r.ok) return r;
    if (i === 0) first = r;
  }
  return first;
}

/**
 * Phân công vai trò (§17.2): owner đổi được mọi người nhưng không tự bỏ `owner` của mình (tránh khoá quán);
 * manager chỉ đổi các vai nghiệp vụ — không cấp/thu `owner`, `manager` (kể cả của chính mình).
 */
export function canAssignRoles(actor: { id: number; roles: readonly Role[] }, target: { id: number; roles: readonly Role[] }, next: readonly Role[]): boolean {
  if (next.length === 0) return false;
  if (actor.roles.includes("owner")) return !(actor.id === target.id && !next.includes("owner"));
  if (!actor.roles.includes("manager")) return false;
  const guarded: Role[] = ["owner", "manager"];
  return guarded.every((r) => target.roles.includes(r) === next.includes(r));
}
