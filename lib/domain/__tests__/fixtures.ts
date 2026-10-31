// Phụ lục B: Thứ Sáu 06/11/2026, 12 đơn, 3 mẻ (17/18/19h, đút lò trước 20', chốt 15:30).

import {
  seedIngredients,
  seedPickupPoints,
  seedProducts,
  seedRecipes,
  seedRoutes,
  seedZones,
} from "@/data/seed";
import { orderCode } from "@/lib/domain/order-code";
import { priceOrder, type CartLine } from "@/lib/domain/pricing";
import { vnInstant, type ISODate } from "@/lib/domain/time";
import type { Batch, OrderWithItems, PaymentMethod, PaymentStatus, Product } from "@/lib/domain/types";

export const DATE: ISODate = "2026-11-06";

export const P = Object.fromEntries(seedProducts.map((p) => [p.id, p])) as Record<string, Product>;

export function batch(id: number, ready: string, over: Partial<Batch> = {}): Batch {
  const readyAt = vnInstant(DATE, ready);
  return {
    id,
    serviceDate: DATE,
    readyAt,
    ovenAt: new Date(readyAt.getTime() - 20 * 60_000),
    cutoffAt: vnInstant(DATE, "15:30"),
    capPan: 4,
    capBbq: 4,
    usedPan: 0,
    usedBbq: 0,
    status: "open",
    ...over,
  };
}

export const batches: Batch[] = [batch(1, "17:00"), batch(2, "18:00"), batch(3, "19:00")];

const ZONE = { KP2: 2, THI_TRAN: 4, QUOC_LO: 5 } as const;
const REU = 1;

type Pay = "cod" | "ck_paid" | "ck_unpaid";
const PAY: Record<Pay, [PaymentMethod, PaymentStatus]> = {
  cod: ["cod", "unpaid"],
  ck_paid: ["transfer", "paid"],
  ck_unpaid: ["transfer", "unpaid"],
};

const main = (id: string, addons: [string, number][] = [], comboChoices?: Record<string, string>): CartLine => ({
  product: P[id],
  qty: 1,
  comboChoices,
  addons: addons.map(([a, qty]) => ({ product: P[a], qty })),
});
const combo = (pizza: string, bbq: string, addons: [string, number][] = []) => main("combo-doi", addons, { pizza, bbq });

function order(
  seq: number,
  batchId: number,
  name: string,
  where: number | "reu",
  lines: CartLine[],
  pay: Pay,
  note: string | null = null,
): OrderWithItems {
  const pickup = where === "reu";
  const priced = priceOrder({
    lines,
    fulfillment: pickup
      ? { type: "pickup", point: seedPickupPoints[0], giftProduct: P["sauce-garlic-butter"] }
      : { type: "delivery", zone: seedZones.find((z) => z.id === where)! },
    shipping: { freeShipFrom: null },
  });
  if (!priced.ok) throw new Error(`fixture #${seq}: ${priced.error.reason}`);
  const [paymentMethod, paymentStatus] = PAY[pay];
  return {
    id: `order-${seq}`,
    code: orderCode(DATE, seq),
    seq,
    serviceDate: DATE,
    batchId,
    customerName: name,
    customerPhone: `09000000${String(seq).padStart(2, "0")}`,
    fulfillment: pickup ? "pickup" : "delivery",
    zoneId: pickup ? null : where,
    pickupPointId: pickup ? REU : null,
    addressText: pickup ? null : `Nhà của ${name}`,
    lat: null,
    lng: null,
    total: priced.total,
    paymentMethod,
    paymentStatus,
    status: "confirmed",
    note,
    items: priced.items.map((i) => ({
      productId: i.productId,
      name: i.name,
      unitPrice: i.unitPrice,
      qty: i.qty,
      lineTotal: i.lineTotal,
      comboChoices: i.comboChoices,
      isGift: i.isGift,
    })),
  };
}

export const orders: OrderWithItems[] = [
  order(1, 1, "Tuấn", ZONE.KP2, [combo("pepperoni-pan", "ribs-sv", [["cold-brew-reu", 1]])], "cod"),
  order(2, 1, "Lan", ZONE.KP2, [main("pepperoni-pan", [["sauce-garlic-butter", 1]])], "ck_paid"),
  order(3, 1, "Huy", ZONE.KP2, [combo("garlic-cheese-pan", "ribs-sv")], "cod"),
  order(4, 2, "Minh", ZONE.QUOC_LO, [main("pepperoni-pan"), main("ribs-sv", [["cold-brew-reu", 1]])], "cod"),
  order(5, 2, "Hoa", ZONE.THI_TRAN, [main("garlic-cheese-pan", [["sauce-garlic-butter", 1]])], "ck_unpaid"),
  order(6, 2, "Phúc", ZONE.QUOC_LO, [main("ribs-sv", [["sauce-bbq-smoky", 1]])], "cod"),
  order(
    7,
    2,
    "Vy",
    ZONE.THI_TRAN,
    [main("garlic-cheese-pan", [["sauce-garlic-butter", 1], ["cold-brew-reu", 1]])],
    "cod",
    "Ít cay, dị ứng đậu phộng",
  ),
  order(8, 2, "Khánh", "reu", [main("pepperoni-pan")], "cod"),
  order(9, 2, "Ngọc", ZONE.THI_TRAN, [main("ribs-sv", [["sauce-bbq-smoky", 1], ["cold-brew-reu", 1]])], "ck_unpaid"),
  order(10, 3, "Dũng", "reu", [main("garlic-cheese-pan")], "cod"),
  order(11, 3, "Trang", ZONE.KP2, [main("pepperoni-pan", [["sauce-garlic-butter", 1]])], "cod"),
  order(12, 3, "Bảo", "reu", [main("ribs-sv", [["sauce-bbq-smoky", 1]])], "cod"),
];

export const catalog = {
  products: seedProducts,
  recipes: seedRecipes,
  ingredients: seedIngredients,
  zones: seedZones,
  routes: seedRoutes,
  points: seedPickupPoints,
};
