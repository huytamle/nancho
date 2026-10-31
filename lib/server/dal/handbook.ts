import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { canAccess, canEditOps, SLUG } from "@/lib/domain/checklist";
import type { Role } from "@/lib/domain/roles";
import { getDb, type Db } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { fail, logEvent, type OpsActor, type OpsCtx, type OpsFail } from "@/lib/server/dal/ops";
import { renderMarkdown } from "@/lib/server/markdown";

// Sổ tay (§17.6): quy trình & công thức. Trang chỉ trả cho vai trò được gắn (owner/manager luôn xem) —
// ràng buộc nằm ở DTO này, không phải ẩn trên UI. Mỗi lượt mở trang ghi `ops_events` (handbook_view).

export type HandbookKind = "sop" | "recipe";
export type HandbookListItem = { slug: string; title: string; kind: HandbookKind; roles: Role[] };
export type RecipeLineView = { label: string; qty: number; unit: string };
export type HandbookPageView = {
  id: number;
  slug: string;
  title: string;
  kind: HandbookKind;
  roles: Role[];
  html: string;
  /** Markdown gốc — chỉ cho người sửa. */
  body: string | null;
  productId: string | null;
  recipe: { product: string; lines: RecipeLineView[] } | null;
  version: number;
  updatedBy: string | null;
  updatedAt: string;
};
export type HandbookView = {
  canEdit: boolean;
  viewer: string;
  pages: HandbookListItem[];
  page: HandbookPageView | null;
  /** Có hỏi `trang=` nhưng không có / không được xem (không phân biệt hai trường hợp). */
  missing: boolean;
  products: { id: string; name: string }[];
};

export async function loadHandbookView(viewer: OpsActor, slug: string | null, now: Date, db: Db = getDb()): Promise<HandbookView> {
  const canEdit = canEditOps(viewer.roles);
  const rows = await db.select().from(t.handbookPages).orderBy(asc(t.handbookPages.kind), asc(t.handbookPages.title));
  const visible = rows.filter((p) => canAccess(viewer.roles, p.roles));
  const row = slug ? visible.find((p) => p.slug === slug) : undefined;

  let page: HandbookPageView | null = null;
  if (row) {
    let recipe: HandbookPageView["recipe"] = null;
    if (row.productId) {
      const [product] = await db.select({ name: t.products.name }).from(t.products).where(eq(t.products.id, row.productId));
      const lines = await db
        .select({ label: t.ingredients.label, qty: t.recipeLines.qty, unit: t.ingredients.unit })
        .from(t.recipeLines)
        .innerJoin(t.ingredients, eq(t.ingredients.id, t.recipeLines.ingredientId))
        .where(eq(t.recipeLines.productId, row.productId))
        .orderBy(asc(t.ingredients.sort));
      recipe = { product: product?.name ?? row.productId, lines };
    }
    const [editor] = row.updatedBy ? await db.select({ name: t.staff.name }).from(t.staff).where(eq(t.staff.id, row.updatedBy)) : [];
    page = {
      id: row.id,
      slug: row.slug,
      title: row.title,
      kind: row.kind,
      roles: row.roles,
      html: renderMarkdown(row.body),
      body: canEdit ? row.body : null,
      productId: row.productId,
      recipe,
      version: row.version,
      updatedBy: editor?.name ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
    await logEvent(db, "handbook_view", viewer, { slug: row.slug, version: row.version }, now);
  }

  return {
    canEdit,
    viewer: viewer.name,
    pages: visible.map((p) => ({ slug: p.slug, title: p.title, kind: p.kind, roles: p.roles })),
    page,
    missing: slug !== null && !row,
    products: canEdit ? await db.select({ id: t.products.id, name: t.products.name }).from(t.products).orderBy(asc(t.products.sort)) : [],
  };
}

export type PageInput = { id?: number; slug: string; title: string; kind: HandbookKind; roles: Role[]; body: string; productId: string | null };

/** Thêm / sửa trang (owner, manager). Mỗi lần sửa tăng `version`. */
export async function saveHandbookPageCore(input: PageInput, ctx: OpsCtx): Promise<{ ok: true; slug: string } | OpsFail> {
  if (!canEditOps(ctx.actor.roles)) return fail("forbidden");
  if (!SLUG.test(input.slug) || input.roles.length === 0) return fail("invalid");
  const db = ctx.db ?? getDb();
  if (input.productId) {
    const [p] = await db.select({ id: t.products.id }).from(t.products).where(eq(t.products.id, input.productId));
    if (!p) return fail("invalid");
  }
  const values = {
    slug: input.slug,
    title: input.title,
    kind: input.kind,
    roles: input.roles,
    body: input.body,
    productId: input.productId,
    updatedBy: ctx.actor.id,
    updatedAt: ctx.now,
  };
  try {
    if (input.id === undefined) {
      await db.insert(t.handbookPages).values(values);
    } else {
      const rows = await db
        .update(t.handbookPages)
        .set({ ...values, version: sql`${t.handbookPages.version} + 1` })
        .where(eq(t.handbookPages.id, input.id))
        .returning({ id: t.handbookPages.id });
      if (rows.length === 0) return fail("not_found");
    }
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    if (e?.code === "23505" || e?.cause?.code === "23505") return fail("duplicate");
    throw err;
  }
  await logEvent(db, "handbook_saved", ctx.actor, { id: input.id ?? null, slug: input.slug }, ctx.now);
  return { ok: true, slug: input.slug };
}
