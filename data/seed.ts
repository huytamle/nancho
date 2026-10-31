// Seed mặc định = BLUEPRINT Phụ lục A. Dùng chung cho test domain (M1) và `db:seed` (M2).
// Giá & thực đơn ✅ đã chốt; định lượng, khu vực, phí ship là placeholder chờ chủ quán.

import type { Ingredient, PickupPoint, Product, RecipeLine, Route, Zone } from "@/lib/domain/types";

const ADDONS = ["sauce-garlic-butter", "sauce-bbq-smoky", "cold-brew-reu"];

function product(p: Omit<Product, "badge" | "comboConfig" | "upsellIds" | "supplier" | "isActive" | "isAvailable"> & Partial<Product>): Product {
  return {
    badge: null,
    comboConfig: null,
    upsellIds: p.kind === "addon" ? [] : ADDONS,
    supplier: null,
    isActive: true,
    isAvailable: true,
    ...p,
  };
}

export const seedProducts: Product[] = [
  product({
    id: "combo-doi",
    kind: "combo",
    name: "Combo Đôi — 1 Pan Pizza + 1 BBQ",
    short: "Pizza + BBQ, đủ cho hai người",
    price: 289_000,
    image: "/images/menu/pan-bbq.jpg",
    badge: "Bán chạy",
    usesPan: 1,
    usesBbq: 1,
    comboConfig: [
      { key: "pizza", label: "Chọn pizza", options: ["pepperoni-pan", "garlic-cheese-pan"] },
      { key: "bbq", label: "Chọn BBQ", options: ["ribs-sv", "bbq-2"] },
    ],
    sort: 1,
  }),
  product({
    id: "pepperoni-pan",
    kind: "pizza",
    name: "Pan Pizza Pepperoni",
    short: "Viền phô mai cháy, pepperoni cuộn mép",
    price: 159_000,
    image: "/images/pizza/346-American-Style-Pizza_carrousel03.jpg",
    usesPan: 1,
    usesBbq: 0,
    sort: 2,
  }),
  product({
    id: "garlic-cheese-pan",
    kind: "pizza",
    name: "Pan Pizza Phô mai Bơ tỏi",
    short: "Phô mai kéo sợi, bơ tỏi thơm",
    price: 149_000,
    image: "/images/menu/pan-margherita.jpg",
    usesPan: 1,
    usesBbq: 0,
    sort: 3,
  }),
  product({
    id: "ribs-sv",
    kind: "bbq",
    name: "Sườn heo BBQ Sous-vide 24h",
    short: "Mềm rời xương, sốt BBQ khói",
    price: 169_000,
    image: "/images/menu/bbq-ribs.jpg",
    usesPan: 0,
    usesBbq: 1,
    sort: 4,
  }),
  product({
    id: "bbq-2",
    kind: "bbq",
    name: "BBQ #2",
    short: "Chủ quán đặt tên",
    price: 149_000,
    image: "/images/menu/bbq-thigh.jpg",
    usesPan: 0,
    usesBbq: 1,
    sort: 5,
  }),
  product({
    id: "sauce-garlic-butter",
    kind: "addon",
    name: "Hũ Sốt Bơ Tỏi chấm viền bánh",
    short: "Chấm viền bánh",
    price: 10_000,
    image: "/images/menu/sauce-cheddar.jpg",
    usesPan: 0,
    usesBbq: 0,
    sort: 6,
  }),
  product({
    id: "sauce-bbq-smoky",
    kind: "addon",
    name: "Hũ Sốt BBQ khói",
    short: "Đậm khói, hợp sườn",
    price: 10_000,
    image: "/images/menu/sauce-bbq.jpg",
    usesPan: 0,
    usesBbq: 0,
    sort: 7,
  }),
  product({
    id: "cold-brew-reu",
    kind: "addon",
    name: "Chai Cà phê ủ lạnh Rêu",
    short: "Cold brew của Rêu",
    price: 18_000,
    image: "/images/menu/cold-brew.jpg",
    usesPan: 0,
    usesBbq: 0,
    supplier: "reu",
    sort: 8,
  }),
];

