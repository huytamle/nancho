import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { serverNow } from "@/lib/server/clock";
import { runDaily } from "@/lib/server/dal/kitchen";
import { sendTelegram } from "@/lib/server/notify/telegram";

// Cron hằng ngày (§5.4): sinh mẻ cho N ngày tới, dọn rate_limits cũ, gửi Bảng Tổng Hợp sau giờ chốt (một lần).
// Vercel Cron tự gửi `Authorization: Bearer ${CRON_SECRET}`; tự host thì gọi bằng curl với cùng header.

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  await connection();
  if (!authorized(request.headers.get("authorization"))) return new Response("Unauthorized", { status: 401 });
  const result = await runDaily(serverNow(), sendTelegram);
  console.info(JSON.stringify({ evt: "cron_daily", ...result }));
  return Response.json({ created: result.created, summarySent: result.summarySent });
}
