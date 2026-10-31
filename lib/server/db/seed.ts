import "server-only";
import { sql } from "drizzle-orm";
import { pathToFileURL } from "node:url";
import {
  seedIngredients,
  seedPickupPoints,
  seedProducts,
  seedRecipes,
  seedRoutes,
  seedSlotTemplate,
  seedZones,
} from "@/data/seed";
import { seedChecklistTemplates, seedHandbookPages } from "@/data/seed-ops";
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

    await tx
      .insert(t.settings)
      .values(Object.entries(DEFAULT_APP_SETTINGS).map(([key, value]) => ({ key: key as keyof typeof DEFAULT_APP_SETTINGS, value })))
      .onConflictDoNothing();

    // M8: mẫu checklist & sổ tay khởi đầu (không ghi đè bản chủ quán đã sửa).
    await tx.insert(t.checklistTemplates).values(seedChecklistTemplates).onConflictDoNothing();
    await tx.insert(t.handbookPages).values(seedHandbookPages).onConflictDoNothing();

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
