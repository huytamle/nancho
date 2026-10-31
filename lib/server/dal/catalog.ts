import "server-only";
import { asc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import type { PickupPoint, Product, Route, Zone } from "@/lib/domain/types";
import { getDb, type Executor } from "@/lib/server/db/client";
import { pickupPoints, products, routes, zones } from "@/lib/server/db/schema";

// Catalog công khai cho trang đặt món (§5.3): cache theo giờ, admin sửa món → updateTag('catalog').
// Gồm cả món `is_available = false` để UI hiện "Hết hôm nay"; món `is_active = false` bị ẩn.

export type CatalogProduct = Product & { description: string | null };

export type Catalog = {
  products: CatalogProduct[];
  routes: Route[];
  zones: Zone[];
  pickupPoints: PickupPoint[];
};

export const CATALOG_TAG = "catalog";

export async function loadCatalog(db: Executor = getDb()): Promise<Catalog> {
  const [productRows, routeRows, zoneRows, pickupRows] = await Promise.all([
    db.select().from(products).where(eq(products.isActive, true)).orderBy(asc(products.sort), asc(products.id)),
    db.select().from(routes).orderBy(asc(routes.sort), asc(routes.id)),
    db.select().from(zones).where(eq(zones.isActive, true)).orderBy(asc(zones.sort), asc(zones.id)),
    db.select().from(pickupPoints).where(eq(pickupPoints.isActive, true)).orderBy(asc(pickupPoints.id)),
  ]);
  return { products: productRows, routes: routeRows, zones: zoneRows, pickupPoints: pickupRows };
}

export async function getCatalog(): Promise<Catalog> {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  return loadCatalog();
}
