"use server";

import * as z from "zod";
import { isISODate, type ISODate } from "@/lib/domain/time";
import { notifyOps, runOps } from "@/lib/server/ops/run";
import { cancelWithRefundCore, pauseOvenCore, recordHandoverCore, resumeOvenCore } from "@/lib/server/dal/sale-day";

// Gói "Ngày bán" (§18): khoá/mở lò, huỷ + ghi hoàn tiền, bàn giao COD. Quyền (owner · manager · kitchen) kiểm ở DAL.

const Pause = z.object({ reason: z.string().trim().max(80), tomorrow: z.boolean() });

export async function pauseOven(raw: z.input<typeof Pause>) {
  return runOps(Pause, raw, async (i, actor, now) => {
    const res = await pauseOvenCore(i, { actor, now });
    if (!res.ok) return res;
    notifyOps(res.telegram);
    return { ok: true as const, affected: res.affected.length };
  });
}

export async function resumeOven(raw: object = {}) {
  return runOps(z.object({}), raw, async (_i, actor, now) => {
    const res = await resumeOvenCore({ actor, now });
    if (!res.ok) return res;
    notifyOps(res.telegram);
    return { ok: true as const };
  });
}

const Cancel = z.object({
  orderId: z.uuid(),
  refund: z
    .object({ amount: z.number().int().positive().max(100_000_000), method: z.enum(["transfer", "cash"]), note: z.string().trim().max(120).optional() })
    .nullable(),
});

export async function cancelWithRefund(raw: z.input<typeof Cancel>) {
  return runOps(Cancel, raw, async (i, actor, now) => {
    const res = await cancelWithRefundCore(i.orderId, i.refund, { actor, now });
    if (!res.ok) return res;
    notifyOps(res.telegram);
    return { ok: true as const };
  });
}

const Handover = z.object({
  date: z.string().refine(isISODate),
  shipperId: z.number().int().positive(),
  orderIds: z.array(z.uuid()).min(1).max(100),
  received: z.number().int().min(0).max(100_000_000),
  note: z.string().trim().max(200).optional(),
});

export async function recordHandover(raw: z.input<typeof Handover>) {
  return runOps(Handover, raw, async (i, actor, now) => {
    const res = await recordHandoverCore({ ...i, date: i.date as ISODate }, { actor, now });
    if (!res.ok) return res;
    notifyOps(res.telegram);
    return { ok: true as const, expected: res.expected, received: res.received };
  });
}
