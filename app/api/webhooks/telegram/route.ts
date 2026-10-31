import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { serverNow } from "@/lib/server/clock";
import { downloadTelegramFile, telegramApi } from "@/lib/server/notify/telegram";
import { handleTelegramUpdate, TelegramUpdate } from "@/lib/server/ops/telegram-bot";

// Webhook bot vận hành (§17.4). Đăng ký một lần:
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://theheatpizza.vn/api/webhooks/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
// Telegram gửi header X-Telegram-Bot-Api-Secret-Token; khác 2xx thì Telegram gửi lại → xử lý idempotent theo update_id.

function authorized(header: string | null): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  await connection();
  if (!authorized(request.headers.get("x-telegram-bot-api-secret-token"))) return new Response("Unauthorized", { status: 401 });
  const parsed = TelegramUpdate.safeParse(await request.json().catch(() => null));
  // Update lạ (loại chưa hỗ trợ) → 200 để Telegram không gửi lại mãi.
  if (!parsed.success) return Response.json({ ok: true });
  try {
    const res = await handleTelegramUpdate(parsed.data, { api: telegramApi, now: serverNow(), download: downloadTelegramFile });
    console.info(JSON.stringify({ evt: "telegram_update", id: parsed.data.update_id, res }));
    return Response.json({ ok: true });
  } catch (err) {
    console.error(JSON.stringify({ evt: "telegram_update_failed", id: parsed.data.update_id, error: String(err) }));
    return Response.json({ ok: false }, { status: 500 });
  }
}
