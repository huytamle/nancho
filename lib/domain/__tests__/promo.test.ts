import { describe, expect, it } from "vitest";
import { checkReferral, checkVoucher, makeCode, normalizeCode, pointsFor, PROMO, tierOf, type VoucherLike } from "@/lib/domain/promo";

const now = new Date("2026-11-06T03:00:00Z");
const v = (over: Partial<VoucherLike> = {}): VoucherLike => ({
  kind: "review",
  amount: 10_000,
  minSubtotal: 100_000,
  expiresAt: new Date("2026-11-20T00:00:00Z"),
  usedOrderId: null,
  ...over,
});

describe("checkVoucher", () => {
  it("hợp lệ → giảm đúng số tiền, không vượt tạm tính", () => {
    expect(checkVoucher(v(), { subtotal: 149_000, now, firstOrder: false })).toEqual({ ok: true, amount: 10_000 });
    expect(checkVoucher(v({ amount: 50_000, minSubtotal: 0 }), { subtotal: 30_000, now, firstOrder: false })).toEqual({ ok: true, amount: 30_000 });
  });
  it("đã dùng / hết hạn / chưa đủ tối thiểu", () => {
    expect(checkVoucher(v({ usedOrderId: "x" }), { subtotal: 200_000, now, firstOrder: false })).toEqual({ ok: false, reason: "used" });
    expect(checkVoucher(v({ expiresAt: now }), { subtotal: 200_000, now, firstOrder: false })).toEqual({ ok: false, reason: "expired" });
    expect(checkVoucher(v(), { subtotal: 99_999, now, firstOrder: false })).toEqual({ ok: false, reason: "min_subtotal", minSubtotal: 100_000 });
  });
  it("quà chào mừng chỉ cho đơn đầu tiên của SĐT", () => {
    const w = v({ kind: "welcome", amount: PROMO.welcome.amount, minSubtotal: PROMO.welcome.minSubtotal });
    expect(checkVoucher(w, { subtotal: 159_000, now, firstOrder: false })).toEqual({ ok: false, reason: "first_order_only" });
    expect(checkVoucher(w, { subtotal: 159_000, now, firstOrder: true })).toEqual({ ok: true, amount: 15_000 });
  });
});

describe("checkReferral", () => {
  it("bạn mới, đơn đầu, đủ tối thiểu", () => {
    expect(checkReferral({ subtotal: 159_000, firstOrder: true, ownCode: false })).toEqual({ ok: true, amount: 20_000 });
    expect(checkReferral({ subtotal: 159_000, firstOrder: false, ownCode: false })).toEqual({ ok: false, reason: "first_order_only" });
    expect(checkReferral({ subtotal: 159_000, firstOrder: true, ownCode: true })).toEqual({ ok: false, reason: "own_code" });
    expect(checkReferral({ subtotal: 100_000, firstOrder: true, ownCode: false })).toMatchObject({ ok: false, reason: "min_subtotal" });
  });
});

describe("điểm & hạng", () => {
  it("1 điểm / 10.000đ, làm tròn xuống", () => {
    expect(pointsFor(169_000)).toBe(16);
    expect(pointsFor(9_999)).toBe(0);
    expect(pointsFor(-1)).toBe(0);
  });
  it("hạng theo điểm từng tích", () => {
    expect(tierOf(0)).toMatchObject({ tier: { key: "ember" }, next: { key: "flame" }, toNext: 100 });
    expect(tierOf(120)).toMatchObject({ tier: { key: "flame" }, toNext: 180 });
    expect(tierOf(999)).toMatchObject({ tier: { key: "blaze" }, next: null, toNext: 0 });
  });
});

describe("mã", () => {
  it("chuẩn hoá & sinh mã không có ký tự dễ nhầm", () => {
    expect(normalizeCode(" heat-ab 12 ")).toBe("HEATAB12");
    let i = 0;
    const code = makeCode("TH", 6, () => i++ * 37);
    expect(code).toMatch(/^TH[2-9A-HJKMNP-Z]{6}$/);
  });
});
