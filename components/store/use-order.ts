"use client";

import { useCatalog, type StoreProduct } from "@/components/store/store-provider";
import { copy } from "@/data/copy";
import { useCart, dispatch, type CartItem } from "@/lib/client/cart-store";
import { useOven } from "@/lib/client/oven-store";
import { showToast } from "@/lib/client/toast-store";
import { availabilityForProduct, pickSlot, requirementOf, type Requirement } from "@/lib/domain/capacity";
import type { DaySlots, SlotView } from "@/lib/domain/oven-status";

export type OrderLine = {
  item: CartItem;
  product: StoreProduct;
  addons: { product: StoreProduct; qty: number }[];
  lineTotal: number;
};

/** Trạng thái đơn đang soạn: dòng giỏ + mẻ đang chọn + suất còn lại sau khi trừ giỏ. */
export function useOrder() {
  const cart = useCart();
  const { snap } = useOven();
  const { byId } = useCatalog();

  const lines: OrderLine[] = cart.items.flatMap((item) => {
    const product = byId.get(item.productId);
    if (!product) return [];
    const addons = item.addons.flatMap((a) => {
      const p = byId.get(a.productId);
      return p ? [{ product: p, qty: a.qty }] : [];
    });
    const lineTotal = product.price * item.qty + addons.reduce((s, a) => s + a.product.price * a.qty, 0);
    return [{ item, product, addons, lineTotal }];
  });

  const req = requirementOf(lines.map((l) => ({ product: l.product, qty: l.item.qty })));
  const days = snap?.days ?? [];
  const slot = pickSlot(days, cart.batchId, req);
  const day = slot ? days.find((d) => d.date === slot.date) ?? null : null;
  const count = lines.reduce((n, l) => n + l.item.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

  return { cart, snap, days, lines, req, slot, day, count, subtotal };
}

/** Suất còn lại ở `slot` sau khi trừ phần giỏ đã chiếm. */
export function remainingAfter(slot: SlotView, req: Requirement): SlotView {
  return { ...slot, remainingPan: Math.max(0, slot.remainingPan - req.pan), remainingBbq: Math.max(0, slot.remainingBbq - req.bbq) };
}

export function productAvailability(product: StoreProduct, slot: SlotView | null, req: Requirement) {
  if (!product.isAvailable) return { ok: false as const, reason: "sold_out" as const };
  if (!slot) return { ok: false as const, reason: "closed" as const };
  return availabilityForProduct(product, remainingAfter(slot, req));
}

export function dayOf(days: DaySlots[], slot: SlotView | null) {
  return slot ? days.find((d) => d.date === slot.date) ?? null : null;
}

export function chooseSlot(slot: SlotView, opts: { toast?: boolean } = {}) {
  dispatch({ type: "selectSlot", batchId: slot.batchId, date: slot.date });
  navigator.vibrate?.(8);
  if (opts.toast !== false) showToast(copy.oven.pickedToast(slot.readyLabel));
}
