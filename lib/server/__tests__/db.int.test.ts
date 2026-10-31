import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedIngredients, seedPickupPoints, seedProducts, seedRecipes, seedZones } from "@/data/seed";
import { vnInstant, type ISODate } from "@/lib/domain/time";
import { closeDb, getDb } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { seed } from "@/lib/server/db/seed";
import { loadCatalog } from "@/lib/server/dal/catalog";
import { ensureBatches, getOvenStatus, loadServiceDays } from "@/lib/server/dal/schedule";
import { loadSettings } from "@/lib/server/dal/settings";

// Lịch mẫu Phụ lục A: T4–CN, mẻ 17/18/19h, chốt 15:30, 4 khay + 4 BBQ. T7 07/11/2026 là ngày mở.
const SAT = "2026-11-07" as ISODate;
const at = (date: ISODate, hhmm: string) => vnInstant(date, hhmm);
const db = getDb();

beforeAll(async () => {
  await seed(db, at(SAT, "09:00"));
});

afterAll(closeDb);

describe("migration", () => {
  it("bật RLS cho mọi bảng và không có policy nào (§12)", async () => {
    const tables = await db.execute<{ relname: string; relrowsecurity: boolean }>(
      sql`SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'`,
    );
    expect(tables.length).toBe(18);
    expect(tables.filter((r) => !r.relrowsecurity)).toEqual([]);
    const policies = await db.execute(sql`SELECT 1 FROM pg_policies WHERE schemaname = 'public'`);
    expect(policies.length).toBe(0);
  });
});

describe("seed", () => {
  it("nạp đủ Phụ lục A", async () => {
    const count = async (table: Parameters<typeof db.$count>[0]) => db.$count(table);
    expect(await count(t.products)).toBe(seedProducts.length);
    expect(await count(t.ingredients)).toBe(seedIngredients.length);
    expect(await count(t.recipeLines)).toBe(seedRecipes.length);
    expect(await count(t.zones)).toBe(seedZones.length);
    expect(await count(t.pickupPoints)).toBe(seedPickupPoints.length);
    expect(await count(t.slotTemplates)).toBe(15);
    expect(await count(t.settings)).toBe(4);
  });

  it("chạy lại không tạo trùng và không ghi đè chỉnh sửa của chủ quán", async () => {
    await db.update(t.products).set({ price: 199_000 }).where(eq(t.products.id, "pepperoni-pan"));
    await expect(seed(db, at(SAT, "09:00"))).resolves.toEqual({ days: 0, batches: 0 });
    const [p] = await db.select().from(t.products).where(eq(t.products.id, "pepperoni-pan"));
    expect(p.price).toBe(199_000);
    await db.update(t.products).set({ price: 159_000 }).where(eq(t.products.id, "pepperoni-pan"));
  });

  it("đẩy sequence lên sau khi chèn id tay", async () => {
    const [z] = await db.insert(t.zones).values({ name: "Thôn C", routeId: 3, shipFee: 15_000 }).returning();
    expect(z.id).toBe(seedZones.length + 1);
    await db.delete(t.zones).where(eq(t.zones.id, z.id));
  });

  it("settings đọc lại khớp mặc định", async () => {
    const s = await loadSettings(db);
    expect(s.ordering.daysAhead).toBe(3);
    expect(s.contact.hotline).toMatch(/^0\d{9}$/);
  });
});

describe("loadCatalog", () => {
  it("trả món đang bán theo thứ tự, ẩn món is_active = false", async () => {
    await db.update(t.products).set({ isActive: false }).where(eq(t.products.id, "bbq-2"));
    const c = await loadCatalog(db);
    await db.update(t.products).set({ isActive: true }).where(eq(t.products.id, "bbq-2"));

    expect(c.products.map((p) => p.id)).toEqual(seedProducts.filter((p) => p.id !== "bbq-2").map((p) => p.id));
    const combo = c.products[0];
    expect(combo.comboConfig?.[0].options).toEqual(["pepperoni-pan", "garlic-cheese-pan"]);
    expect(combo.upsellIds).toEqual(["sauce-garlic-butter", "sauce-bbq-smoky", "cold-brew-reu"]);
    expect(c.zones).toHaveLength(seedZones.length);
    expect(c.pickupPoints[0].giftProductId).toBe("sauce-garlic-butter");
  });
});

