"use server";

import * as z from "zod";
import { isHHmm, isISODate, type ISODate } from "@/lib/domain/time";
import { cancelShiftRequestCore, decideShiftCore, requestShiftCore, respondShiftCore } from "@/lib/server/dal/shifts";
import { notifyOps, runOps as run } from "@/lib/server/ops/run";

// Đăng ký / nhường / xin nghỉ ca — nhân viên đề nghị, quản lý duyệt (DAL kiểm quyền).

const id = z.number().int().positive();
const date = z.string().refine(isISODate).transform((v) => v as ISODate);
const hm = z.string().refine(isHHmm);

const Request = z.object({
  kind: z.enum(["claim", "give", "leave"]),
  date,
  start: hm.nullable().optional(),
  end: hm.nullable().optional(),
  targetId: id.nullable().optional(),
  note: z.string().trim().max(200).optional(),
});
export async function requestShift(raw: z.input<typeof Request>) {
  return run(Request, raw, async (i, actor, now) => {
    const res = await requestShiftCore(i, { actor, now });
    if (!res.ok) return res;
    notifyOps(res.telegram);
    return { ok: true as const };
  });
}

const Respond = z.object({ id, accept: z.boolean() });
export async function respondShift(raw: z.input<typeof Respond>) {
  return run(Respond, raw, async (i, actor, now) => {
    const res = await respondShiftCore(i, { actor, now });
    if (!res.ok) return res;
    notifyOps(res.telegram);
    return { ok: true as const };
  });
}

const ById = z.object({ id });
export async function cancelShiftRequest(raw: z.input<typeof ById>) {
  return run(ById, raw, (i, actor, now) => cancelShiftRequestCore(i, { actor, now }));
}

const Decide = z.object({ id, approve: z.boolean() });
export async function decideShift(raw: z.input<typeof Decide>) {
  return run(Decide, raw, (i, actor, now) => decideShiftCore(i, { actor, now }));
}
