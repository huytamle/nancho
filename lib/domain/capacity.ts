// Suất tính theo tài nguyên lò: khay pizza (pan) và phần BBQ (bbq) — BLUEPRINT §7.3.
// Giữ suất thật nằm ở câu UPDATE nguyên tử phía server; file này để hiển thị & kiểm tra trước.

import type { SlotView } from "@/lib/domain/oven-status";
import type { Product } from "@/lib/domain/types";

export type Requirement = { pan: number; bbq: number };

export function requirementOf(lines: { product: Pick<Product, "usesPan" | "usesBbq">; qty: number }[]): Requirement {
  return lines.reduce(
    (req, { product, qty }) => ({ pan: req.pan + product.usesPan * qty, bbq: req.bbq + product.usesBbq * qty }),
    { pan: 0, bbq: 0 },
  );
}

export function fits(req: Requirement, slot: Pick<SlotView, "remainingPan" | "remainingBbq">): boolean {
  return req.pan <= slot.remainingPan && req.bbq <= slot.remainingBbq;
}

/** Món này còn đặt được ở mẻ này không, tối đa bao nhiêu. Add-on không tốn suất → maxQty = Infinity. */
export function availabilityForProduct(
  product: Pick<Product, "usesPan" | "usesBbq">,
  slot: Pick<SlotView, "remainingPan" | "remainingBbq" | "level">,
): { ok: true; maxQty: number } | { ok: false; reason: "no_pan" | "no_bbq" | "closed" } {
  if (slot.level === "closed") return { ok: false, reason: "closed" };
  if (product.usesPan > 0 && slot.remainingPan < product.usesPan) return { ok: false, reason: "no_pan" };
  if (product.usesBbq > 0 && slot.remainingBbq < product.usesBbq) return { ok: false, reason: "no_bbq" };
  const byPan = product.usesPan > 0 ? Math.floor(slot.remainingPan / product.usesPan) : Infinity;
  const byBbq = product.usesBbq > 0 ? Math.floor(slot.remainingBbq / product.usesBbq) : Infinity;
  return { ok: true, maxQty: Math.min(byPan, byBbq) };
}