describe("ensureBatches", () => {
  it("seed tạo mẻ cho hôm nay + daysAhead, giờ theo VN; bỏ qua ngày lò nghỉ", async () => {
    const days = await loadServiceDays(SAT, "2026-11-10" as ISODate, db);
    // T7, CN mở; T2, T3 nghỉ → không có service_day.
    expect(days.map((d) => d.date)).toEqual(["2026-11-07", "2026-11-08"]);
    const [b17] = days[0].batches;
    expect(b17.readyAt.toISOString()).toBe("2026-11-07T10:00:00.000Z");
    expect(b17.ovenAt.toISOString()).toBe("2026-11-07T09:40:00.000Z");
    expect(b17.cutoffAt.toISOString()).toBe("2026-11-07T08:30:00.000Z");
    expect(days[0].batches.map((b) => [b.capPan, b.capBbq, b.usedPan])).toEqual([
      [4, 4, 0],
      [4, 4, 0],
      [4, 4, 0],
    ]);
  });

  it("idempotent và không tạo lại mẻ chủ quán đã xoá", async () => {
    const [first] = await db.select().from(t.batches).where(eq(t.batches.serviceDate, "2026-11-08")).limit(1);
    await db.delete(t.batches).where(eq(t.batches.id, first.id));
    await expect(ensureBatches(SAT, 4, db)).resolves.toEqual({ days: 0, batches: 0 });
    expect(await db.$count(t.batches, eq(t.batches.serviceDate, "2026-11-08"))).toBe(2);
  });

  it("chạy song song vẫn chỉ tạo mỗi ngày một lần", async () => {
    const results = await Promise.all([1, 2, 3].map(() => ensureBatches("2026-11-09" as ISODate, 7, db)));
    // T4 11, T5 12, T6 13, T7 14, CN 15 → 5 ngày × 3 mẻ, tổng qua mọi lần gọi.
    expect(results.reduce((n, r) => n + r.batches, 0)).toBe(15);
    expect(await db.$count(t.serviceDays)).toBe(7);
  });
});

describe("ràng buộc DB", () => {
  it("không cho dùng quá suất lò", async () => {
    const [b] = await db.select().from(t.batches).where(eq(t.batches.serviceDate, SAT)).limit(1);
    await expect(db.update(t.batches).set({ usedPan: 5 }).where(eq(t.batches.id, b.id))).rejects.toThrow();
  });
});

describe("getOvenStatus với dữ liệu seed", () => {
  it("10:00 T7 → open, mẻ 1 chốt 15:30, mọi mẻ còn đủ suất", async () => {
    const s = await getOvenStatus(at(SAT, "10:00"), db);
    expect(s.kind).toBe("open");
    if (s.kind !== "open") return;
    expect(s.nextCutoffAt).toBe("2026-11-07T08:30:00.000Z");
    expect(s.batchIndex).toBe(1);
    expect(s.slots.map((x) => [x.readyLabel, x.remainingPan, x.remainingBbq, x.level])).toEqual([
      ["17:00", 4, 4, "plenty"],
      ["18:00", 4, 4, "plenty"],
      ["19:00", 4, 4, "plenty"],
    ]);
    // daysAhead = 3 → T7..T3; T2/T3 nghỉ.
    expect(s.upcoming.map((d) => [d.label, d.hasCapacity])).toEqual([
      ["Tối nay", true],
      ["Mai", true],
    ]);
  });

  it("15:00 → closing_soon; 16:00 → after_cutoff, mở lại CN", async () => {
    expect((await getOvenStatus(at(SAT, "15:00"), db)).kind).toBe("closing_soon");
    const late = await getOvenStatus(at(SAT, "16:00"), db);
    expect(late).toMatchObject({ kind: "after_cutoff", nextOpenDate: "2026-11-08" });
  });

  it("T2 lò nghỉ → day_off, mở lại T4", async () => {
    const s = await getOvenStatus(at("2026-11-09" as ISODate, "10:00"), db);
    expect(s).toMatchObject({ kind: "day_off", nextOpenDate: "2026-11-11" });
  });

  it("phản ánh suất đã dùng và trạng thái tạm ngưng", async () => {
    const [b] = await db.select().from(t.batches).where(eq(t.batches.serviceDate, SAT)).limit(1);
    await db.update(t.batches).set({ usedPan: 3 }).where(eq(t.batches.id, b.id));
    const s = await getOvenStatus(at(SAT, "10:00"), db);
    expect(s.kind === "open" && s.slots[0].level).toBe("last");

    await db.update(t.serviceDays).set({ status: "paused", pauseMessage: "Lò bảo trì" }).where(eq(t.serviceDays.date, SAT));
    expect(await getOvenStatus(at(SAT, "10:00"), db)).toMatchObject({ kind: "paused", message: "Lò bảo trì" });
    await db.update(t.serviceDays).set({ status: "open", pauseMessage: null }).where(eq(t.serviceDays.date, SAT));
  });
});
