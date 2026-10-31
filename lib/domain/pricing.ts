// Tính tiền đơn hàng phía server (BLUEPRINT §7.4). Client chỉ gửi ý định; giá luôn tính lại ở đây.

import type { PickupPoint, Product, ShippingSettings, Zone } from "@/lib/domain/types";

export type CartLine = {
  product: Product;
  qty: number;
  comboChoices?: Record<string, string>;
  addons?: { product: Product; qty: number }[];
};

export type PricedItem = {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
  lineTotal: number;
  comboChoices: Record<string, string> | null;
  isGift: boolean;
  /** Chỉ số dòng món chính mà add-on gắn vào (hiển thị thụt lề). */
  parentIndex: number | null;
};

export type PricingError =
  | { reason: "invalid_qty"; productId: string }
  | { reason: "invalid_combo"; productId: string }
  | { reason: "invalid_addon"; productId: string }
  | { reason: "unavailable"; productIds: string[] };

export type PriceResult =
  | { ok: true; items: PricedItem[]; subtotal: number; shipFee: number; discount: number; total: number }
  | { ok: false; error: PricingError };

export type FulfillmentInput =
  | { type: "delivery"; zone: Pick<Zone, "shipFee"> }
  | { type: "pickup"; point: Pick<PickupPoint, "giftProductId">; giftProduct?: Product };

const validQty = (qty: number) => Number.isInteger(qty) && qty >= 1;
const sellable = (p: Product) => p.isActive && p.isAvailable;

function validCombo(product: Product, choices: Record<string, string> | undefined): boolean {
  const groups = product.comboConfig ?? [];
  if (groups.length === 0 || !choices) return false;
  if (Object.keys(choices).length !== groups.length) return false;
  return groups.every((g) => g.options.includes(choices[g.key]));
}

export function priceOrder(input: {
  lines: CartLine[];
  fulfillment: FulfillmentInput;
  shipping: ShippingSettings;
}): PriceResult {
  const items: PricedItem[] = [];
  const unavailable = new Set<string>();

  for (const line of input.lines) {
    const { product } = line;
    if (!validQty(line.qty)) return { ok: false, error: { reason: "invalid_qty", productId: product.id } };
    if (!sellable(product)) unavailable.add(product.id);

    const isCombo = product.kind === "combo";
    if (isCombo !== (line.comboChoices !== undefined) || (isCombo && !validCombo(product, line.comboChoices))) {
      return { ok: false, error: { reason: "invalid_combo", productId: product.id } };
    }

    const parentIndex = items.length;
    items.push({
      productId: product.id,
      name: product.name,
      unitPrice: product.price,
      qty: line.qty,
      lineTotal: product.price * line.qty,
      comboChoices: isCombo ? { ...line.comboChoices! } : null,
      isGift: false,
      parentIndex: null,
    });

    for (const addon of line.addons ?? []) {
      const a = addon.product;
      if (a.kind !== "addon" || !product.upsellIds.includes(a.id)) {
        return { ok: false, error: { reason: "invalid_addon", productId: a.id } };
      }
      if (!validQty(addon.qty)) return { ok: false, error: { reason: "invalid_qty", productId: a.id } };
      if (!sellable(a)) unavailable.add(a.id);
      items.push({
        productId: a.id,
        name: a.name,
        unitPrice: a.price,
        qty: addon.qty,
        lineTotal: a.price * addon.qty,
        comboChoices: null,
        isGift: false,
        parentIndex,
      });
    }
  }

  if (unavailable.size > 0) return { ok: false, error: { reason: "unavailable", productIds: [...unavailable] } };

  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const f = input.fulfillment;
  let shipFee = 0;

  if (f.type === "delivery") {
    const free = input.shipping.freeShipFrom;
    shipFee = free !== null && subtotal >= free ? 0 : f.zone.shipFee;
  } else if (f.giftProduct && f.giftProduct.id === f.point.giftProductId && sellable(f.giftProduct)) {
    // Quà nhận tại điểm: 1 dòng/đơn, giá 0 — vẫn tính vào Prep. Hết hàng thì bỏ qua, không chặn đơn.
    items.push({
      productId: f.giftProduct.id,
      name: f.giftProduct.name,
      unitPrice: 0,
      qty: 1,
      lineTotal: 0,
      comboChoices: null,
      isGift: true,
      parentIndex: null,
    });
  }

  const discount = 0;
  return { ok: true, items, subtotal, shipFee, discount, total: Math.max(0, subtotal + shipFee - discount) };
}
