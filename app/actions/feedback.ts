"use server";

import { after } from "next/server";
import * as z from "zod";
import { COMMENT_MAX } from "@/lib/domain/feedback";
import { serverNow } from "@/lib/server/clock";
import { submitFeedbackCore } from "@/lib/server/dal/feedback";
import { sendTelegram } from "@/lib/server/notify/telegram";
import { clientIp, MIN, rateLimit } from "@/lib/server/rate-limit";

// Chấm điểm khẩu vị (§18.5): không cần đăng nhập — token đơn là chìa khoá; rate-limit theo IP + đơn.

const Input = z.object({
  token: z.string().regex(/^[\w-]{22}$/),
  ratings: z.record(z.string().max(40), z.number().int().min(1).max(3)),
  tags: z.record(z.string().max(40), z.array(z.string().max(40)).max(6)),
  comment: z.string().max(COMMENT_MAX),
});

export type FeedbackResult = { ok: true } | { ok: false; reason: "not_found" | "closed" | "locked" | "invalid" | "rate_limited" | "server_error" };

export async function submitFeedback(raw: z.input<typeof Input>): Promise<FeedbackResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const now = serverNow();
  try {
    const ip = await clientIp();
    const allowed = await rateLimit(
      [
        { key: `feedback:ip:${ip}`, limit: 10, windowSec: 10 * MIN },
        { key: `feedback:order:${parsed.data.token}`, limit: 5, windowSec: 60 * MIN },
      ],
      now,
    );
    if (!allowed) return { ok: false, reason: "rate_limited" };
    const { token, ...input } = parsed.data;
    const res = await submitFeedbackCore(token, input, { now });
    if (!res.ok) return res;
    after(() => sendTelegram(res.telegram).then(() => undefined));
    return { ok: true };
  } catch (err) {
    console.error(JSON.stringify({ evt: "feedback_failed", error: String(err) }));
    return { ok: false, reason: "server_error" };
  }
}
