import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { cafeItemCost, cafeUsage, matchSales, type CafeItem, type CafeRecipeLine, type MatchedLine, type SaleLine } from "@/lib/domain/cafe";
import { hasRole, type Role } from "@/lib/domain/roles";
import { margin, unitCostResolver } from "@/lib/domain/stock";
import { vnDateOf, vnInstant, type ISODate } from "@/lib/domain/time";
import { getDb, type Executor } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { canSpend, fail, logEvent, type OpsActor, type OpsCtx, type OpsFail } from "@/lib/server/dal/ops";
import { loadFormulas, loadItems, postMoves, type NewMove } from "@/lib/server/dal/stock";

// Kho café (§17.10, M11): món café bán qua Sapo + định lượng đồ uống; nhập báo cáo "bán hàng theo mặt hàng" của Sapo
// → trừ kho theo định lượng. Mỗi ngày nhập một lần (UNIQUE service_date); dòng kho `sale` ref `cafe_sale:<id>`
// (index một phần chống trừ đôi). Sửa món/định lượng: owner/manager. Nhập file: owner/manager/pha chế.

type Ctx = OpsCtx;
type Fail = OpsFail;

const IMPORT_ROLES: Role[] = ["owner", "manager", "barista"];
export const canImportCafe = (a: { roles: Role[] }) => hasRole(a.roles, IMPORT_ROLES);

async function loadCafe(db: Executor): Promise<{ items: (CafeItem & { isActive: boolean; sort: number })[]; recipes: CafeRecipeLine[] }> {
  const items = await db.select().from(t.cafeItems).orderBy(asc(t.cafeItems.sort), asc(t.cafeItems.id));
  const recipes = await db.select().from(t.cafeRecipeLines);
  return { items, recipes };
}

export type CafeItemInput = { id?: number; name: string; aliases: string[]; price: number; isActive: boolean; lines: { ingredientId: string; qty: number }[] };

/** Thêm/sửa món café và định lượng (thay toàn bộ dòng định lượng). */
export async function saveCafeItemCore(input: CafeItemInput, ctx: Ctx): Promise<{ ok: true; id: number } | Fail> {
  if (!canSpend(ctx.actor)) return fail("forbidden");
  const db = ctx.db ?? getDb();
  const ids = [...new Set(input.lines.map((l) => l.ingredientId))];
  if (ids.length !== input.lines.length) return fail("invalid");
  return db.transaction(async (tx) => {
    const known = new Set((await tx.select({ id: t.ingredients.id }).from(t.ingredients)).map((r) => r.id));
    if (ids.some((id) => !known.has(id))) return fail("invalid");
    const values = { name: input.name, aliases: input.aliases, price: input.price, isActive: input.isActive };
    let id = input.id;
    if (id) {
      const res = await tx.update(t.cafeItems).set(values).where(eq(t.cafeItems.id, id)).returning({ id: t.cafeItems.id });
      if (res.length === 0) return fail("not_found");
    } else {
      const [row] = await tx.insert(t.cafeItems).values(values).onConflictDoNothing().returning({ id: t.cafeItems.id });
      if (!row) return fail("duplicate");
      id = row.id;
    }
    await tx.delete(t.cafeRecipeLines).where(eq(t.cafeRecipeLines.itemId, id));
    if (input.lines.length) await tx.insert(t.cafeRecipeLines).values(input.lines.map((l) => ({ itemId: id, ingredientId: l.ingredientId, qty: l.qty })));
    await logEvent(tx, "cafe_item", ctx.actor, { id, ...input }, ctx.now);
    return { ok: true as const, id };
  });
}

export type SalesPreview = { date: ISODate; lines: (MatchedLine & { item: string | null })[]; already: boolean };

/** Xem trước file Sapo: khớp tên món (không ghi gì). */
export async function previewCafeSalesCore(input: { date: ISODate; lines: SaleLine[] }, ctx: Ctx): Promise<({ ok: true } & SalesPreview) | Fail> {
  if (!canImportCafe(ctx.actor)) return fail("forbidden");
  const db = ctx.db ?? getDb();
  const { items } = await loadCafe(db);
  const name = new Map(items.map((i) => [i.id, i.name]));
  const [prev] = await db.select({ id: t.cafeSales.id }).from(t.cafeSales).where(eq(t.cafeSales.serviceDate, input.date));
  return {
    ok: true,
    date: input.date,
    already: !!prev,
    lines: matchSales(input.lines, items).map((l) => ({ ...l, item: l.itemId !== null ? (name.get(l.itemId) ?? null) : null })),
  };
}

