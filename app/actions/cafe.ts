"use server";

import { readSheet } from "read-excel-file/node";
import * as z from "zod";
import type { AdminResult } from "@/lib/admin-contract";
import { parsePastedTable, parseSalesSheet, type MatchedLine } from "@/lib/domain/cafe";
import { MAX_AMOUNT } from "@/lib/domain/money-text";
import { isISODate, type ISODate } from "@/lib/domain/time";
import { currentStaff } from "@/lib/server/auth/session";
import { serverNow } from "@/lib/server/clock";
import { importCafeSalesCore, previewCafeSalesCore, saveCafeItemCore } from "@/lib/server/dal/cafe";
import { actorOf, runOps } from "@/lib/server/ops/run";

// Kho café (§17.10, M11): món & định lượng, nhập báo cáo Sapo. zod → phiên → DAL (kiểm quyền) → refresh().
// File Excel đọc bằng `read-excel-file` (MIT, thuần JS, chỉ chạy ở server) — không có giá trị/công thức nào được thực thi.

const name = z.string().trim().min(1).max(80);
const Item = z.object({
  id: z.number().int().positive().optional(),
  name,
  aliases: z.array(z.string().trim().min(1).max(80)).max(8),
  price: z.number().int().min(0).max(MAX_AMOUNT),
  isActive: z.boolean(),
  lines: z.array(z.object({ ingredientId: z.string().trim().min(1).max(40), qty: z.number().positive().max(100_000) })).max(20),
});
export async function saveCafeItem(raw: z.input<typeof Item>): Promise<AdminResult<{ id: number }>> {
  return runOps(Item, raw, (i, actor, now) => saveCafeItemCore(i, { actor, now }));
}

const FILE_MAX = 2 * 1024 * 1024;
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type PreviewResult = AdminResult<{ date: ISODate; already: boolean; lines: (MatchedLine & { item: string | null })[] }> | { ok: false; reason: "no_header" | "empty" | "bad_file" };

/** Xem trước: file .xlsx/.csv xuất từ Sapo, hoặc bảng dán từ Excel. Không ghi gì. */
export async function previewCafeSales(form: FormData): Promise<PreviewResult> {
  const date = form.get("date");
  const file = form.get("file");
  const text = form.get("text");
  if (typeof date !== "string" || !isISODate(date)) return { ok: false, reason: "invalid" };
  try {
    const staff = await currentStaff();
    if (!staff) return { ok: false, reason: "forbidden" };
    let rows: unknown[][];
    if (file instanceof File && file.size > 0) {
      if (file.size > FILE_MAX) return { ok: false, reason: "invalid" };
      const bytes = Buffer.from(await file.arrayBuffer());
      const isXlsx = file.type === XLSX || /\.xlsx$/i.test(file.name);
      try {
        rows = isXlsx ? await readSheet(bytes) : parsePastedTable(bytes.toString("utf8"));
      } catch {
        return { ok: false, reason: "bad_file" };
      }
    } else if (typeof text === "string" && text.trim() && text.length <= 200_000) rows = parsePastedTable(text);
    else return { ok: false, reason: "invalid" };
    const parsed = parseSalesSheet(rows as Parameters<typeof parseSalesSheet>[0]);
    if (!parsed.ok) return parsed;
    const res = await previewCafeSalesCore({ date, lines: parsed.lines.slice(0, 300) }, { actor: actorOf(staff), now: serverNow() });
    return res.ok ? { ok: true, date: res.date, already: res.already, lines: res.lines } : res;
  } catch (err) {
    console.error(JSON.stringify({ evt: "cafe_preview_failed", error: String(err) }));
    return { ok: false, reason: "server_error" };
  }
}

const Import = z.object({
  date: z.string().refine(isISODate),
  lines: z
    .array(z.object({ name: z.string().trim().min(1).max(120), qty: z.number().positive().max(100_000), revenue: z.number().int().min(0).max(MAX_AMOUNT).nullable() }))
    .min(1)
    .max(300),
});
export async function importCafeSales(raw: z.input<typeof Import>): Promise<AdminResult<{ matched: number; unmatched: string[] }>> {
  return runOps(Import, raw, async (i, actor, now) => {
    const res = await importCafeSalesCore({ date: i.date as ISODate, lines: i.lines }, { actor, now });
    return res.ok ? { ok: true, matched: res.matched, unmatched: res.unmatched } : res;
  });
}
