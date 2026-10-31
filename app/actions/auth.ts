"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import type { LoginResult } from "@/lib/admin-contract";
import { createSession, deleteSession, homeFor } from "@/lib/server/auth/session";
import { serverNow } from "@/lib/server/clock";
import { PIN_RE, verifyStaffPin } from "@/lib/server/dal/staff";
import { clientIp, MIN, rateLimit } from "@/lib/server/rate-limit";

// Đăng nhập nhân viên bằng tên + PIN 6 số (§10.8). Rate-limit 5 lần/15 phút/IP (§8.2).

const Input = z.object({ staffId: z.number().int().positive(), pin: z.string().regex(PIN_RE) });

export async function login(raw: { staffId: number; pin: string }): Promise<LoginResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  let home: string;
  try {
    const allowed = await rateLimit([{ key: `login:ip:${await clientIp()}`, limit: 5, windowSec: 15 * MIN }], serverNow());
    if (!allowed) return { ok: false, reason: "rate_limited" };
    const staff = await verifyStaffPin(parsed.data.staffId, parsed.data.pin);
    if (!staff) return { ok: false, reason: "wrong_pin" };
    await createSession(staff.id);
    home = homeFor(staff);
    console.info(JSON.stringify({ evt: "staff_login", staff: staff.id }));
  } catch (err) {
    console.error(JSON.stringify({ evt: "login_failed", error: String(err) }));
    return { ok: false, reason: "server_error" };
  }
  // redirect() ném lỗi điều hướng → gọi ngoài try.
  redirect(home);
}

export async function logout() {
  await deleteSession();
  redirect("/admin/login");
}
