import "server-only";
import { and, eq } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { StaffRole } from "@/lib/domain/order-status";
import { hasRole, orderRoles, primaryOrderRole, type Role } from "@/lib/domain/roles";
import { clerkUserId } from "@/lib/server/auth/clerk";
import { getDb } from "@/lib/server/db/client";
import { staff } from "@/lib/server/db/schema";

// Phiên nhân viên (§10.8): JWT HS256 ký bằng jose trong cookie httpOnly, 30 ngày.
// proxy.ts chỉ kiểm tra lạc quan (có cookie); kiểm tra thật ở requireStaff() — đọc lại nhân viên trong DB
// mỗi request, nên khoá tài khoản/đổi quyền có hiệu lực ngay mà không cần thu hồi token.

export const SESSION_COOKIE = "th_s";
const SESSION_DAYS = 30;
const DEV_SECRET = "dev-only-session-secret-change-me-0123456789";

/**
 * `roles` = vai trò vận hành (§17.2). `role`/`orderRoles` = vai trò đổi trạng thái đơn (§7.5) suy ra từ đó:
 * `role` chọn tab Kitchen Dashboard, null = không vào bếp (chỉ phục vụ/pha chế).
 */
export type Staff = { id: number; name: string; roles: Role[]; role: StaffRole | null; orderRoles: StaffRole[] };

export const toStaff = (s: { id: number; name: string; roles: Role[] }): Staff => ({
  id: s.id,
  name: s.name,
  roles: s.roles,
  role: primaryOrderRole(s.roles),
  orderRoles: orderRoles(s.roles),
});

function key(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return new TextEncoder().encode(s);
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET chưa đặt (≥ 32 ký tự)");
  return new TextEncoder().encode(DEV_SECRET);
}

// Phiên dùng đồng hồ thật (không phải serverNow/TEST_NOW): jose kiểm tra `exp` theo giờ thật.
export async function encrypt(staffId: number): Promise<string> {
  return new SignJWT({ sid: staffId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key());
}

export async function decrypt(token: string | undefined): Promise<number | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<{ sid: number }>(token, key(), { algorithms: ["HS256"] });
    return Number.isInteger(payload.sid) ? payload.sid : null;
  } catch {
    return null;
  }
}

export async function createSession(staffId: number) {
  (await cookies()).set(SESSION_COOKIE, await encrypt(staffId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * Nhân viên của request hiện tại (null nếu chưa đăng nhập / bị khoá / chờ duyệt). Dedupe trong một request.
 * M12: tài khoản Clerk đã gắn với nhân viên được ưu tiên; không có thì dùng phiên PIN (máy chung ở bếp).
 */
export const currentStaff = cache(async (): Promise<Staff | null> => {
  const active = and(eq(staff.isActive, true), eq(staff.pending, false));
  const cols = { id: staff.id, name: staff.name, roles: staff.roles };
  const clerkId = await clerkUserId();
  if (clerkId) {
    const [s] = await getDb().select(cols).from(staff).where(and(eq(staff.clerkUserId, clerkId), active)).limit(1);
    if (s) return toStaff(s);
  }
  const id = await decrypt((await cookies()).get(SESSION_COOKIE)?.value);
  if (id === null) return null;
  const [s] = await getDb().select(cols).from(staff).where(and(eq(staff.id, id), active)).limit(1);
  return s ? toStaff(s) : null;
});

/** Trang đầu tiên của nhân viên: có việc ở bếp → Kitchen Dashboard, không → Vận hành. */
export const homeFor = (s: Staff) => (s.role ? "/admin/kitchen" : "/admin/van-hanh");

/**
 * Dùng trong page admin: chưa đăng nhập → /admin/login; sai quyền → trang đầu của người đó.
 * `roles` (vai trò vận hành) đạt khi có ít nhất một vai trò trùng.
 */
export async function requireStaff(roles?: Role[]): Promise<Staff> {
  const s = await currentStaff();
  if (!s) redirect("/admin/login");
  if (roles && !hasRole(s.roles, roles)) redirect(homeFor(s));
  return s;
}

/** Kitchen Dashboard: cần một vai trò ở bếp (owner · manager · kitchen · shipper). */
export async function requireKitchenStaff(): Promise<Staff & { role: StaffRole }> {
  const s = await requireStaff();
  if (!s.role) redirect("/admin/van-hanh");
  return s as Staff & { role: StaffRole };
}
