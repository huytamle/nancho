import "server-only";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { guessCategory, parseQuantity, type ExpenseCategory, type ExpenseSource } from "@/lib/domain/expense-command";
import { hasRole, type Role } from "@/lib/domain/roles";
import {
  allocatePayment,
  countLine,
  expiryOf,
  fifoLots,
  margin,
  matchIngredient,
  matchSupplier,
  production,
  productCost,
  productionUnitCost,
  quickCountItems,
  roundQty,
  saleUsage,
  splitBillCost,
  stockFlags,
  toBaseQty,
  unitCostResolver,
  valueOf,
  weightedAverage,
  type BillLine,
  type CountLine,
  type Formula,
  type MoveKind,
  type StockFlag,
  type StockItem,
  type StockLevel,
  type WasteReason,
} from "@/lib/domain/stock";
import { vnDateOf, vnInstant } from "@/lib/domain/time";
import type { Product } from "@/lib/domain/types";
import { stockAlertText, stockCountAlertText, type DebtRow, type StockAlert } from "@/lib/stock-text";
import { getDb, type Db, type Executor } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { canSpend, fail, insertExpense, logEvent, monthRange, monthOf, type OpsActor, type OpsCtx, type OpsFail } from "@/lib/server/dal/ops";

// Kho 2 mức & công nợ NCC (§17.8, M10). Server Action/webhook lo zod + phiên; quyền nghiệp vụ kiểm ở đây.
// Tồn = Σ stock_moves.qty. Dòng nhập (purchase/produce_in) cập nhật giá vốn bình quân gia quyền dưới khoá dòng
// nguyên liệu → nhập song song không lệch bình quân. Trừ kho khi bán: mỗi đơn một lần (index một phần).

type Ctx = OpsCtx;
type Fail = OpsFail;

/** Ai làm việc kho (§17.2): owner/manager tất cả; bếp & pha chế: sản xuất, huỷ, kiểm kê. */
export const STOCK_ROLES: Role[] = ["owner", "manager", "kitchen", "barista"];
export const canStock = (a: { roles: Role[] }) => hasRole(a.roles, STOCK_ROLES);

type ItemRow = typeof t.ingredients.$inferSelect;

export const toItem = (r: ItemRow): StockItem => ({
  id: r.id,
  label: r.label,
  unit: r.unit,
  level: r.level,
  trackStock: r.trackStock,
  purchaseUnit: r.purchaseUnit,
  purchaseFactor: r.purchaseFactor,
  avgCost: r.avgCost,
  shelfLifeHours: r.shelfLifeHours,
  parLevel: r.parLevel,
  aliases: r.aliases,
  countClass: r.countClass,
  countRoles: r.countRoles,
  countTolerancePct: r.countTolerancePct,
});

/** Tồn theo nguyên liệu (Σ qty). */
export async function onHandMap(db: Executor, ids?: string[]): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: t.stockMoves.ingredientId, qty: sql<number>`sum(${t.stockMoves.qty})::float8` })
    .from(t.stockMoves)
    .where(ids ? inArray(t.stockMoves.ingredientId, ids) : undefined)
    .groupBy(t.stockMoves.ingredientId);
  return new Map(rows.map((r) => [r.id, roundQty(r.qty)]));
}

export type NewMove = {
  ingredientId: string;
  qty: number;
  kind: MoveKind;
  /** Chỉ dòng nhập: đơn giá đ/đơn vị gốc; null = theo giá vốn hiện tại (không đổi bình quân). */
  unitCost?: number | null;
  refType: NonNullable<(typeof t.stockMoves.$inferInsert)["refType"]>;
  refId: string;
  reason?: WasteReason | null;
  note?: string | null;
  expiresAt?: Date | null;
};

/**
 * Ghi các dòng kho trong transaction `tx`: khoá dòng nguyên liệu (thứ tự id), dòng nhập cập nhật bình quân gia
 * quyền, dòng xuất lấy giá vốn hiện tại. Dòng trùng (đơn đã trừ, chứng từ đã nhập) bị bỏ qua. Trả số dòng đã ghi.
 */
export async function postMoves(tx: Executor, moves: NewMove[], by: number | null, now: Date): Promise<number> {
  const real = moves.filter((m) => roundQty(m.qty) !== 0);
  if (real.length === 0) return 0;
  const ids = [...new Set(real.map((m) => m.ingredientId))].sort();
  const items = new Map(
    (await tx.select().from(t.ingredients).where(inArray(t.ingredients.id, ids)).orderBy(asc(t.ingredients.id)).for("update")).map((r) => [r.id, r]),
  );
  const stock = await onHandMap(tx, ids);
  let written = 0;
  for (const m of real) {
    const item = items.get(m.ingredientId);
    if (!item) continue;
    const qty = roundQty(m.qty);
    const isIn = m.kind === "purchase" || m.kind === "produce_in";
    const unitCost = isIn && m.unitCost != null ? m.unitCost : item.avgCost;
    const [row] = await tx
      .insert(t.stockMoves)
      .values({
        ingredientId: item.id,
        qty,
        kind: m.kind,
        unitCost,
        refType: m.refType,
        refId: m.refId,
        reason: m.reason ?? null,
        note: m.note ?? null,
        expiresAt: m.expiresAt ?? null,
        createdBy: by,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: t.stockMoves.id });
    if (!row) continue;
    written++;
    const before = stock.get(item.id) ?? 0;
    if (isIn) {
      const avg = weightedAverage(before, item.avgCost, qty, unitCost);
      if (avg !== item.avgCost) {
        await tx.update(t.ingredients).set({ avgCost: avg }).where(eq(t.ingredients.id, item.id));
        item.avgCost = avg;
      }
    }
    stock.set(item.id, roundQty(before + qty));
  }
  return written;
}

