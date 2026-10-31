import { describe, expect, it } from "vitest";
import {
  canTransition,
  customerStage,
  releasesCapacity,
  shouldAutoConfirm,
  type Actor,
  type TransitionContext,
} from "@/lib/domain/order-status";
import type { Fulfillment, OrderStatus } from "@/lib/domain/types";

const CUTOFF = new Date("2026-11-06T08:30:00Z"); // 15:30 giờ VN
const BEFORE = new Date("2026-11-06T08:00:00Z");

const owner: Actor = { type: "staff", role: "owner" };
const kitchen: Actor = { type: "staff", role: "kitchen" };
const shipper: Actor = { type: "staff", role: "shipper" };
const customer: Actor = { type: "customer" };
const system: Actor = { type: "system" };

function ctx(actor: Actor, fulfillment: Fulfillment = "delivery", over: Partial<TransitionContext> = {}): TransitionContext {
  return { actor, fulfillment, now: BEFORE, cutoffAt: CUTOFF, ...over };
}
const ok = { ok: true };
const no = (reason: string) => ({ ok: false, reason });
const t = (from: OrderStatus, to: OrderStatus, c: TransitionContext) => canTransition(from, to, c);

describe("canTransition — đồ thị trạng thái", () => {
  it("luồng giao hàng", () => {
    const path: OrderStatus[] = ["placed", "confirmed", "baking", "ready", "delivering", "completed"];
    for (let i = 0; i < path.length - 1; i++) expect(t(path[i], path[i + 1], ctx(owner))).toEqual(ok);
    expect(t("delivering", "no_show", ctx(owner))).toEqual(ok);
  });

  it("luồng nhận tại Rêu: ready → completed / no_show, không qua delivering", () => {
    expect(t("ready", "completed", ctx(owner, "pickup"))).toEqual(ok);
    expect(t("ready", "no_show", ctx(owner, "pickup"))).toEqual(ok);
    expect(t("ready", "delivering", ctx(owner, "pickup"))).toEqual(no("invalid_transition"));
    expect(t("ready", "completed", ctx(owner, "delivery"))).toEqual(no("invalid_transition"));
  });

  it("không nhảy cóc, không đi lùi, trạng thái cuối là cuối", () => {
    expect(t("placed", "baking", ctx(owner))).toEqual(no("invalid_transition"));
    expect(t("ready", "baking", ctx(owner))).toEqual(no("invalid_transition"));
    for (const end of ["completed", "cancelled", "no_show"] as OrderStatus[]) {
      expect(t(end, "cancelled", ctx(owner, "delivery", { reason: "x" }))).toEqual(no("invalid_transition"));
    }
  });
});

describe("canTransition — huỷ", () => {
  it("khách huỷ được trước giờ chốt khi bánh chưa vào lò", () => {
    expect(t("placed", "cancelled", ctx(customer))).toEqual(ok);
    expect(t("confirmed", "cancelled", ctx(customer))).toEqual(ok);
    expect(t("confirmed", "cancelled", ctx(customer, "delivery", { now: CUTOFF }))).toEqual(no("too_late"));
    expect(t("baking", "cancelled", ctx(customer))).toEqual(no("forbidden"));
  });

  it("nhân viên huỷ trước khi nướng; sau đó chỉ owner kèm lý do", () => {
    expect(t("confirmed", "cancelled", ctx(kitchen, "delivery", { now: CUTOFF }))).toEqual(ok);
    expect(t("placed", "cancelled", ctx(shipper))).toEqual(no("forbidden"));
    expect(t("baking", "cancelled", ctx(kitchen, "delivery", { reason: "x" }))).toEqual(no("forbidden"));
    expect(t("baking", "cancelled", ctx(owner))).toEqual(no("reason_required"));
    expect(t("ready", "cancelled", ctx(owner, "delivery", { reason: "  " }))).toEqual(no("reason_required"));
    expect(t("delivering", "cancelled", ctx(owner, "delivery", { reason: "Khách đổi ý" }))).toEqual(ok);
  });

  it("hệ thống không tự huỷ", () => {
    expect(t("placed", "cancelled", ctx(system))).toEqual(no("forbidden"));
  });
});

describe("canTransition — quyền", () => {
  it("khách chỉ được huỷ", () => {
    expect(t("placed", "confirmed", ctx(customer))).toEqual(no("forbidden"));
  });

  it("hệ thống chỉ tự xác nhận", () => {
    expect(t("placed", "confirmed", ctx(system))).toEqual(ok);
    expect(t("confirmed", "baking", ctx(system))).toEqual(no("forbidden"));
  });

  it("bếp: tới ra lò, và bàn giao đơn nhận tại quầy", () => {
    expect(t("placed", "confirmed", ctx(kitchen))).toEqual(ok);
    expect(t("confirmed", "baking", ctx(kitchen))).toEqual(ok);
    expect(t("baking", "ready", ctx(kitchen))).toEqual(ok);
    expect(t("ready", "delivering", ctx(kitchen))).toEqual(no("forbidden"));
    expect(t("ready", "completed", ctx(kitchen, "pickup"))).toEqual(ok);
    expect(t("ready", "no_show", ctx(kitchen, "pickup"))).toEqual(ok);
  });

  it("shipper: nhận tuyến & kết thúc đơn giao", () => {
    expect(t("ready", "delivering", ctx(shipper))).toEqual(ok);
    expect(t("delivering", "completed", ctx(shipper))).toEqual(ok);
    expect(t("delivering", "no_show", ctx(shipper))).toEqual(ok);
    expect(t("baking", "ready", ctx(shipper))).toEqual(no("forbidden"));
    expect(t("ready", "completed", ctx(shipper, "pickup"))).toEqual(no("forbidden"));
  });
});

describe("tiện ích", () => {
  it("shouldAutoConfirm", () => {
    expect(shouldAutoConfirm({ completedCount: 0, noShowCount: 0, paid: false })).toBe(false);
    expect(shouldAutoConfirm({ completedCount: 1, noShowCount: 0, paid: false })).toBe(true);
    expect(shouldAutoConfirm({ completedCount: 5, noShowCount: 1, paid: false })).toBe(false);
    expect(shouldAutoConfirm({ completedCount: 0, noShowCount: 2, paid: true })).toBe(true);
  });

  it("releasesCapacity: chỉ huỷ mới trả suất, và chỉ một lần", () => {
    expect(releasesCapacity("confirmed", "cancelled")).toBe(true);
    expect(releasesCapacity("baking", "cancelled")).toBe(true);
    expect(releasesCapacity("cancelled", "cancelled")).toBe(false);
    expect(releasesCapacity("no_show", "cancelled")).toBe(false);
    expect(releasesCapacity("delivering", "no_show")).toBe(false);
  });

  it("customerStage", () => {
    expect(customerStage("placed", "delivery")).toBe("received");
    expect(customerStage("confirmed", "pickup")).toBe("received");
    expect(customerStage("baking", "delivery")).toBe("baking");
    expect(customerStage("ready", "delivery")).toBe("ready");
    expect(customerStage("ready", "pickup")).toBe("waiting_pickup");
    expect(customerStage("delivering", "delivery")).toBe("delivering");
    expect(customerStage("completed", "pickup")).toBe("completed");
    expect(customerStage("no_show", "pickup")).toBe("no_show");
    expect(customerStage("cancelled", "delivery")).toBe("cancelled");
  });
});
