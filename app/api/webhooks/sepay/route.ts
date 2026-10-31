import { timingSafeEqual } from "node:crypto";
import { after, connection } from "next/server";
import { SepayPayload, sepayAuthHeader } from "@/lib/payments";
import { serverNow } from "@/lib/server/clock";
import { sendTelegram } from "@/lib/server/notify/telegram";
import { recordSepayCore } from "@/lib/server/payments/sepay";

// Webhook SePay (§11.2). SePay gửi `Authorization: Apikey <SEPAY_WEBHOOK_KEY>`; thành công phải trả 200 + {success:true},
// nếu không SePay gửi lại → xử lý idempotent theo id giao dịch. Lỗi DB trả 500 để SePay thử lại.

function authorized(header: string | null): boolean {
  const key = process.env.SEPAY_WEBHOOK_KEY;
  if (!key || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(sepayAuthHeader(key));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  await connection();
  if (!authorized(request.headers.get("authorization"))) {
    return Response.json({ success: false, message: "unauthorized" }, { status: 401 });
  }
  const parsed = SepayPayload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ success: false, message: "invalid payload" }, { status: 400 });

  try {
    const res = await recordSepayCore(parsed.data, { now: serverNow() });
    console.info(JSON.stringify({ evt: "sepay", txn: parsed.data.id, status: res.status }));
    if ("telegram" in res) after(() => sendTelegram(res.telegram).then(() => undefined));
    return Response.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error(JSON.stringify({ evt: "sepay_failed", txn: parsed.data.id, error: String(err) }));
    return Response.json({ success: false }, { status: 500 });
  }
}
