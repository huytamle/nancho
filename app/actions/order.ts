"use server";

import { cookies } from "next/headers";
import { after } from "next/server";
import * as z from "zod";
import { normalizePhone } from "@/lib/domain/phone";
import { cleanSource, SRC_COOKIE } from "@/lib/source";
import type { CancelResult, PlaceOrderInput, PlaceOrderResult } from "@/lib/order-contract";
import { currentMember } from "@/lib/server/auth/clerk";
import { serverNow } from "@/lib/server/clock";
import { CUSTOMER_COOKIE, rememberCookieOptions, signRemember } from "@/lib/server/customer-cookie";
import { getCatalog } from "@/lib/server/dal/catalog";
import { cancelOrderByTokenCore, placeOrderCore } from "@/lib/server/dal/orders";
import { sendTelegram } from "@/lib/server/notify/telegram";
import { fieldErrors, OrderInput } from "@/lib/server/order-input";
import { clientIp, MIN, rateLimit } from "@/lib/server/rate-limit";

// Đặt đơn thật (§8.1): parse → honeypot/thời gian điền → rate-limit → nghiệp vụ trong DAL (giữ suất,
// idempotency, lưu khách) → cookie "ghi nhớ" → Telegram trong after() → DTO tối giản.

export async function placeOrder(raw: PlaceOrderInput): Promise<PlaceOrderResult> {
  const parsed = OrderInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid", fieldErrors: fieldErrors(parsed.error) };
  const input = parsed.data;

  // Bot: điền honeypot hoặc gửi trong < 3 giây.
  if (input.website || Date.now() - input.startedAt < 3000) return { ok: false, reason: "invalid", fieldErrors: {} };

  const phone = normalizePhone(input.customer.phone);
  const f = input.fulfillment;
  if (!phone) return { ok: false, reason: "invalid", fieldErrors: { phone: "phoneInvalid" } };
  if (f.type === "delivery" && !f.addressText && !f.savedAddressToken) {
    return { ok: false, reason: "invalid", fieldErrors: { address: "addressShort" } };
  }

  const now = serverNow();
  try {
    const ip = await clientIp();
    const allowed = await rateLimit(
      [
        { key: `order:ip:${ip}`, limit: 5, windowSec: 10 * MIN },
        { key: `order:phone:${phone}`, limit: 3, windowSec: 10 * MIN },
      ],
      now,
    );
    if (!allowed) return { ok: false, reason: "rate_limited" };

    const jar = await cookies();
    const source = cleanSource(jar.get(SRC_COOKIE)?.value);
    const member = await currentMember();
    const { result, created } = await placeOrderCore(input, phone, { now, catalog: await getCatalog(), source, member });
    if (!created || !result.ok) return result;

    if (input.customer.remember) jar.set(CUSTOMER_COOKIE, signRemember(created.customerId, now), rememberCookieOptions);
    else jar.delete(CUSTOMER_COOKIE);

    console.info(JSON.stringify({ evt: "order_placed", code: result.code, phone: maskPhone(phone), total: result.total, status: result.status }));
    after(async () => {
      for (const text of created.telegram) await sendTelegram(text);
    });
    return result;
  } catch (err) {
    console.error(JSON.stringify({ evt: "order_failed", phone: maskPhone(phone), error: String(err) }));
    return { ok: false, reason: "server_error" };
  }
}

/** Log không chứa SĐT đầy đủ (§13.4): "0912345678" → "091****678". */
const maskPhone = (p: string) => `${p.slice(0, 3)}****${p.slice(7)}`;

const CancelInput = z.object({ token: z.string().regex(/^[\w-]{22}$/), reason: z.string().trim().max(200).optional() });

export async function cancelOrderByToken(raw: { token: string; reason?: string }): Promise<CancelResult> {
  const parsed = CancelInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "not_found" };
  const now = serverNow();
  try {
    const allowed = await rateLimit([{ key: `cancel:ip:${await clientIp()}`, limit: 10, windowSec: 10 * MIN }], now);
    if (!allowed) return { ok: false, reason: "rate_limited" };
    const res = await cancelOrderByTokenCore(parsed.data.token, { now, reason: parsed.data.reason });
    if (!res.ok) return res;
    if (res.telegram) after(() => sendTelegram(res.telegram!).then(() => undefined));
    return { ok: true };
  } catch (err) {
    console.error(JSON.stringify({ evt: "cancel_failed", error: String(err) }));
    return { ok: false, reason: "not_found" };
  }
}
