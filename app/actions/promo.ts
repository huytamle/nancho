"use server";

import { refresh } from "next/cache";
import * as z from "zod";
import { normalizeCode } from "@/lib/domain/promo";
import { normalizePhone } from "@/lib/domain/phone";
import type { PromoPreview } from "@/lib/order-contract";
import { currentMember } from "@/lib/server/auth/clerk";
import { serverNow } from "@/lib/server/clock";
import { redeemPointsCore, resolvePromo, usableVouchers } from "@/lib/server/dal/promo";
import { clientIp, MIN, rateLimit } from "@/lib/server/rate-limit";

// Mã ưu đãi & điểm (§19, M12). `checkPromo` chỉ xem trước — giá & mã được tính lại trong placeOrder.

const Check = z.object({ code: z.string().trim().min(1).max(24), phone: z.string().max(20), subtotal: z.number().int().min(0).max(50_000_000) });

export async function checkPromo(raw: z.input<typeof Check>): Promise<PromoPreview> {
  const parsed = Check.safeParse(raw);
  const phone = parsed.success ? normalizePhone(parsed.data.phone) : null;
  if (!parsed.success) return { ok: false, reason: "not_found" };
  const now = serverNow();
  try {
    // Chặn dò mã: 10 lần / 10 phút / IP.
    if (!(await rateLimit([{ key: `promo:ip:${await clientIp()}`, limit: 10, windowSec: 10 * MIN }], now))) return { ok: false, reason: "rate_limited" };
    const member = await currentMember();
    const r = await resolvePromo(parsed.data.code, { phone: phone ?? "", member, subtotal: parsed.data.subtotal, now });
    return r.ok ? { ok: true, amount: r.amount, code: normalizeCode(parsed.data.code) } : r;
  } catch (err) {
    console.error(JSON.stringify({ evt: "promo_check_failed", error: String(err) }));
    return { ok: false, reason: "not_found" };
  }
}

export type WalletVoucher = { code: string; amount: number; minSubtotal: number; expiresAt: string; kind: string };

/** Ví mã của khách đăng nhập — chip một chạm ở bước chốt đơn. Khách vãng lai: rỗng. */
export async function myVouchers(): Promise<{ signedIn: boolean; vouchers: WalletVoucher[] }> {
  try {
    const member = await currentMember();
    if (!member) return { signedIn: false, vouchers: [] };
    const rows = await usableVouchers(member.id, serverNow());
    return { signedIn: true, vouchers: rows.map((v) => ({ ...v, expiresAt: v.expiresAt.toISOString() })) };
  } catch {
    return { signedIn: false, vouchers: [] };
  }
}

export async function redeemPoints(): Promise<{ ok: true; code: string } | { ok: false; reason: "not_enough" | "signed_out" | "server_error" }> {
  try {
    const member = await currentMember();
    if (!member) return { ok: false, reason: "signed_out" };
    const res = await redeemPointsCore(member.id, serverNow());
    if (res.ok) refresh();
    return res;
  } catch (err) {
    console.error(JSON.stringify({ evt: "redeem_failed", error: String(err) }));
    return { ok: false, reason: "server_error" };
  }
}
