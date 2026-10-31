import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { asc, eq } from "drizzle-orm";
import type { StaffRole } from "@/lib/domain/order-status";
import type { Staff } from "@/lib/server/auth/session";
import { getDb, type Executor } from "@/lib/server/db/client";
import { staff } from "@/lib/server/db/schema";

// Nhân viên & PIN 6 số (§10.8). PIN chỉ lưu dạng băm argon2id.

export const PIN_RE = /^\d{6}$/;

/** Danh sách cho màn chọn tên — không có PIN, không có quyền. */
export async function listStaffNames(db: Executor = getDb()): Promise<{ id: number; name: string }[]> {
  return db.select({ id: staff.id, name: staff.name }).from(staff).where(eq(staff.isActive, true)).orderBy(asc(staff.name));
}

export async function verifyStaffPin(staffId: number, pin: string, db: Executor = getDb()): Promise<Staff | null> {
  const [s] = await db.select().from(staff).where(eq(staff.id, staffId)).limit(1);
  // Không có nhân viên vẫn băm một lần để thời gian phản hồi không lộ id nào tồn tại.
  if (!s || !s.isActive) {
    await hash(pin);
    return null;
  }
  return (await verify(s.pinHash, pin)) ? { id: s.id, name: s.name, role: s.role } : null;
}

/** Thêm nhân viên hoặc đặt lại PIN/quyền theo tên (script `npm run staff`, e2e). */
export async function upsertStaff(input: { name: string; role: StaffRole; pin: string }, db: Executor = getDb()) {
  if (!PIN_RE.test(input.pin)) throw new Error("PIN phải gồm đúng 6 chữ số");
  const pinHash = await hash(input.pin);
  const [row] = await db
    .insert(staff)
    .values({ name: input.name.trim(), role: input.role, pinHash })
    .onConflictDoUpdate({ target: staff.name, set: { role: input.role, pinHash, isActive: true } })
    .returning({ id: staff.id });
  return row.id;
}
