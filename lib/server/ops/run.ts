import "server-only";
import { refresh } from "next/cache";
import { after } from "next/server";
import type * as z from "zod";
import type { AdminError, AdminResult } from "@/lib/admin-contract";
import { currentStaff, type Staff } from "@/lib/server/auth/session";
import { serverNow } from "@/lib/server/clock";
import type { OpsActor } from "@/lib/server/dal/ops";
import { sendTelegram } from "@/lib/server/notify/telegram";

// Khung chung của Server Action màn Vận hành (§17): zod → phiên → DAL (kiểm quyền nghiệp vụ) → refresh().

type Fail = { ok: false; reason: AdminError };

export const actorOf = (s: Staff): OpsActor => ({ id: s.id, name: s.name, roles: s.roles });

export async function runOps<I, R extends AdminResult>(
  schema: z.ZodType<I>,
  raw: unknown,
  fn: (input: I, actor: OpsActor, now: Date) => Promise<R | Fail>,
): Promise<R | Fail> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const staff = await currentStaff();
    if (!staff) return { ok: false, reason: "forbidden" };
    const res = await fn(parsed.data, actorOf(staff), serverNow());
    if (res.ok) refresh();
    return res;
  } catch (err) {
    console.error(JSON.stringify({ evt: "ops_failed", error: String(err) }));
    return { ok: false, reason: "server_error" };
  }
}

/** Gửi Telegram sau khi trả lời (không làm chậm thao tác). */
export const notifyOps = (text: string | null) => {
  if (text) after(() => sendTelegram(text).then(() => undefined));
};
