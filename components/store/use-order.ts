"use client";

import { useCatalog, type StoreProduct } from "@/components/store/store-provider";
import { copy } from "@/data/copy";
import { useCart, dispatch, getCart, type CartItem } from "@/lib/client/cart-store";
import { useOven } from "@/lib/client/oven-store";
import { showToast } from "@/lib/client/toast-store";
import { availabilityForProduct, pickSlot, requirementOf, type Requirement } from "@/lib/domain/capacity";
import type { DaySlots, SlotView } from "@/lib/domain/oven-status";
import { isExtra, segmentOf, type Segment } from "@/lib/domain/types";

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

  // Segment của đơn: theo món chính trong giỏ; giỏ trống thì theo tab đang xem (M12).
  const main = lines.find((l) => !isExtra(l.product.kind));
  const segment: Segment = main ? segmentOf(main.product.kind) : cart.segment;
  const req = requirementOf(lines.map((l) => ({ product: l.product, qty: l.item.qty })));
  const days = (segment === "cafe" ? snap?.cafe : snap?.days) ?? [];
  const slot = pickSlot(days, cart.batchId, req);
  const day = slot ? days.find((d) => d.date === slot.date) ?? null : null;
  const count = lines.reduce((n, l) => n + l.item.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

  return { cart, snap, days, lines, req, slot, day, count, subtotal, segment };
}

/** Segment giỏ hiện tại (đọc ngoài React). */
function cartSegment(byId: Map<string, { kind: StoreProduct["kind"] }>): Segment | null {
  const main = getCart().items.map((i) => byId.get(i.productId)).find((p) => p && !isExtra(p.kind));
  return main ? segmentOf(main.kind) : null;
}

/**
 * Thêm món vào giỏ. Cà phê và pizza không chung đơn → thêm món khác segment sẽ thay giỏ (có Hoàn tác).
 * Trả về true nếu đã thay giỏ.
 */
export function addToCart(product: StoreProduct, item: Omit<CartItem, "key">, byId: Map<string, StoreProduct>): boolean {
  const before = getCart();
  const current = cartSegment(byId);
  const next = isExtra(product.kind) ? (current ?? before.segment) : segmentOf(product.kind);
  const replace = current !== null && current !== next;
  if (replace) dispatch({ type: "replace", segment: next, item });
  else {
    if (before.segment !== next) dispatch({ type: "segment", segment: next });
    dispatch({ type: "add", item });
  }
  navigator.vibrate?.(8);
  showToast(replace ? copy.product.replaced(product.short, next) : `${copy.product.added} ${product.short}`, {
    label: copy.product.undo,
    run: () => dispatch({ type: "restore", state: before }),
  });
  return replace;
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