async function loadItems(db: Executor): Promise<StockItem[]> {
  return (await db.select().from(t.ingredients).orderBy(asc(t.ingredients.sort), asc(t.ingredients.id))).map(toItem);
}

async function loadFormulas(db: Executor): Promise<(Formula & { id: number })[]> {
  return db.select().from(t.productionFormulas).orderBy(asc(t.productionFormulas.id));
}

// ── Bán: trừ kho khi Ra lò ──

/**
 * Trừ kho theo `recipe_lines` cho các đơn vừa ra lò (baking → ready). Mỗi đơn một lần — gọi lại (Ra lò hai lần,
 * request song song) không trừ thêm. Đơn bị huỷ trước khi vào lò không bao giờ tới đây; `no_show` đã trừ lúc ra lò.
 */
export async function deductSale(tx: Executor, orderIds: string[], by: number | null, now: Date): Promise<number> {
  if (orderIds.length === 0) return 0;
  const items = await tx
    .select({ orderId: t.orderItems.orderId, productId: t.orderItems.productId, name: t.orderItems.name, unitPrice: t.orderItems.unitPrice, qty: t.orderItems.qty, lineTotal: t.orderItems.lineTotal, comboChoices: t.orderItems.comboChoices, isGift: t.orderItems.isGift })
    .from(t.orderItems)
    .where(inArray(t.orderItems.orderId, orderIds));
  const products = (await tx.select().from(t.products)) as Product[];
  const recipes = await tx.select().from(t.recipeLines);
  const moves: NewMove[] = [];
  for (const id of orderIds) {
    const usage = saleUsage([{ items: items.filter((i) => i.orderId === id) }], products, recipes);
    for (const [ingredientId, qty] of usage) moves.push({ ingredientId, qty: -qty, kind: "sale", refType: "order", refId: id });
  }
  return postMoves(tx, moves, by, now);
}

// ── Nhập kho ──

const MANAGE = (a: OpsActor) => canSpend(a);

/** Nhóm chi phí mặc định cho hàng nhập: theo từ khoá tên, không khớp → nguyên liệu café nếu quầy café đếm, ngược lại pizza. */
function categoryFor(item: StockItem): ExpenseCategory {
  const g = guessCategory(item.label);
  if (g !== "khac") return g;
  return item.countRoles.includes("barista") && !item.countRoles.includes("kitchen") ? "nl-cafe" : "nl-pizza";
}

export type ReceiveInput = {
  ingredientId: string;
  /** Số lượng theo đơn vị gốc. */
  qty: number;
  amount: number | null;
  pay: { kind: "expense"; source: ExpenseSource } | { kind: "debt"; supplier: string };
  photo?: string | null;
};

/** Nhập kho trong app (owner/manager): ghi chi phí (hộp chi/tiền túi/CK) hoặc phiếu nợ NCC + dòng nhập kho. */
export async function receiveStockCore(input: ReceiveInput, ctx: Ctx): Promise<{ ok: true; expenseId: number | null; billId: number | null; avgCost: number } | Fail> {
  if (!MANAGE(ctx.actor)) return fail("forbidden");
  if (input.pay.kind === "expense" && input.amount === null) return fail("invalid");
  const db = ctx.db ?? getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(t.ingredients).where(eq(t.ingredients.id, input.ingredientId));
    if (!row) return fail("not_found");
    const item = toItem(row);
    const qty = roundQty(input.qty);
    const desc = `${item.label} ${qty.toLocaleString("vi-VN")} ${item.unit}`;
    let expenseId: number | null = null;
    let billId: number | null = null;
    if (input.pay.kind === "expense") {
      expenseId = await insertExpense(tx, { amount: input.amount!, description: desc, category: categoryFor(item), source: input.pay.source, photo: input.photo ?? null }, ctx.actor, ctx.now);
    } else {
      const supplier = await findOrCreateSupplier(tx, input.pay.supplier, ctx.now);
      const [bill] = await tx
        .insert(t.supplierBills)
        .values({
          supplierId: supplier.id,
          receivedAt: ctx.now,
          items: [{ ingredientId: item.id, text: item.label, qty, unit: item.unit, amount: input.amount }],
          amount: input.amount,
          photo: input.photo ?? null,
          createdBy: ctx.actor.id,
          createdAt: ctx.now,
        })
        .returning({ id: t.supplierBills.id });
      billId = bill.id;
      await logEvent(tx, "bill_recorded", ctx.actor, { id: bill.id, supplierId: supplier.id, amount: input.amount }, ctx.now);
    }
    await postMoves(
      tx,
      [
        {
          ingredientId: item.id,
          qty,
          kind: "purchase",
          unitCost: input.amount !== null ? input.amount / qty : null,
          refType: expenseId !== null ? "expense" : "bill",
          refId: String(expenseId ?? billId),
          expiresAt: expiryOf(item, ctx.now),
        },
      ],
      ctx.actor.id,
      ctx.now,
    );
    const [after] = await tx.select({ avgCost: t.ingredients.avgCost }).from(t.ingredients).where(eq(t.ingredients.id, item.id));
    return { ok: true as const, expenseId, billId, avgCost: after.avgCost };
  });
}

