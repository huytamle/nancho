// Tính tiền đơn hàng phía server (BLUEPRINT §7.4). Client chỉ gửi ý định; giá luôn tính lại ở đây.

import { isExtra, segmentOf, type PaymentSettings, type PickupPoint, type Product, type ShippingSettings, type Zone } from "@/lib/domain/types";

/** Đơn cà phê ship tối thiểu (≈ 2 ly) — dưới mức này phí ship ăn hết lời của một ly (M12). */
export const CAFE_MIN_SUBTOTAL = 50_000;

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
  | { reason: "unavailable"; productIds: string[] }
  /** Sốt/nước kèm chỉ bán cùng pizza/BBQ. */
  | { reason: "extras_only" }
  /** Cà phê (giao theo khung trong ngày) và pizza (theo mẻ T6–CN) không chung một đơn. */
  | { reason: "mixed_segment" }
  | { reason: "cafe_min"; min: number }
  | { reason: "cafe_pickup" };

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
  /** Giảm từ mã ưu đãi đã được server kiểm tra (M12); bị chặn trên bởi tạm tính. */
  discount?: number;
}): PriceResult {
  const items: PricedItem[] = [];
  const mains = input.lines.filter((l) => !isExtra(l.product.kind));
  const segments = new Set(mains.map((l) => segmentOf(l.product.kind)));
  if (segments.size > 1) return { ok: false, error: { reason: "mixed_segment" } };
  const cafe = segments.has("cafe");
  if (input.lines.length > 0 && (mains.length === 0 || (cafe && mains.length < input.lines.length))) {
    return { ok: false, error: { reason: "extras_only" } };
  }
  if (cafe && input.fulfillment.type === "pickup") return { ok: false, error: { reason: "cafe_pickup" } };
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
      if (!isExtra(a.kind) || !product.upsellIds.includes(a.id)) {
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
  if (cafe && subtotal < CAFE_MIN_SUBTOTAL) return { ok: false, error: { reason: "cafe_min", min: CAFE_MIN_SUBTOTAL } };
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

  const discount = Math.max(0, Math.min(Math.trunc(input.discount ?? 0), subtotal));
  return { ok: true, items, subtotal, shipFee, discount, total: Math.max(0, subtotal + shipFee - discount) };
}

/**
 * Trả trước theo rủi ro (§16-7): `risk_based` → khách từng bom hàng hoặc đơn ≥ `prepayOverTotal`.
 * Khách mới/khách quen đặt COD bình thường.
 */
export function requiresPrepay(
  policy: Pick<PaymentSettings, "prepayPolicy" | "prepayOverTotal">,
  customer: { noShowCount: number } | null,
  total: number,
): boolean {
  if (policy.prepayPolicy === "never") return false;
  if (policy.prepayPolicy === "always") return true;
  return (customer?.noShowCount ?? 0) > 0 || total >= policy.prepayOverTotal;
}
