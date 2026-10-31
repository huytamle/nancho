import { connection } from "next/server";
import { serverNow } from "@/lib/server/clock";
import { cronAuthorized } from "@/lib/server/cron-auth";
import { runDaily } from "@/lib/server/dal/kitchen";
import { runPayrollCron } from "@/lib/server/dal/payroll";
import { runFeedbackDigest, runMarketReminder } from "@/lib/server/dal/reports";
import { runStockCron } from "@/lib/server/dal/stock";
import { summarizeFeedback } from "@/lib/server/notify/ai";
import { sendTelegram } from "@/lib/server/notify/telegram";

// Cron hằng ngày (§5.4, §17.11): sinh mẻ cho N ngày tới, dọn rate_limits cũ, gửi Bảng Tổng Hợp sau giờ chốt (một lần);
// gắn cờ quên ra ca; kho dưới mức/sắp hết hạn (một lần/ngày); ngày 1 bảng công nháp, ngày 3 nhắc xác nhận, ngày trả lương nhắc trả (mỗi việc một lần);
// M11: nhắc đi chợ trước ngày bán, tóm tắt góp ý tuần (Thứ Hai).

export async function GET(request: Request) {
  await connection();
  if (!cronAuthorized(request.headers.get("authorization"))) return new Response("Unauthorized", { status: 401 });
  const now = serverNow();
  const result = await runDaily(now, sendTelegram);
  const payroll = await runPayrollCron(now, sendTelegram);
  const stock = await runStockCron(now, sendTelegram);
  const market = await runMarketReminder(now, sendTelegram);
  const digest = await runFeedbackDigest(now, sendTelegram, summarizeFeedback);
  console.info(JSON.stringify({ evt: "cron_daily", ...result, ...payroll, ...stock, ...market, ...digest }));
  return Response.json({ created: result.created, summarySent: result.summarySent });
}