export type StockOffer = { ingredientId: string; label: string; qty: number; unit: string };

/** `/chi 1tr2 phô mai 5kg` → [Nhập kho 5.000 g Mozzarella]? Chỉ khi khớp nguyên liệu và đổi được số lượng. */
export function offerFor(description: string, items: StockItem[]): StockOffer | null {
  const q = parseQuantity(description);
  const item = q ? matchIngredient(description, items) : null;
  const qty = item && q ? toBaseQty(q, item) : null;
  return item && qty ? { ingredientId: item.id, label: item.label, qty, unit: item.unit } : null;
}

/** Đề nghị nhập kho cho một chứng từ chi — null nếu đã nhập, đã huỷ, là trả nợ NCC hoặc không khớp. */
export async function expenseStockOffer(expenseId: number, db: Executor = getDb()): Promise<StockOffer | null> {
  const [e] = await db.select().from(t.expenses).where(eq(t.expenses.id, expenseId));
  if (!e || e.cancelledAt || e.supplierId !== null) return null;
  const [done] = await db
    .select({ id: t.stockMoves.id })
    .from(t.stockMoves)
    .where(and(eq(t.stockMoves.refType, "expense"), eq(t.stockMoves.refId, String(expenseId))))
    .limit(1);
  return done ? null : offerFor(e.description, await loadItems(db));
}

/** [📦 Nhập kho] dưới tin `/chi`: giá vốn = số tiền chi / số lượng. */
export async function stockInExpenseCore(expenseId: number, ctx: Ctx): Promise<{ ok: true; offer: StockOffer } | Fail> {
  if (!MANAGE(ctx.actor)) return fail("forbidden");
  const db = ctx.db ?? getDb();
  return db.transaction(async (tx) => {
    const [e] = await tx.select().from(t.expenses).where(eq(t.expenses.id, expenseId)).for("update");
    if (!e) return fail("not_found");
    if (e.cancelledAt || e.supplierId !== null) return fail("locked");
    const items = await loadItems(tx);
    const offer = offerFor(e.description, items);
    if (!offer) return fail("invalid");
    const item = items.find((i) => i.id === offer.ingredientId)!;
    const n = await postMoves(
      tx,
      [{ ingredientId: offer.ingredientId, qty: offer.qty, kind: "purchase", unitCost: e.amount / offer.qty, refType: "expense", refId: String(e.id), expiresAt: expiryOf(item, ctx.now) }],
      ctx.actor.id,
      ctx.now,
    );
    if (n === 0) return fail("duplicate");
    await logEvent(tx, "stock_in", ctx.actor, { expenseId, ...offer }, ctx.now);
    return { ok: true as const, offer };
  });
}

// ── Công nợ nhà cung cấp ──

async function findOrCreateSupplier(tx: Executor, name: string, now: Date) {
  const all = await tx.select().from(t.suppliers);
  const hit = matchSupplier(name, all);
  if (hit) return hit;
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 60);
  const [row] = await tx.insert(t.suppliers).values({ name: clean, createdAt: now }).onConflictDoNothing().returning();
  return row ?? (await tx.select().from(t.suppliers).where(eq(t.suppliers.name, clean)))[0];
}

/** Nợ còn lại của một NCC (phiếu đã có giá) + số phiếu chưa có giá. */
async function supplierDebt(db: Executor, supplierId: number): Promise<{ debt: number; unknown: number }> {
  const [r] = await db
    .select({
      debt: sql<number>`coalesce(sum(${t.supplierBills.amount} - ${t.supplierBills.paidAmount}), 0)::int`,
      unknown: sql<number>`count(*) filter (where ${t.supplierBills.amount} is null)::int`,
    })
    .from(t.supplierBills)
    .where(and(eq(t.supplierBills.supplierId, supplierId), eq(t.supplierBills.status, "open")));
  return r;
}

export type DebtInput = { supplier: string; lines: BillLine[]; amount: number | null; photo?: string | null; telegramFileId?: string | null };

/** `/no …` hoặc form: ghi phiếu nợ; dòng khớp nguyên liệu được gắn `ingredientId` để hỏi nhập kho. */
export async function recordDebtCore(
  input: DebtInput,
  ctx: Ctx,
): Promise<{ ok: true; billId: number; supplier: string; lines: BillLine[]; debt: number; stockable: StockOffer[] } | Fail> {
  if (!MANAGE(ctx.actor)) return fail("forbidden");
  const db = ctx.db ?? getDb();
  return db.transaction(async (tx) => {
    const supplier = await findOrCreateSupplier(tx, input.supplier, ctx.now);
    const items = await loadItems(tx);
    const lines = input.lines.map((l) => {
      const item = matchIngredient(l.text, items);
      return item ? { ...l, ingredientId: item.id } : { ...l };
    });
    const [bill] = await tx
      .insert(t.supplierBills)
      .values({ supplierId: supplier.id, receivedAt: ctx.now, items: lines, amount: input.amount, photo: input.photo ?? null, createdBy: ctx.actor.id, createdAt: ctx.now })
      .returning({ id: t.supplierBills.id });
    await logEvent(tx, "bill_recorded", ctx.actor, { id: bill.id, supplierId: supplier.id, amount: input.amount }, ctx.now);
    const { debt } = await supplierDebt(tx, supplier.id);
    return { ok: true as const, billId: bill.id, supplier: supplier.name, lines, debt, stockable: billOffers(lines, items) };
  });
}

