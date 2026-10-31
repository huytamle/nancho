// Seed kho (BLUEPRINT §17.8, M10): hồ sơ kho cho nguyên liệu Phụ lục A + nguyên liệu thô & hàng bán lại mới,
// công thức sản xuất. Số liệu là placeholder — chủ quán sửa trong tab Kho (định mức, hạn dùng, từ khoá).

import type { Role } from "@/lib/domain/roles";
import type { CountClass, Formula, StockLevel } from "@/lib/domain/stock";

export type StockProfile = {
  level: StockLevel;
  trackStock: boolean;
  purchaseUnit?: string;
  purchaseFactor?: number;
  shelfLifeHours?: number;
  parLevel?: number;
  aliases: string[];
  countClass: CountClass;
  countRoles?: Role[];
};

/** Hồ sơ kho của các nguyên liệu đã có (data/seed.ts). Seed chỉ áp khi chủ quán chưa chỉnh (chưa theo dõi, chưa có từ khoá). */
export const seedStockProfiles: Record<string, StockProfile> = {
  "pan-dough": { level: "prep", trackStock: true, shelfLifeHours: 72, parLevel: 12, aliases: ["de pan", "de banh"], countClass: "A" },
  "ribs-bag": { level: "prep", trackStock: true, shelfLifeHours: 336, parLevel: 8, aliases: ["tui suon"], countClass: "A" },
  "bbq2-bag": { level: "prep", trackStock: true, shelfLifeHours: 336, parLevel: 6, aliases: ["tui bbq"], countClass: "B" },
  mozzarella: { level: "raw", trackStock: true, purchaseUnit: "kg", purchaseFactor: 1000, parLevel: 2000, aliases: ["pho mai", "phomai", "mozza"], countClass: "A" },
  pepperoni: { level: "raw", trackStock: true, purchaseUnit: "kg", purchaseFactor: 1000, parLevel: 500, aliases: [], countClass: "B" },
  "garlic-butter-base": { level: "prep", trackStock: true, shelfLifeHours: 168, parLevel: 200, aliases: ["bo toi phet"], countClass: "B" },
  "jar-garlic-butter": { level: "prep", trackStock: true, shelfLifeHours: 168, parLevel: 10, aliases: ["hu bo toi"], countClass: "B" },
  "jar-bbq-smoky": { level: "prep", trackStock: true, shelfLifeHours: 336, parLevel: 10, aliases: ["hu sot bbq"], countClass: "B" },
  "pink-ginger": { level: "goods", trackStock: false, aliases: ["gung hong"], countClass: "C" },
  "pizza-box": { level: "goods", trackStock: true, purchaseUnit: "lốc", purchaseFactor: 50, parLevel: 30, aliases: ["hop pizza"], countClass: "C" },
  "bbq-tray": { level: "goods", trackStock: true, purchaseUnit: "lốc", purchaseFactor: 50, parLevel: 30, aliases: ["khay bbq"], countClass: "C" },
  "cold-brew-bottle": { level: "goods", trackStock: true, parLevel: 6, aliases: ["cold brew"], countClass: "B", countRoles: ["kitchen", "barista"] },
};

/** Nguyên liệu mới chỉ có ở kho: đồ thô mức 1 và hàng bán lại tại quầy café. */
export const seedStockIngredients: ({ id: string; label: string; unit: string; storage: string; sort: number } & StockProfile)[] = [
  { id: "flour", label: "Bột mì", unit: "g", storage: "kệ khô", sort: 20, level: "raw", trackStock: true, purchaseUnit: "bao", purchaseFactor: 25_000, parLevel: 5000, aliases: ["bot mi", "bot"], countClass: "C" },
  { id: "yeast", label: "Men khô", unit: "g", storage: "kệ khô", sort: 21, level: "raw", trackStock: true, purchaseUnit: "gói", purchaseFactor: 500, parLevel: 100, aliases: ["men"], countClass: "C" },
  { id: "ribs-raw", label: "Sườn heo sống", unit: "g", storage: "tủ đông", sort: 22, level: "raw", trackStock: true, purchaseUnit: "kg", purchaseFactor: 1000, shelfLifeHours: 48, aliases: ["suon", "suon heo"], countClass: "A" },
  { id: "pepsi", label: "Pepsi lon", unit: "lon", storage: "quầy café", sort: 30, level: "goods", trackStock: true, purchaseUnit: "thùng", purchaseFactor: 24, parLevel: 12, aliases: ["pepsi"], countClass: "B", countRoles: ["barista"] },
  { id: "sting", label: "Sting lon", unit: "lon", storage: "quầy café", sort: 31, level: "goods", trackStock: true, purchaseUnit: "thùng", purchaseFactor: 24, parLevel: 12, aliases: ["sting"], countClass: "B", countRoles: ["barista"] },
];

/** Công thức sản xuất (placeholder): 1 mẻ bột → 6 đế; 550 g sườn sống → 1 túi sous-vide 500 g. */
export const seedFormulas: Formula[] = [
  { outputId: "pan-dough", outputQty: 6, lines: [{ ingredientId: "flour", qty: 1500 }, { ingredientId: "yeast", qty: 15 }] },
  { outputId: "ribs-bag", outputQty: 1, lines: [{ ingredientId: "ribs-raw", qty: 550 }] },
];
