import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { and, asc, eq } from "drizzle-orm";
import type { Role } from "@/lib/domain/roles";
import { toStaff, type Staff } from "@/lib/server/auth/session";
import { getDb, type Executor } from "@/lib/server/db/client";
import { staff } from "@/lib/server/db/schema";

// Nhân viên & PIN 6 số (§10.8). PIN chỉ lưu dạng băm argon2id.

export const PIN_RE = /^\d{6}$/;

/** Danh sách cho màn chọn tên — không có PIN, không có quyền. */
export async function listStaffNames(db: Executor = getDb()): Promise<{ id: number; name: string }[]> {
  return db.select({ id: staff.id, name: staff.name }).from(staff).where(and(eq(staff.isActive, true), eq(staff.pending, false))).orderBy(asc(staff.name));
}

export async function verifyStaffPin(staffId: number, pin: string, db: Executor = getDb()): Promise<Staff | null> {
  const [s] = await db.select().from(staff).where(eq(staff.id, staffId)).limit(1);
  // Không có nhân viên vẫn băm một lần để thời gian phản hồi không lộ id nào tồn tại.
  if (!s || !s.isActive || s.pending) {
    await hash(pin);
    return null;
  }
  return (await verify(s.pinHash, pin)) ? toStaff(s) : null;
}

/** Thêm nhân viên hoặc đặt lại PIN/quyền theo tên (script `npm run staff`, e2e). */
export async function upsertStaff(input: { name: string; roles: Role[]; pin: string }, db: Executor = getDb()) {
  if (!PIN_RE.test(input.pin)) throw new Error("PIN phải gồm đúng 6 chữ số");
  const pinHash = await hash(input.pin);
  const [row] = await db
    .insert(staff)
    .values({ name: input.name.trim(), roles: input.roles, pinHash })
    .onConflictDoUpdate({ target: staff.name, set: { roles: input.roles, pinHash, isActive: true } })
    .returning({ id: staff.id });
  return row.id;
}