/** Dòng phiếu nhập kho được (khớp nguyên liệu + đổi được số lượng), gộp theo nguyên liệu. */
function billOffers(lines: BillLine[], items: StockItem[]): StockOffer[] {
  const byId = new Map<string, StockOffer>();
  for (const l of lines) {
    const item = l.ingredientId ? items.find((i) => i.id === l.ingredientId) : undefined;
    const qty = item && l.qty !== null ? toBaseQty({ value: l.qty, unit: l.unit }, item) : null;
    if (!item || !qty) continue;
    const prev = byId.get(item.id);
    byId.set(item.id, { ingredientId: item.id, label: item.label, qty: roundQty((prev?.qty ?? 0) + qty), unit: item.unit });
  }
  return [...byId.values()];
}

/**
 * [📦 Nhập kho] dưới phiếu nợ: giá vốn ghi **khi nhận hàng**. Tiền từng dòng nếu có, còn lại chia theo
 * lượng × giá vốn hiện tại (`splitBillCost`); phiếu chưa có giá → nhập theo giá vốn hiện tại.
 */
export async function stockInBillCore(billId: number, ctx: Ctx): Promise<{ ok: true; items: StockOffer[] } | Fail> {
  if (!MANAGE(ctx.actor)) return fail("forbidden");
  const db = ctx.db ?? getDb();
  return db.transaction(async (tx) => {
    const [bill] = await tx.select().from(t.supplierBills).where(eq(t.supplierBills.id, billId)).for("update");
    if (!bill) return fail("not_found");
    if (bill.status === "cancelled") return fail("locked");
    const items = await loadItems(tx);
    const offers = billOffers(bill.items, items);
    if (offers.length === 0) return fail("invalid");
    // Tiền theo nguyên liệu: cộng tiền các dòng của nó (null nếu có dòng chưa có tiền).
    const lineAmount = (id: string) => {
      const ls = bill.items.filter((l) => l.ingredientId === id);
      return ls.every((l) => l.amount !== null) ? ls.reduce((s, l) => s + l.amount!, 0) : null;
    };
    // Phần tiền phiếu cho các dòng nhập kho = tiền phiếu − tiền các dòng không nhập kho (nếu biết).
    const otherKnown = bill.items.filter((l) => !offers.some((o) => o.ingredientId === l.ingredientId));
    const rest = bill.amount === null ? null : otherKnown.every((l) => l.amount !== null) ? bill.amount - otherKnown.reduce((s, l) => s + l.amount!, 0) : null;
    const costs = splitBillCost(
      offers.map((o) => ({ qty: o.qty, amount: lineAmount(o.ingredientId), weight: o.qty * (items.find((i) => i.id === o.ingredientId)?.avgCost ?? 0) })),
      rest,
    );
    const n = await postMoves(
      tx,
      offers.map((o, i) => ({
        ingredientId: o.ingredientId,
        qty: o.qty,
        kind: "purchase" as const,
        unitCost: costs[i] !== null ? costs[i]! / o.qty : null,
        refType: "bill" as const,
        refId: String(bill.id),
        expiresAt: expiryOf(items.find((x) => x.id === o.ingredientId)!, ctx.now),
      })),
      ctx.actor.id,
      ctx.now,
    );
    if (n === 0) return fail("duplicate");
    await logEvent(tx, "stock_in", ctx.actor, { billId, items: offers }, ctx.now);
    return { ok: true as const, items: offers };
  });
}

export type PayDebtResult = { ok: true; supplier: string; expenseId: number; closed: number; leftover: number; remaining: number; unknown: number };

/**
 * `/trano Cô Nhiều 480k` hoặc nút [Trả nợ]: ghi **một** chi phí (dòng tiền ghi khi trả, gắn `supplier_id` → không
 * nhập kho/tính giá vốn lần nữa) và trừ vào các phiếu mở cũ nhất (`allocatePayment`). Khoá các phiếu → trả song song
 * không trừ hai lần cùng một khoản nợ.
 */
