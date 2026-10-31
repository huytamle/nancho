import "server-only";
import { timingSafeEqual } from "node:crypto";

// Vercel Cron tự gửi `Authorization: Bearer ${CRON_SECRET}`; tự host thì gọi bằng curl với cùng header.
export function cronAuthorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