export const seedIngredients: Ingredient[] = [
  { id: "pan-dough", label: "Đế Pan đã ủ", unit: "đế", unitWeightG: null, storage: "tủ mát", sort: 1 },
  { id: "ribs-bag", label: "Túi sườn sous-vide", unit: "túi", unitWeightG: 500, storage: "tủ đông", sort: 2 },
  { id: "bbq2-bag", label: "Túi BBQ #2", unit: "túi", unitWeightG: null, storage: "tủ đông", sort: 3 },
  { id: "mozzarella", label: "Mozzarella", unit: "g", unitWeightG: null, storage: "tủ mát", sort: 4 },
  { id: "pepperoni", label: "Pepperoni lát", unit: "g", unitWeightG: null, storage: "tủ mát", sort: 5 },
  { id: "garlic-butter-base", label: "Bơ tỏi phết", unit: "g", unitWeightG: null, storage: "tủ mát", sort: 6 },
  { id: "jar-garlic-butter", label: "Hũ Sốt Bơ Tỏi", unit: "hũ", unitWeightG: null, storage: "tủ mát", sort: 7 },
  { id: "jar-bbq-smoky", label: "Hũ Sốt BBQ khói", unit: "hũ", unitWeightG: null, storage: "tủ mát", sort: 8 },
  { id: "pink-ginger", label: "Gừng hồng muối", unit: "phần", unitWeightG: null, storage: "tủ mát", sort: 9 },
  { id: "pizza-box", label: "Hộp pizza", unit: "hộp", unitWeightG: null, storage: "kệ", sort: 10 },
  { id: "bbq-tray", label: "Khay BBQ", unit: "khay", unitWeightG: null, storage: "kệ", sort: 11 },
  { id: "cold-brew-bottle", label: "Cold brew Rêu", unit: "chai", unitWeightG: null, storage: "quầy Rêu", sort: 12 },
];

const r = (productId: string, ingredientId: string, qty: number): RecipeLine => ({ productId, ingredientId, qty });

// Combo không có BOM riêng — được "nổ" thành món thành phần khi tính Prep.
export const seedRecipes: RecipeLine[] = [
  r("pepperoni-pan", "pan-dough", 1),
  r("pepperoni-pan", "mozzarella", 180),
  r("pepperoni-pan", "pepperoni", 60),
  r("pepperoni-pan", "pink-ginger", 1),
  r("pepperoni-pan", "pizza-box", 1),
  r("garlic-cheese-pan", "pan-dough", 1),
  r("garlic-cheese-pan", "mozzarella", 180),
  r("garlic-cheese-pan", "garlic-butter-base", 40),
  r("garlic-cheese-pan", "pink-ginger", 1),
  r("garlic-cheese-pan", "pizza-box", 1),
  r("ribs-sv", "ribs-bag", 1),
  r("ribs-sv", "pink-ginger", 1),
  r("ribs-sv", "bbq-tray", 1),
  r("bbq-2", "bbq2-bag", 1),
  r("bbq-2", "pink-ginger", 1),
  r("bbq-2", "bbq-tray", 1),
  r("sauce-garlic-butter", "jar-garlic-butter", 1),
  r("sauce-bbq-smoky", "jar-bbq-smoky", 1),
  r("cold-brew-reu", "cold-brew-bottle", 1),
];

export const seedRoutes: Route[] = [
  { id: 1, name: "Tuyến Khu phố 2", sort: 1 },
  { id: 2, name: "Tuyến Quốc lộ / Thị trấn", sort: 2 },
  { id: 3, name: "Tuyến Thôn", sort: 3 },
];

export const seedZones: Zone[] = [
  { id: 1, name: "Khu phố 1", routeId: 1, shipFee: 10_000, sort: 1, isActive: true },
  { id: 2, name: "Khu phố 2", routeId: 1, shipFee: 10_000, sort: 2, isActive: true },
  { id: 3, name: "Khu phố 3", routeId: 1, shipFee: 10_000, sort: 3, isActive: true },
  { id: 4, name: "Thị trấn (trung tâm)", routeId: 2, shipFee: 10_000, sort: 4, isActive: true },
  { id: 5, name: "Dọc Quốc lộ 1A", routeId: 2, shipFee: 15_000, sort: 5, isActive: true },
  { id: 6, name: "Thôn A", routeId: 3, shipFee: 15_000, sort: 6, isActive: true },
  { id: 7, name: "Thôn B", routeId: 3, shipFee: 15_000, sort: 7, isActive: true },
];

export const seedPickupPoints: PickupPoint[] = [
  {
    id: 1,
    name: "Cà phê Rêu",
    address: "TODO: địa chỉ Cà phê Rêu",
    mapsUrl: null,
    giftProductId: "sauce-garlic-butter",
    isActive: true,
  },
];

/** Lịch mẫu: T4–CN (0 = CN), mẻ 17/18/19h, đút lò trước 20 phút, chốt 15:30, 4 khay + 4 BBQ. */
export const seedSlotTemplate = {
  weekdays: [3, 4, 5, 6, 0] as const,
  readyTimes: ["17:00", "18:00", "19:00"] as const,
  ovenLeadMin: 20,
  cutoffTime: "15:30",
  capPan: 4,
  capBbq: 4,
};