export async function payDebtCore(input: { supplier: string; amount: number; source: ExpenseSource }, ctx: Ctx): Promise<PayDebtResult | Fail> {
  if (!MANAGE(ctx.actor)) return fail("forbidden");
  const db = ctx.db ?? getDb();
  return db.transaction(async (tx) => {
    const supplier = matchSupplier(input.supplier, await tx.select().from(t.suppliers));
    if (!supplier) return fail("not_found");
    const bills = await tx
      .select()
      .from(t.supplierBills)
      .where(and(eq(t.supplierBills.supplierId, supplier.id), eq(t.supplierBills.status, "open")))
      .orderBy(asc(t.supplierBills.receivedAt), asc(t.supplierBills.id))
      .for("update");
    if (bills.length === 0) return fail("no_debt");
    const plan = allocatePayment(bills, input.amount);
    const lines = bills.flatMap((b) => b.items);
    const cats = lines.map((l) => guessCategory(l.text));
    const category = cats.find((c) => c !== "khac") ?? "khac";
    const expenseId = await insertExpense(
      tx,
      { amount: input.amount, description: `Trả nợ ${supplier.name}`, category, source: input.source, supplierId: supplier.id },
      ctx.actor,
      ctx.now,
    );
    for (const a of plan.applied) {
      const b = bills.find((x) => x.id === a.id)!;
      await tx
        .update(t.supplierBills)
        .set({
          paidAmount: b.paidAmount + a.pay,
          ...(a.setAmount !== undefined ? { amount: a.setAmount } : {}),
          ...(a.close ? { status: "paid" as const } : {}),
          paidExpenseId: expenseId,
        })
        .where(eq(t.supplierBills.id, a.id));
    }
    await logEvent(tx, "debt_paid", ctx.actor, { supplierId: supplier.id, expenseId, amount: input.amount, applied: plan.applied, leftover: plan.leftover }, ctx.now);
    const left = await supplierDebt(tx, supplier.id);
    return {
      ok: true as const,
      supplier: supplier.name,
      expenseId,
      closed: plan.applied.filter((a) => a.close).length,
      leftover: plan.leftover,
      remaining: left.debt,
      unknown: left.unknown,
    };
  });
}

/** Huỷ phiếu nợ ghi nhầm (owner/manager) — chỉ khi chưa trả đồng nào và chưa nhập kho. */
export async function cancelBillCore(billId: number, ctx: Ctx): Promise<{ ok: true } | Fail> {
  if (!MANAGE(ctx.actor)) return fail("forbidden");
  const db = ctx.db ?? getDb();
  return db.transaction(async (tx) => {
    const [bill] = await tx.select().from(t.supplierBills).where(eq(t.supplierBills.id, billId)).for("update");
    if (!bill) return fail("not_found");
    const [stocked] = await tx
      .select({ id: t.stockMoves.id })
      .from(t.stockMoves)
      .where(and(eq(t.stockMoves.refType, "bill"), eq(t.stockMoves.refId, String(billId))))
      .limit(1);
    if (bill.status !== "open" || bill.paidAmount > 0 || stocked) return fail("locked");
    await tx.update(t.supplierBills).set({ status: "cancelled" }).where(eq(t.supplierBills.id, billId));
    await logEvent(tx, "bill_cancelled", ctx.actor, { id: billId }, ctx.now);
    return { ok: true as const };
  });
}

/** Gắn ảnh phiếu giao hàng (trả lời tin bot). */
export async function attachBillPhotoCore(billId: number, fileId: string | null, ctx: Ctx): Promise<{ ok: true } | Fail> {
  if (!MANAGE(ctx.actor)) return fail("forbidden");
  const db = ctx.db ?? getDb();
  await db.update(t.supplierBills).set({ photo: fileId }).where(eq(t.supplierBills.id, billId));
  return { ok: true };
}

export async function debtRows(db: Executor = getDb()): Promise<(DebtRow & { id: number })[]> {
  const rows = await db
    .select({
      id: t.suppliers.id,
      name: t.suppliers.name,
      debt: sql<number>`coalesce(sum(${t.supplierBills.amount} - ${t.supplierBills.paidAmount}), 0)::int`,
      bills: sql<number>`count(*)::int`,
      unknown: sql<number>`count(*) filter (where ${t.supplierBills.amount} is null)::int`,
      oldest: sql<string>`min(${t.supplierBills.receivedAt})`,
    })
    .from(t.supplierBills)
    .innerJoin(t.suppliers, eq(t.suppliers.id, t.supplierBills.supplierId))
    .where(eq(t.supplierBills.status, "open"))
    .groupBy(t.suppliers.id, t.suppliers.name)
    .orderBy(asc(t.suppliers.name));
  return rows.map((r) => ({ ...r, oldest: new Date(r.oldest) }));
}

// ── Sản xuất, huỷ ──

/** [Làm n mẻ]: trừ nguyên liệu theo công thức, cộng bán thành phẩm với giá vốn = Σ nguyên liệu, hạn dùng mới. */
export async function produceCore(input: { outputId: string; runs: number }, ctx: Ctx): Promise<{ ok: true; qty: number; unit: string; label: string } | Fail> {
  if (!canStock(ctx.actor)) return fail("forbidden");
  const db = ctx.db ?? getDb();
  return db.transaction(async (tx) => {
    const [f] = await tx.select().from(t.productionFormulas).where(eq(t.productionFormulas.outputId, input.outputId));
    if (!f) return fail("not_found");
    const ids = [f.outputId, ...f.lines.map((l) => l.ingredientId)];
    const items = new Map((await tx.select().from(t.ingredients).where(inArray(t.ingredients.id, ids))).map((r) => [r.id, toItem(r)]));
    const out = items.get(f.outputId);
    if (!out || f.lines.some((l) => !items.has(l.ingredientId))) return fail("not_found");
    const plan = production(f, input.runs);
    const unitCost = productionUnitCost(f, (id) => items.get(id)?.avgCost ?? 0);
    const [ev] = await tx
      .insert(t.opsEvents)
      .values({ type: "stock_produce", actor: `staff:${ctx.actor.id}`, data: { outputId: f.outputId, runs: input.runs, qty: plan.output.qty }, createdAt: ctx.now })
      .returning({ id: t.opsEvents.id });
    const ref = { refType: "production" as const, refId: String(ev.id) };
    await postMoves(
      tx,
      [
        ...plan.inputs.map((l) => ({ ingredientId: l.ingredientId, qty: -l.qty, kind: "produce_out" as const, ...ref })),
        { ingredientId: f.outputId, qty: plan.output.qty, kind: "produce_in" as const, unitCost, expiresAt: expiryOf(out, ctx.now), ...ref },
      ],
      ctx.actor.id,
      ctx.now,
    );
    return { ok: true as const, qty: plan.output.qty, unit: out.unit, label: out.label };
  });
}

