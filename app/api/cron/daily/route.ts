import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { serverNow } from "@/lib/server/clock";
import { runDaily } from "@/lib/server/dal/kitchen";
import { runPayrollCron } from "@/lib/server/dal/payroll";
import { runStockCron } from "@/lib/server/dal/stock";
import { sendTelegram } from "@/lib/server/notify/telegram";

// Cron hằng ngày (§5.4, §17.11): sinh mẻ cho N ngày tới, dọn rate_limits cũ, gửi Bảng Tổng Hợp sau giờ chốt (một lần);
// gắn cờ quên ra ca; kho dưới mức/sắp hết hạn (một lần/ngày); ngày 1 bảng công nháp, ngày 3 nhắc xác nhận, ngày trả lương nhắc trả (mỗi việc một lần).
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
  const now = serverNow();
  const result = await runDaily(now, sendTelegram);
  const payroll = await runPayrollCron(now, sendTelegram);
  const stock = await runStockCron(now, sendTelegram);
  console.info(JSON.stringify({ evt: "cron_daily", ...result, ...payroll, ...stock }));
  return Response.json({ created: result.created, summarySent: result.summarySent });
}
