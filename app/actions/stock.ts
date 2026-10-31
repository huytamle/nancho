"use server";

import * as z from "zod";
import type { AdminResult } from "@/lib/admin-contract";
import { EXPENSE_SOURCES } from "@/lib/domain/expense-command";
import { MAX_AMOUNT } from "@/lib/domain/money-text";
import { ROLES } from "@/lib/domain/roles";
import { COUNT_CLASSES, STOCK_LEVELS, WASTE_REASONS } from "@/lib/domain/stock";
import {
  cancelBillCore,
  countStockCore,
  payDebtCore,
  produceCore,
  receiveStockCore,
  saveStockItemCore,
  wasteCore,
  type CountResultLine,
} from "@/lib/server/dal/stock";
import { notifyOps, runOps } from "@/lib/server/ops/run";

// Mutation tab Kho (§17.8, M10): zod → phiên → DAL (kiểm quyền nghiệp vụ) → refresh(). Telegram gửi trong after().

const ingredientId = z.string().trim().min(1).max(40);
const qty = z.number().positive().max(10_000_000);
const money = z.number().int().min(1).max(MAX_AMOUNT);

const Receive = z.object({
  ingredientId,
  qty,
  amount: money.nullable(),
  pay: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("expense"), source: z.enum(EXPENSE_SOURCES) }),
    z.object({ kind: z.literal("debt"), supplier: z.string().trim().min(1).max(60) }),
  ]),
  photo: z.uuid().nullable().optional(),
});
export async function receiveStock(raw: z.input<typeof Receive>): Promise<AdminResult<{ avgCost: number }>> {
  return runOps(Receive, raw, async (i, actor, now) => {
    const res = await receiveStockCore(i, { actor, now });
    return res.ok ? { ok: true, avgCost: res.avgCost } : res;
  });
}

const Produce = z.object({ outputId: ingredientId, runs: z.number().int().min(1).max(50) });
export async function produceStock(raw: z.input<typeof Produce>): Promise<AdminResult<{ qty: number }>> {
  return runOps(Produce, raw, async (i, actor, now) => {
    const res = await produceCore(i, { actor, now });
    return res.ok ? { ok: true, qty: res.qty } : res;
  });
}

const Waste = z.object({ ingredientId, qty, reason: z.enum(WASTE_REASONS), note: z.string().trim().max(200).optional() });
export async function wasteStock(raw: z.input<typeof Waste>): Promise<AdminResult> {
  return runOps(Waste, raw, async (i, actor, now) => {
    const res = await wasteCore(i, { actor, now });
    return res.ok ? { ok: true } : res;
  });
}

const Count = z.object({
  kind: z.enum(["weekly", "quick"]),
  lines: z.array(z.object({ ingredientId, counted: z.number().min(0).max(10_000_000) })).min(1).max(80),
});
export async function countStock(raw: z.input<typeof Count>): Promise<AdminResult<{ lines: CountResultLine[]; value?: number }>> {
  return runOps(Count, raw, async (i, actor, now) => {
    const res = await countStockCore(i, { actor, now });
    if (!res.ok) return res;
    notifyOps(res.telegram);
    return { ok: true, lines: res.lines, ...(res.value !== undefined ? { value: res.value } : {}) };
  });
}

const PayDebt = z.object({ supplier: z.string().trim().min(1).max(60), amount: money, source: z.enum(EXPENSE_SOURCES) });
export async function payDebt(raw: z.input<typeof PayDebt>): Promise<AdminResult<{ closed: number; remaining: number; leftover: number }>> {
  return runOps(PayDebt, raw, async (i, actor, now) => {
    const res = await payDebtCore(i, { actor, now });
    return res.ok ? { ok: true, closed: res.closed, remaining: res.remaining, leftover: res.leftover } : res;
  });
}

const BillId = z.object({ id: z.number().int().positive() });
export async function cancelBill(raw: z.input<typeof BillId>): Promise<AdminResult> {
  return runOps(BillId, raw, (i, actor, now) => cancelBillCore(i.id, { actor, now }));
}

const nullablePositive = z.number().positive().max(10_000_000).nullable();
const Item = z
  .object({
    id: ingredientId,
    level: z.enum(STOCK_LEVELS),
    trackStock: z.boolean(),
    purchaseUnit: z.string().trim().min(1).max(20).nullable(),
    purchaseFactor: nullablePositive,
    shelfLifeHours: z.number().int().min(1).max(24 * 365).nullable(),
    parLevel: z.number().min(0).max(10_000_000).nullable(),
    aliases: z.array(z.string().trim().min(1).max(40)).max(12),
    countClass: z.enum(COUNT_CLASSES),
    countRoles: z.array(z.enum(ROLES)).min(1).max(6),
    countTolerancePct: z.number().int().min(0).max(100),
  })
  .refine((v) => (v.purchaseUnit === null) === (v.purchaseFactor === null));
export async function saveStockItem(raw: z.input<typeof Item>): Promise<AdminResult> {
  return runOps(Item, raw, (i, actor, now) => saveStockItemCore(i, { actor, now }));
}
