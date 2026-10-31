"use client";

import { createContext, use, type ReactNode } from "react";
import type { PickupPoint, Product, Zone } from "@/lib/domain/types";

// Catalog (đã cache ở server) đưa xuống client một lần cho tile, sheet, giỏ. Giá chỉ để hiển thị — server tính lại.

export type StoreProduct = Product & { description: string | null };
export type StoreCatalog = { products: StoreProduct[]; zones: Zone[]; pickup: PickupPoint | null };

const Ctx = createContext<(StoreCatalog & { byId: Map<string, StoreProduct> }) | null>(null);

export function StoreProvider({ catalog, children }: { catalog: StoreCatalog; children: ReactNode }) {
  const value = { ...catalog, byId: new Map(catalog.products.map((p) => [p.id, p])) };
  return <Ctx value={value}>{children}</Ctx>;
}

export function useCatalog() {
  const c = use(Ctx);
  if (!c) throw new Error("useCatalog ngoài StoreProvider");
  return c;
}
