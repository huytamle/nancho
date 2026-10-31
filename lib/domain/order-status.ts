// Vòng đời đơn hàng (BLUEPRINT §7.5). Mọi action đổi trạng thái phải đi qua canTransition.
//
// placed ─▶ confirmed ─▶ baking ─▶ ready ─┬─▶ delivering ─▶ completed | no_show   (giao)
//    └──────────┴─▶ cancelled             └─▶ completed | no_show                  (nhận tại Rêu)

import type { Fulfillment, OrderStatus } from "@/lib/domain/types";

export type StaffRole = "owner" | "kitchen" | "shipper";
export type Actor = { type: "customer" } | { type: "system" } | { type: "staff"; role: StaffRole };

export type TransitionContext = {
  actor: Actor;
  fulfillment: Fulfillment;
  now: Date;
  cutoffAt: Date;
  reason?: string;
};

export type TransitionResult =
  | { ok: true }
  | { ok: false; reason: "invalid_transition" | "forbidden" | "too_late" | "reason_required" };

const FLOW: Record<OrderStatus, OrderStatus[]> = {
  placed: ["confirmed", "cancelled"],
  confirmed: ["baking", "cancelled"],
  baking: ["ready", "cancelled"],
  ready: ["delivering", "completed", "no_show", "cancelled"],
  delivering: ["completed", "no_show", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

const BEFORE_OVEN: OrderStatus[] = ["placed", "confirmed"];

function edgeExists(from: OrderStatus, to: OrderStatus, fulfillment: Fulfillment) {
  if (!FLOW[from].includes(to)) return false;
  // Giao hàng: ready → delivering → kết thúc. Nhận tại điểm: ready → kết thúc.
  if (from === "ready" && to !== "cancelled") {
    return fulfillment === "delivery" ? to === "delivering" : to !== "delivering";
  }
  return true;
}

export function canTransition(from: OrderStatus, to: OrderStatus, ctx: TransitionContext): TransitionResult {
  if (!edgeExists(from, to, ctx.fulfillment)) return { ok: false, reason: "invalid_transition" };
  const { actor } = ctx;

  if (to === "cancelled") {
    if (actor.type === "customer") {
      if (!BEFORE_OVEN.includes(from)) return { ok: false, reason: "forbidden" };
      return ctx.now < ctx.cutoffAt ? { ok: true } : { ok: false, reason: "too_late" };
    }
    if (actor.type !== "staff") return { ok: false, reason: "forbidden" };
    if (BEFORE_OVEN.includes(from)) return actor.role === "shipper" ? { ok: false, reason: "forbidden" } : { ok: true };
    // Sau khi đã nướng: chỉ owner, bắt buộc lý do.
    if (actor.role !== "owner") return { ok: false, reason: "forbidden" };
    return ctx.reason?.trim() ? { ok: true } : { ok: false, reason: "reason_required" };
  }

  switch (actor.type) {
    case "customer":
      return { ok: false, reason: "forbidden" };
    case "system":
      // Tự xác nhận (khách quen / đã thanh toán).
      return from === "placed" && to === "confirmed" ? { ok: true } : { ok: false, reason: "forbidden" };
    case "staff":
      if (actor.role === "owner") return { ok: true };
      if (actor.role === "kitchen") {
        // Bếp: tới "ra lò"; bếp đặt tại Rêu nên cũng bàn giao đơn nhận tại quầy.
        const handover = ctx.fulfillment === "pickup" && from === "ready";
        return to === "confirmed" || to === "baking" || to === "ready" || handover
          ? { ok: true }
          : { ok: false, reason: "forbidden" };
      }
      // Shipper: nhận tuyến và kết thúc đơn giao.
      return ctx.fulfillment === "delivery" && (from === "ready" || from === "delivering")
        ? { ok: true }
        : { ok: false, reason: "forbidden" };
  }
}

/** Tự chuyển placed → confirmed khi khách đáng tin hoặc đã trả tiền. */
export function shouldAutoConfirm(c: { completedCount: number; noShowCount: number; paid: boolean }): boolean {
  return c.paid || (c.completedCount >= 1 && c.noShowCount === 0);
}

/** Chỉ huỷ mới trả suất; no_show giữ nguyên vì lò đã dùng (bất biến §6.3-1). */
export function releasesCapacity(from: OrderStatus, to: OrderStatus): boolean {
  return to === "cancelled" && from !== "cancelled" && from !== "no_show";
}

export type CustomerStage =
  | "received"
  | "baking"
  | "ready"
  | "delivering"
  | "waiting_pickup"
  | "completed"
  | "cancelled"
  | "no_show";

/** Giai đoạn hiển thị cho khách; nhãn chữ nằm trong data/copy.ts. */
export function customerStage(status: OrderStatus, fulfillment: Fulfillment): CustomerStage {
  switch (status) {
    case "placed":
    case "confirmed":
      return "received";
    case "ready":
      return fulfillment === "pickup" ? "waiting_pickup" : "ready";
    default:
      return status;
  }
}
