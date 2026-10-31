import { connection } from "next/server";
import { serverNow } from "@/lib/server/clock";
import { cronAuthorized } from "@/lib/server/cron-auth";
import { runEveningReport } from "@/lib/server/dal/reports";
import { sendTelegram } from "@/lib/server/notify/telegram";

// Cron 20:15 giờ VN (13:15 UTC) T6–CN (§17.10, M11): báo cáo tối pizza — chỉ gửi ngày có bán, một lần mỗi ngày.

export async function GET(request: Request) {
  await connection();
  if (!cronAuthorized(request.headers.get("authorization"))) return new Response("Unauthorized", { status: 401 });
  const res = await runEveningReport(serverNow(), sendTelegram);
  console.info(JSON.stringify({ evt: "cron_evening", ...res }));
  return Response.json(res);
}
