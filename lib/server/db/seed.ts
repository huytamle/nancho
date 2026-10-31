import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { pathToFileURL } from "node:url";
import {
  seedIngredients,
  seedPickupPoints,
  seedProducts,
  seedRecipes,
  seedRoutes,
  DRINKS,
  seedCafeWindows,
  seedSlotTemplate,
  seedZones,
} from "@/data/seed";
import { seedChecklistTemplates, seedHandbookPages } from "@/data/seed-ops";
import { seedCafeItems, seedFormulas, seedStockIngredients, seedStockProfiles } from "@/data/seed-stock";
import { vnDateOf } from "@/lib/domain/time";
import { serverNow } from "@/lib/server/clock";
import { closeDb, getDb, type Db } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { ensureBatches } from "@/lib/server/dal/schedule";
import { DEFAULT_APP_SETTINGS, loadSettings } from "@/lib/server/dal/settings";

// Seed Phụ lục A (data/seed.ts — không chép dữ liệu ở đây). Chạy lại an toàn: chỉ thêm bản ghi còn thiếu,
// không ghi đè chỉnh sửa của chủ quán. Chạy: `npm run db:seed` (cần DATABASE_URL).

/** Dữ liệu tĩnh (thực đơn, giao hàng, lịch mẫu, cài đặt, checklist, sổ tay) — không sinh ngày/mẻ. */
export async function seedStatic(db: Db = getDb()) {
  await db.transaction(async (tx) => {
    await tx.insert(t.products).values(seedProducts).onConflictDoNothing();
    await tx.insert(t.ingredients).values(seedIngredients).onConflictDoNothing();
    await tx.insert(t.recipeLines).values(seedRecipes).onConflictDoNothing();
    await tx.insert(t.routes).values(seedRoutes).onConflictDoNothing();
    await tx.insert(t.zones).values(seedZones).onConflictDoNothing();
    await tx.insert(t.pickupPoints).values(seedPickupPoints).onConflictDoNothing();

    const { weekdays, readyTimes, ovenLeadMin, cutoffTime, capPan, capBbq } = seedSlotTemplate;
    await tx
      .insert(t.slotTemplates)
      .values(weekdays.flatMap((weekday) => readyTimes.map((readyTime) => ({ weekday, readyTime, ovenLeadMin, cutoffTime, capPan, capBbq }))))
      .onConflictDoNothing();

    // M12: khung giao cà phê mỗi ngày + nước lon gợi ý kèm cho món chính đã có từ trước (chỉ thêm, không bỏ).
    await tx
      .insert(t.slotTemplates)
      .values(
        [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) =>
          seedCafeWindows.map((w) => ({ weekday, readyTime: w.end, ovenLeadMin: w.lengthMin, cutoffTime: w.cutoff, capPan: 0, capBbq: 0, segment: "cafe" as const })),
        ),
      )
      .onConflictDoNothing();
    await tx.execute(sql`
      UPDATE products SET upsell_ids = ARRAY(SELECT x FROM unnest(upsell_ids || ARRAY[${sql.join(DRINKS.map((d) => sql`${d}`), sql`, `)}]::text[]) WITH ORDINALITY u(x, i) GROUP BY x ORDER BY min(i))
      WHERE kind IN ('pizza', 'bbq', 'combo') AND NOT (upsell_ids @> ARRAY[${sql.join(DRINKS.map((d) => sql`${d}`), sql`, `)}]::text[])`);

    await tx
      .insert(t.settings)
      .values(Object.entries(DEFAULT_APP_SETTINGS).map(([key, value]) => ({ key: key as keyof typeof DEFAULT_APP_SETTINGS, value })))
      .onConflictDoNothing();

    // M8: mẫu checklist & sổ tay khởi đầu (không ghi đè bản chủ quán đã sửa).
    await tx.insert(t.checklistTemplates).values(seedChecklistTemplates).onConflictDoNothing();
    await tx.insert(t.handbookPages).values(seedHandbookPages).onConflictDoNothing();

    // M10: kho — nguyên liệu thô & hàng bán lại, hồ sơ kho cho nguyên liệu cũ (chỉ khi chưa chỉnh), công thức sản xuất.
    await tx.insert(t.ingredients).values(seedStockIngredients).onConflictDoNothing();
    for (const [id, p] of Object.entries(seedStockProfiles)) {
      await tx
        .update(t.ingredients)
        .set({ ...p, purchaseUnit: p.purchaseUnit ?? null, purchaseFactor: p.purchaseFactor ?? null })
        .where(and(eq(t.ingredients.id, id), eq(t.ingredients.trackStock, false), sql`cardinality(${t.ingredients.aliases}) = 0`));
    }
    await tx.insert(t.productionFormulas).values(seedFormulas).onConflictDoNothing();

    // M11: món café + định lượng (chỉ món mới — món chủ quán đã sửa giữ nguyên).
    for (const { lines, ...item } of seedCafeItems) {
      const [row] = await tx.insert(t.cafeItems).values(item).onConflictDoNothing().returning({ id: t.cafeItems.id });
      if (row && lines.length) await tx.insert(t.cafeRecipeLines).values(lines.map((l) => ({ itemId: row.id, ...l })));
    }

    // Id serial được chèn tay → đẩy sequence lên để bản ghi admin thêm sau không trùng khoá.
    for (const table of ["routes", "zones", "pickup_points", "checklist_templates"]) {
      await tx.execute(
        sql`SELECT setval(pg_get_serial_sequence(${table}, 'id'), (SELECT coalesce(max(id), 1) FROM ${sql.identifier(table)}))`,
      );
    }
  });
}

export async function seed(db: Db = getDb(), now = serverNow()) {
  await seedStatic(db);
  const { ordering } = await loadSettings(db);
  return ensureBatches(vnDateOf(now), ordering.daysAhead + 1, db);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed()
    .then((r) => console.info(`Seed xong · tạo ${r.days} ngày, ${r.batches} mẻ`))
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(closeDb);
}