/** Ghi số bán café của một ngày và trừ kho theo định lượng. Ngày đã nhập → `duplicate`. Khớp tên lại ở server. */
export async function importCafeSalesCore(input: { date: ISODate; lines: SaleLine[] }, ctx: Ctx): Promise<{ ok: true; id: number; matched: number; unmatched: string[]; moves: number } | Fail> {
  if (!canImportCafe(ctx.actor)) return fail("forbidden");
  if (input.date > vnDateOf(ctx.now)) return fail("invalid");
  const db = ctx.db ?? getDb();
  return db.transaction(async (tx) => {
    const { items, recipes } = await loadCafe(tx);
    const lines = matchSales(input.lines, items);
    const [row] = await tx
      .insert(t.cafeSales)
      .values({ serviceDate: input.date, lines, createdBy: ctx.actor.id, createdAt: ctx.now })
      .onConflictDoNothing()
      .returning({ id: t.cafeSales.id });
    if (!row) return fail("duplicate");
    const usage = cafeUsage(lines, recipes);
    const moves: NewMove[] = [...usage].map(([ingredientId, qty]) => ({ ingredientId, qty: -qty, kind: "sale", refType: "cafe_sale", refId: String(row.id) }));
    // Ghi kho vào cuối ngày bán (nhập hôm sau vẫn tính đúng ngày cho food cost theo kỳ).
    const end = vnInstant(input.date, "23:59");
    const written = await postMoves(tx, moves, ctx.actor.id, end < ctx.now ? end : ctx.now);
    await logEvent(tx, "cafe_sales", ctx.actor, { id: row.id, date: input.date, lines: lines.length }, ctx.now);
    return { ok: true as const, id: row.id, matched: lines.filter((l) => l.itemId !== null).length, unmatched: lines.filter((l) => l.itemId === null).map((l) => l.name), moves: written };
  });
}

export type CafeItemView = {
  id: number;
  name: string;
  aliases: string[];
  isActive: boolean;
  lines: { ingredientId: string; label: string; qty: number; unit: string }[];
  /** Chỉ owner/manager. */
  price?: number;
  cost?: number;
  gross?: number;
  pct?: number;
};

export type CafeView = {
  today: ISODate;
  canManage: boolean;
  canImport: boolean;
  items: CafeItemView[];
  ingredients: { id: string; label: string; unit: string }[];
  imports: { date: ISODate; matched: number; unmatched: string[]; cups: number }[];
};

export async function loadCafeView(viewer: OpsActor, now: Date, db: Executor = getDb()): Promise<CafeView | null> {
  const manage = canSpend(viewer);
  const canImport = canImportCafe(viewer);
  if (!manage && !canImport) return null;
  const { items, recipes } = await loadCafe(db);
  const stockItems = await loadItems(db);
  const byId = new Map(stockItems.map((i) => [i.id, i]));
  const costOf = unitCostResolver(stockItems, await loadFormulas(db));
  const imports = await db.select().from(t.cafeSales).orderBy(desc(t.cafeSales.serviceDate)).limit(10);
  return {
    today: vnDateOf(now),
    canManage: manage,
    canImport,
    items: items
      .filter((i) => manage || i.isActive)
      .map((i) => {
        const cost = cafeItemCost(i.id, recipes, costOf);
        return {
          id: i.id,
          name: i.name,
          aliases: i.aliases,
          isActive: i.isActive,
          lines: recipes
            .filter((r) => r.itemId === i.id)
            .map((r) => ({ ingredientId: r.ingredientId, label: byId.get(r.ingredientId)?.label ?? r.ingredientId, qty: r.qty, unit: byId.get(r.ingredientId)?.unit ?? "" })),
          ...(manage ? { price: i.price, cost, ...margin(i.price, cost) } : {}),
        };
      }),
    ingredients: stockItems.map((i) => ({ id: i.id, label: i.label, unit: i.unit })),
    imports: imports.map((r) => ({
      date: r.serviceDate,
      matched: r.lines.filter((l) => l.itemId !== null).length,
      unmatched: r.lines.filter((l) => l.itemId === null).map((l) => l.name),
      cups: r.lines.filter((l) => l.itemId !== null).reduce((n, l) => n + l.qty, 0),
    })),
  };
}
