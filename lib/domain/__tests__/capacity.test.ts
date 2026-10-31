import { describe, expect, it } from "vitest";
import { availabilityForProduct, fits, pickSlot, requirementOf, suggestSlot } from "@/lib/domain/capacity";
import { P } from "./fixtures";

const slot = (remainingPan: number, remainingBbq: number, level: "plenty" | "closed" = "plenty") => ({
  remainingPan,
  remainingBbq,
  level,
});

describe("requirementOf", () => {
  it("combo tiêu cả khay pizza lẫn phần BBQ; add-on không tốn suất", () => {
    expect(
      requirementOf([
        { product: P["combo-doi"], qty: 2 },
        { product: P["pepperoni-pan"], qty: 1 },
        { product: P["ribs-sv"], qty: 1 },
        { product: P["cold-brew-reu"], qty: 3 },
      ]),
    ).toEqual({ pan: 3, bbq: 3 });
    expect(requirementOf([])).toEqual({ pan: 0, bbq: 0 });
  });
});

describe("fits", () => {
  it("phải đủ cả hai tài nguyên", () => {
    expect(fits({ pan: 2, bbq: 1 }, slot(2, 1))).toBe(true);
    expect(fits({ pan: 3, bbq: 0 }, slot(2, 4))).toBe(false);
    expect(fits({ pan: 0, bbq: 2 }, slot(4, 1))).toBe(false);
  });
});

describe("availabilityForProduct", () => {
  it("mẻ đã chốt", () => {
    expect(availabilityForProduct(P["pepperoni-pan"], slot(4, 4, "closed"))).toEqual({ ok: false, reason: "closed" });
  });

  it("hết khay / hết BBQ", () => {
    expect(availabilityForProduct(P["pepperoni-pan"], slot(0, 4))).toEqual({ ok: false, reason: "no_pan" });
    expect(availabilityForProduct(P["ribs-sv"], slot(4, 0))).toEqual({ ok: false, reason: "no_bbq" });
    expect(availabilityForProduct(P["combo-doi"], slot(2, 0))).toEqual({ ok: false, reason: "no_bbq" });
  });

  it("số lượng tối đa theo tài nguyên khan nhất", () => {
    expect(availabilityForProduct(P["combo-doi"], slot(3, 1))).toEqual({ ok: true, maxQty: 1 });
    expect(availabilityForProduct(P["pepperoni-pan"], slot(3, 0))).toEqual({ ok: true, maxQty: 3 });
    expect(availabilityForProduct(P["cold-brew-reu"], slot(0, 0))).toEqual({ ok: true, maxQty: Infinity });
  });
});

describe("pickSlot / suggestSlot", () => {
  const s = (batchId: number, pan: number, bbq: number, level: "plenty" | "full" | "closed" | "bbq_only" = "plenty") => ({
    batchId,
    remainingPan: pan,
    remainingBbq: bbq,
    level,
  });
  const days = [{ slots: [s(1, 0, 0, "closed"), s(2, 0, 3, "bbq_only"), s(3, 0, 0, "full")] }, { slots: [s(4, 4, 4)] }];

  it("giữ mẻ đã chọn nếu còn nhận", () => {
    expect(pickSlot(days, 2, { pan: 1, bbq: 0 })?.batchId).toBe(2);
  });

  it("mẻ đã chọn đóng/kín → mẻ sớm nhất vừa đơn, rồi mẻ sớm nhất còn nhận", () => {
    expect(pickSlot(days, 1, { pan: 1, bbq: 0 })?.batchId).toBe(4);
    expect(pickSlot(days, 3, { pan: 0, bbq: 1 })?.batchId).toBe(2);
    expect(pickSlot(days, null, { pan: 9, bbq: 0 })?.batchId).toBe(2);
    expect(pickSlot([{ slots: [s(1, 0, 0, "closed")] }], null, { pan: 0, bbq: 0 })).toBeNull();
  });

  it("gợi ý mẻ khác vừa đơn", () => {
    expect(suggestSlot(days, { pan: 1, bbq: 1 }, 2)?.batchId).toBe(4);
    expect(suggestSlot(days, { pan: 0, bbq: 1 }, 2)?.batchId).toBe(4);
    expect(suggestSlot(days, { pan: 5, bbq: 0 }, null)).toBeNull();
  });
});