/** Huỷ/hư hỏng có lý do. */
export async function wasteCore(input: { ingredientId: string; qty: number; reason: WasteReason; note?: string }, ctx: Ctx): Promise<{ ok: true; value: number } | Fail> {
  if (!canStock(ctx.actor)) return fail("forbidden");
  if (input.reason === "other" && !input.note?.trim()) return fail("reason_required");
  const db = ctx.db ?? getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(t.ingredients).where(eq(t.ingredients.id, input.ingredientId));
    if (!row) return fail("not_found");
    const [ev] = await tx
      .insert(t.opsEvents)
      .values({ type: "stock_waste", actor: `staff:${ctx.actor.id}`, data: input, createdAt: ctx.now })
      .returning({ id: t.opsEvents.id });
    await postMoves(
      tx,
      [{ ingredientId: row.id, qty: -input.qty, kind: "waste", refType: "manual", refId: String(ev.id), reason: input.reason, note: input.note?.trim() || null }],
      ctx.actor.id,
      ctx.now,
    );
    return { ok: true as const, value: valueOf(input.qty, row.avgCost) };
  });
}

// ── Kiểm kê tuần & kiểm nhanh ABC ──

export type CountResultLine = Pick<CountLine, "ingredientId" | "book" | "counted" | "diff" | "pct" | "over"> & { label: string; unit: string; value?: number };

/**
 * Lưu một lần đếm (đếm mù — sổ sách chỉ hiện sau khi gửi): lệch = thật − sổ → dòng `adjust` (hao hụt).
 * Dòng vượt ngưỡng % → Telegram. Tiền hao hụt chỉ trả cho owner/manager.
 */
export async function countStockCore(
  input: { kind: "weekly" | "quick"; lines: { ingredientId: string; counted: number }[] },
  ctx: Ctx,
): Promise<{ ok: true; lines: CountResultLine[]; value?: number; telegram: string | null } | Fail> {
  if (!canStock(ctx.actor)) return fail("forbidden");
  const db = ctx.db ?? getDb();
  const ids = [...new Set(input.lines.map((l) => l.ingredientId))].sort();
  if (ids.length !== input.lines.length) return fail("invalid");
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(t.ingredients).where(inArray(t.ingredients.id, ids)).orderBy(asc(t.ingredients.id)).for("update");
    if (rows.length !== ids.length) return fail("not_found");
    const book = await onHandMap(tx, ids);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const lines = input.lines.map((l) => {
      const r = byId.get(l.ingredientId)!;
      return countLine(r.id, book.get(r.id) ?? 0, l.counted, r.countTolerancePct, r.avgCost);
    });
    const [count] = await tx.insert(t.stockCounts).values({ kind: input.kind, lines, staffId: ctx.actor.id, createdAt: ctx.now }).returning({ id: t.stockCounts.id });
    await postMoves(
      tx,
      lines.filter((l) => l.diff !== 0).map((l) => ({ ingredientId: l.ingredientId, qty: l.diff, kind: "adjust" as const, refType: "count" as const, refId: String(count.id) })),
      ctx.actor.id,
      ctx.now,
    );
    await logEvent(tx, `stock_count_${input.kind}`, ctx.actor, { id: count.id, lines: lines.length }, ctx.now);
    const manager = MANAGE(ctx.actor);
    const value = lines.reduce((s, l) => s + l.value, 0);
    const out: CountResultLine[] = lines.map((l) => {
      const r = byId.get(l.ingredientId)!;
      return { ingredientId: l.ingredientId, label: r.label, unit: r.unit, book: l.book, counted: l.counted, diff: l.diff, pct: l.pct, over: l.over, ...(manager ? { value: l.value } : {}) };
    });
    const over = out.filter((l) => l.over);
    const telegram = over.length ? stockCountAlertText({ kind: input.kind, by: ctx.actor.name, lines: over, value: over.reduce((s, l) => s + valueOf(l.diff, byId.get(l.ingredientId)!.avgCost), 0) }) : null;
    return { ok: true as const, lines: out, ...(manager ? { value } : {}), telegram };
  });
}

// ── Cảnh báo & màn hình ──

async function lotsFor(db: Executor, ids: string[]) {
  if (ids.length === 0) return new Map<string, { qty: number; expiresAt: Date | null; createdAt: Date }[]>();
  const rows = await db
    .select({ id: t.stockMoves.ingredientId, qty: t.stockMoves.qty, expiresAt: t.stockMoves.expiresAt, createdAt: t.stockMoves.createdAt })
    .from(t.stockMoves)
    .where(inArray(t.stockMoves.ingredientId, ids));
  const m = new Map<string, { qty: number; expiresAt: Date | null; createdAt: Date }[]>();
  for (const r of rows) m.set(r.id, [...(m.get(r.id) ?? []), r]);
  return m;
}

