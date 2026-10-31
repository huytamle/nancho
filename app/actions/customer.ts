"use server";

import { cookies } from "next/headers";
import * as z from "zod";
import { normalizePhone } from "@/lib/domain/phone";
import type { LookupResult } from "@/lib/order-contract";
import { serverNow } from "@/lib/server/clock";
import { CUSTOMER_COOKIE, verifyRemember } from "@/lib/server/customer-cookie";
import { lookupCustomer as lookup } from "@/lib/server/dal/customers";
import { loadSettings } from "@/lib/server/dal/settings";
import { clientIp, DAY, MIN, rateLimit } from "@/lib/server/rate-limit";

// Nhận diện khách cũ khi gõ SĐT (§7.7). Vượt rate-limit hay lỗi → trả "new": khách vẫn điền tiếp bình thường.

const Input = z.object({ phone: z.string().max(20) });

export async function lookupCustomer(raw: { phone: string }): Promise<LookupResult> {
  const parsed = Input.safeParse(raw);
  const phone = parsed.success ? normalizePhone(parsed.data.phone) : null;
  if (!phone) return { status: "new" };
  const now = serverNow();
  try {
    const ip = await clientIp();
    const allowed = await rateLimit(
      [
        { key: `lookup:ip:${ip}`, limit: 5, windowSec: 10 * MIN },
        { key: `lookup:ip-day:${ip}`, limit: 30, windowSec: DAY },
      ],
      now,
    );
    if (!allowed) return { status: "new" };
    const rememberedId = verifyRemember((await cookies()).get(CUSTOMER_COOKIE)?.value, now);
    const { payment } = await loadSettings();
    return await lookup(phone, { rememberedId, payment, now });
  } catch (err) {
    console.error(JSON.stringify({ evt: "lookup_failed", error: String(err) }));
    return { status: "new" };
  }
}