/** Mặt hàng theo dõi đang dưới mức / sắp hoặc đã hết hạn / sổ âm. */
export async function stockAlerts(now: Date, db: Executor = getDb()): Promise<StockAlert[]> {
  const items = (await loadItems(db)).filter((i) => i.trackStock);
  const stock = await onHandMap(db);
  const lots = await lotsFor(db, items.filter((i) => i.shelfLifeHours).map((i) => i.id));
  return items.flatMap((i) => {
    const onHand = stock.get(i.id) ?? 0;
    const flags = stockFlags(onHand, i, fifoLots(lots.get(i.id) ?? []), now);
    return flags.length ? [{ label: i.label, onHand, unit: i.unit, parLevel: i.parLevel, flags }] : [];
  });
}

/** Cron hằng ngày: báo kho cần chú ý — một lần mỗi ngày (`ops_events` `stock_alert:<ngày>`). */
export async function runStockCron(now: Date, send: (text: string) => Promise<boolean>, db: Db = getDb()) {
  const key = `stock_alert:${vnDateOf(now)}`;
  const [done] = await db.select({ id: t.opsEvents.id }).from(t.opsEvents).where(eq(t.opsEvents.type, key)).limit(1);
  if (done) return { stockAlertSent: false };
  const alerts = await stockAlerts(now, db);
  if (alerts.length === 0) return { stockAlertSent: false };
  if (!(await send(stockAlertText(alerts)))) return { stockAlertSent: false };
  await db.insert(t.opsEvents).values({ type: key, actor: "system", data: { count: alerts.length }, createdAt: now });
  return { stockAlertSent: true };
}

export type StockRowView = {
  id: string;
  label: string;
  unit: string;
  level: StockLevel;
  storage: string;
  trackStock: boolean;
  onHand: number;
  parLevel: number | null;
  flags: StockFlag[];
  /** Hạn của lô còn lại sớm nhất (ISO). */
  nextExpiry: string | null;
  purchaseUnit: string | null;
  purchaseFactor: number | null;
  shelfLifeHours: number | null;
  aliases: string[];
  countClass: StockItem["countClass"];
  countRoles: Role[];
  countTolerancePct: number;
  /** Chỉ owner/manager. */
  avgCost?: number;
  value?: number;
};

export type StockView = {
  canManage: boolean;
  items: StockRowView[];
  formulas: { outputId: string; label: string; outputQty: number; unit: string; lines: { label: string; qty: number; unit: string }[] }[];
  /** Kiểm nhanh cuối ca — **không** có số sổ sách (đếm mù). */
  quick: { items: { id: string; label: string; unit: string }[]; lastAt: string | null };
  alerts: StockAlert[];
  recent: { at: string; label: string; kind: MoveKind; qty: number; unit: string; by: string | null; reason: WasteReason | null }[];
  /** Chỉ owner/manager. */
  suppliers: { id: number; name: string; debt: number; unknown: number; bills: { id: number; receivedAt: string; items: BillLine[]; amount: number | null; paidAmount: number }[] }[];
  margins: { productId: string; name: string; price: number; cost: number; gross: number; pct: number }[];
  month: { label: string; purchases: number; waste: number; adjust: number } | null;
};

export async function loadStockView(viewer: OpsActor, now: Date, db: Db = getDb()): Promise<StockView | null> {
  if (!canStock(viewer)) return null;
  const manager = MANAGE(viewer);
  const items = await loadItems(db);
  const formulas = await loadFormulas(db);
  const stock = await onHandMap(db);
  const lots = await lotsFor(db, items.filter((i) => i.trackStock && i.shelfLifeHours).map((i) => i.id));
  const names = new Map((await db.select({ id: t.staff.id, name: t.staff.name }).from(t.staff)).map((s) => [s.id, s.name]));
  const byId = new Map(items.map((i) => [i.id, i]));

  const rows: StockRowView[] = items.map((i) => {
    const onHand = stock.get(i.id) ?? 0;
    const left = fifoLots(lots.get(i.id) ?? []);
    const next = left.map((l) => l.expiresAt).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    return {
      id: i.id,
      label: i.label,
      unit: i.unit,
      level: i.level,
      storage: "",
      trackStock: i.trackStock,
      onHand,
      parLevel: i.parLevel,
      flags: i.trackStock ? stockFlags(onHand, i, left, now) : [],
      nextExpiry: next?.toISOString() ?? null,
      purchaseUnit: i.purchaseUnit,
      purchaseFactor: i.purchaseFactor,
      shelfLifeHours: i.shelfLifeHours,
      aliases: i.aliases,
      countClass: i.countClass,
      countRoles: i.countRoles,
      countTolerancePct: i.countTolerancePct,
      ...(manager ? { avgCost: i.avgCost, value: valueOf(onHand, i.avgCost) } : {}),
    };
  });
  const storage = new Map((await db.select({ id: t.ingredients.id, storage: t.ingredients.storage }).from(t.ingredients)).map((r) => [r.id, r.storage]));
  for (const r of rows) r.storage = storage.get(r.id) ?? "";

  // Kiểm nhanh: lần đếm gần nhất của từng mục (từ các lần đếm 60 ngày qua).
  const counts = await db
    .select({ lines: t.stockCounts.lines, createdAt: t.stockCounts.createdAt, staffId: t.stockCounts.staffId, kind: t.stockCounts.kind })
    .from(t.stockCounts)
    .where(gte(t.stockCounts.createdAt, new Date(now.getTime() - 60 * 86_400_000)))
    .orderBy(desc(t.stockCounts.createdAt));
  const lastCounted = new Map<string, Date>();
  for (const c of counts) for (const l of c.lines) if (!lastCounted.has(l.ingredientId)) lastCounted.set(l.ingredientId, c.createdAt);
  const startOfDay = vnInstant(vnDateOf(now), "00:00");
  const myQuick = counts.find((c) => c.kind === "quick" && c.staffId === viewer.id && c.createdAt >= startOfDay);

  const recentRows = await db.select().from(t.stockMoves).orderBy(desc(t.stockMoves.createdAt), desc(t.stockMoves.id)).limit(25);

  let suppliers: StockView["suppliers"] = [];
  let margins: StockView["margins"] = [];
  let month: StockView["month"] = null;
  if (manager) {
    const debts = await debtRows(db);
    const bills = debts.length
      ? await db
          .select()
          .from(t.supplierBills)
          .where(and(eq(t.supplierBills.status, "open"), inArray(t.supplierBills.supplierId, debts.map((d) => d.id))))
          .orderBy(asc(t.supplierBills.receivedAt))
      : [];
    suppliers = debts.map((d) => ({
      id: d.id,
      name: d.name,
      debt: d.debt,
      unknown: d.unknown,
      bills: bills
        .filter((b) => b.supplierId === d.id)
        .map((b) => ({ id: b.id, receivedAt: b.receivedAt.toISOString(), items: b.items, amount: b.amount, paidAmount: b.paidAmount })),
    }));

    const products = (await db.select().from(t.products).where(eq(t.products.isActive, true)).orderBy(asc(t.products.sort))) as Product[];
    const recipes = await db.select().from(t.recipeLines);
    const costOf = unitCostResolver(items, formulas);
    margins = products.map((p) => {
      const cost = productCost(p, recipes, costOf);
      return { productId: p.id, name: p.name, price: p.price, cost, ...margin(p.price, cost) };
    });

    const range = monthRange(monthOf(now));
    const [m] = await db
      .select({
        purchases: sql<number>`coalesce(round(sum(${t.stockMoves.qty} * ${t.stockMoves.unitCost}) filter (where ${t.stockMoves.kind} = 'purchase')), 0)::int`,
        waste: sql<number>`coalesce(round(sum(${t.stockMoves.qty} * ${t.stockMoves.unitCost}) filter (where ${t.stockMoves.kind} = 'waste')), 0)::int`,
        adjust: sql<number>`coalesce(round(sum(${t.stockMoves.qty} * ${t.stockMoves.unitCost}) filter (where ${t.stockMoves.kind} = 'adjust')), 0)::int`,
      })
      .from(t.stockMoves)
      .where(and(gte(t.stockMoves.createdAt, range.from), sql`${t.stockMoves.createdAt} < ${range.to.toISOString()}::timestamptz`));
    month = { label: range.label, ...m };
  }

  return {
    canManage: manager,
    items: rows,
    formulas: formulas.flatMap((f) => {
      const out = byId.get(f.outputId);
      if (!out) return [];
      return [
        {
          outputId: f.outputId,
          label: out.label,
          outputQty: f.outputQty,
          unit: out.unit,
          lines: f.lines.map((l) => ({ label: byId.get(l.ingredientId)?.label ?? l.ingredientId, qty: l.qty, unit: byId.get(l.ingredientId)?.unit ?? "" })),
        },
      ];
    }),
    quick: { items: quickCountItems(items, lastCounted, viewer.roles).map((i) => ({ id: i.id, label: i.label, unit: i.unit })), lastAt: myQuick?.createdAt.toISOString() ?? null },
    alerts: rows.filter((r) => r.flags.length).map((r) => ({ label: r.label, onHand: r.onHand, unit: r.unit, parLevel: r.parLevel, flags: r.flags })),
    recent: recentRows.map((m) => ({
      at: m.createdAt.toISOString(),
      label: byId.get(m.ingredientId)?.label ?? m.ingredientId,
      kind: m.kind,
      qty: m.qty,
      unit: byId.get(m.ingredientId)?.unit ?? "",
      by: m.createdBy !== null ? (names.get(m.createdBy) ?? null) : null,
      reason: m.reason,
    })),
    suppliers,
    margins,
    month,
  };
}

export type StockItemInput = Pick<
  StockItem,
  "level" | "trackStock" | "purchaseUnit" | "purchaseFactor" | "shelfLifeHours" | "parLevel" | "aliases" | "countClass" | "countRoles" | "countTolerancePct"
> & { id: string };

/** Sửa hồ sơ kho của một nguyên liệu (owner/manager). Giá vốn không sửa tay — đi qua nhập kho/kiểm kê. */
export async function saveStockItemCore(input: StockItemInput, ctx: Ctx): Promise<{ ok: true } | Fail> {
  if (!MANAGE(ctx.actor)) return fail("forbidden");
  if ((input.purchaseUnit === null) !== (input.purchaseFactor === null)) return fail("invalid");
  const db = ctx.db ?? getDb();
  const { id, ...set } = input;
  const res = await db.update(t.ingredients).set(set).where(eq(t.ingredients.id, id)).returning({ id: t.ingredients.id });
  if (res.length === 0) return fail("not_found");
  await logEvent(db, "stock_item", ctx.actor, input, ctx.now);
  return { ok: true };
}
