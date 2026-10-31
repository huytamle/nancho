import { describe, expect, it } from "vitest";
import { seedPickupPoints, seedZones } from "@/data/seed";
import { priceOrder, requiresPrepay, type CartLine, type FulfillmentInput } from "@/lib/domain/pricing";
import { P } from "./fixtures";

const kp2: FulfillmentInput = { type: "delivery", zone: seedZones[1] }; // 10.000đ
const quocLo: FulfillmentInput = { type: "delivery", zone: seedZones[4] }; // 15.000đ
const reu: FulfillmentInput = { type: "pickup", point: seedPickupPoints[0], giftProduct: P["sauce-garlic-butter"] };
const noFree = { freeShipFrom: null };

const combo: CartLine = {
  product: P["combo-doi"],
  qty: 1,
  comboChoices: { pizza: "pepperoni-pan", bbq: "ribs-sv" },
  addons: [{ product: P["sauce-garlic-butter"], qty: 1 }],
};
const pizza: CartLine = { product: P["garlic-cheese-pan"], qty: 1 };

describe("priceOrder", () => {
  it("giao tận nhà: phí theo khu vực", () => {
    const r = priceOrder({ lines: [combo, pizza], fulfillment: kp2, shipping: noFree });
    expect(r).toMatchObject({ ok: true, subtotal: 448_000, shipFee: 10_000, discount: 0, total: 458_000 });
    if (!r.ok) throw new Error();
    expect(r.items.map((i) => [i.productId, i.lineTotal, i.parentIndex])).toEqual([
      ["combo-doi", 289_000, null],
      ["sauce-garlic-butter", 10_000, 0],
      ["garlic-cheese-pan", 149_000, null],
    ]);
    expect(r.items[0].comboChoices).toEqual({ pizza: "pepperoni-pan", bbq: "ribs-sv" });
    expect(priceOrder({ lines: [pizza], fulfillment: quocLo, shipping: noFree })).toMatchObject({ shipFee: 15_000 });
  });

  it("freeship từ ngưỡng", () => {
    const free = { freeShipFrom: 400_000 };
    expect(priceOrder({ lines: [combo, pizza], fulfillment: kp2, shipping: free })).toMatchObject({ shipFee: 0, total: 448_000 });
    expect(priceOrder({ lines: [pizza], fulfillment: kp2, shipping: free })).toMatchObject({ shipFee: 10_000 });
  });

  it("nhận tại Rêu: không ship, thêm đúng 1 hũ quà 0đ", () => {
    const r = priceOrder({ lines: [{ ...pizza, qty: 3 }], fulfillment: reu, shipping: noFree });
    expect(r).toMatchObject({ ok: true, subtotal: 447_000, shipFee: 0, total: 447_000 });
    if (!r.ok) throw new Error();
    expect(r.items.filter((i) => i.isGift)).toEqual([
      {
        productId: "sauce-garlic-butter",
        name: P["sauce-garlic-butter"].name,
        unitPrice: 0,
        qty: 1,
        lineTotal: 0,
        comboChoices: null,
        isGift: true,
        parentIndex: null,
      },
    ]);
  });

  it("quà hết hàng hoặc không khớp điểm nhận → bỏ qua, không chặn đơn", () => {
    const soldOut = { ...P["sauce-garlic-butter"], isAvailable: false };
    const a = priceOrder({ lines: [pizza], fulfillment: { ...reu, giftProduct: soldOut }, shipping: noFree });
    const b = priceOrder({ lines: [pizza], fulfillment: { ...reu, giftProduct: P["sauce-bbq-smoky"] }, shipping: noFree });
    const c = priceOrder({ lines: [pizza], fulfillment: { type: "pickup", point: seedPickupPoints[0] }, shipping: noFree });
    for (const r of [a, b, c]) expect(r.ok && r.items.some((i) => i.isGift)).toBe(false);
  });

  it("add-on/nước kèm thêm thành dòng riêng được, nhưng chỉ khi có pizza/BBQ (M12)", () => {
    const can = { product: P["drink-pepsi"], qty: 2 };
    const r = priceOrder({ lines: [pizza, { product: P["cold-brew-reu"], qty: 2 }, can], fulfillment: kp2, shipping: noFree });
    expect(r).toMatchObject({ ok: true, subtotal: 149_000 + 36_000 + 20_000 });
    expect(priceOrder({ lines: [can], fulfillment: kp2, shipping: noFree })).toEqual({ ok: false, error: { reason: "extras_only" } });
    // Nước gắn vào combo như add-on (giá kèm, không phải giá lẻ).
    const withCans = priceOrder({ lines: [{ ...combo, addons: [{ product: P["drink-sting"], qty: 2 }] }], fulfillment: kp2, shipping: noFree });
    expect(withCans).toMatchObject({ ok: true, subtotal: 289_000 + 20_000 });
  });

  it("cà phê: không chung đơn với pizza, tối thiểu 50.000đ, chỉ giao (M12)", () => {
    const latte = { product: P["cafe-latte"], qty: 1 };
    expect(priceOrder({ lines: [latte, pizza], fulfillment: kp2, shipping: noFree })).toEqual({ ok: false, error: { reason: "mixed_segment" } });
    expect(priceOrder({ lines: [latte], fulfillment: kp2, shipping: noFree })).toEqual({ ok: false, error: { reason: "cafe_min", min: 50_000 } });
    expect(priceOrder({ lines: [{ ...latte, qty: 2 }], fulfillment: reu, shipping: noFree })).toEqual({ ok: false, error: { reason: "cafe_pickup" } });
    expect(priceOrder({ lines: [{ ...latte, qty: 2 }, { product: P["drink-pepsi"], qty: 1 }], fulfillment: kp2, shipping: noFree })).toEqual({
      ok: false,
      error: { reason: "extras_only" },
    });
    expect(priceOrder({ lines: [{ ...latte, qty: 2 }], fulfillment: kp2, shipping: noFree })).toMatchObject({ ok: true, subtotal: 78_000, total: 88_000 });
  });

  it("giảm từ mã ưu đãi: số nguyên, không âm, không vượt tạm tính (M12)", () => {
    expect(priceOrder({ lines: [pizza], fulfillment: kp2, shipping: noFree, discount: 15_000 })).toMatchObject({
      ok: true,
      subtotal: 149_000,
      discount: 15_000,
      total: 144_000,
    });
    expect(priceOrder({ lines: [pizza], fulfillment: kp2, shipping: noFree, discount: 999_999 })).toMatchObject({ discount: 149_000, total: 10_000 });
    expect(priceOrder({ lines: [pizza], fulfillment: kp2, shipping: noFree, discount: -5 })).toMatchObject({ discount: 0 });
  });

  it("từ chối số lượng không hợp lệ", () => {
    for (const qty of [0, -1, 1.5]) {
      expect(priceOrder({ lines: [{ ...pizza, qty }], fulfillment: kp2, shipping: noFree })).toEqual({
        ok: false,
        error: { reason: "invalid_qty", productId: "garlic-cheese-pan" },
      });
    }
    const badAddon = { ...combo, addons: [{ product: P["cold-brew-reu"], qty: 0 }] };
    expect(priceOrder({ lines: [badAddon], fulfillment: kp2, shipping: noFree })).toMatchObject({
      error: { reason: "invalid_qty", productId: "cold-brew-reu" },
    });
  });

  it("từ chối lựa chọn combo sai", () => {
    const cases: CartLine[] = [
      { ...combo, comboChoices: undefined },
      { ...combo, comboChoices: { pizza: "pepperoni-pan" } },
      { ...combo, comboChoices: { pizza: "ribs-sv", bbq: "ribs-sv" } },
      { ...combo, comboChoices: { pizza: "pepperoni-pan", bbq: "ribs-sv", extra: "bbq-2" } },
      { ...pizza, comboChoices: { pizza: "pepperoni-pan" } },
      { ...combo, product: { ...P["combo-doi"], comboConfig: null } },
    ];
    for (const line of cases) {
      expect(priceOrder({ lines: [line], fulfillment: kp2, shipping: noFree })).toMatchObject({
        ok: false,
        error: { reason: "invalid_combo" },
      });
    }
  });

  it("từ chối add-on không thuộc gợi ý của món cha", () => {
    const notAddon = { ...pizza, addons: [{ product: P["ribs-sv"], qty: 1 }] };
    const notUpsell = { product: { ...P["pepperoni-pan"], upsellIds: [] }, qty: 1, addons: [{ product: P["cold-brew-reu"], qty: 1 }] };
    for (const line of [notAddon, notUpsell]) {
      expect(priceOrder({ lines: [line], fulfillment: kp2, shipping: noFree })).toMatchObject({
        ok: false,
        error: { reason: "invalid_addon" },
      });
    }
  });

  it("gom mọi món hết hàng / ngừng bán", () => {
    const lines: CartLine[] = [
      { product: { ...P["pepperoni-pan"], isAvailable: false }, qty: 1, addons: [{ product: { ...P["cold-brew-reu"], isActive: false }, qty: 1 }] },
      pizza,
    ];
    expect(priceOrder({ lines, fulfillment: kp2, shipping: noFree })).toEqual({
      ok: false,
      error: { reason: "unavailable", productIds: ["pepperoni-pan", "cold-brew-reu"] },
    });
  });
});

describe("requiresPrepay", () => {
  const risk = { prepayPolicy: "risk_based", prepayOverTotal: 1_000_000 } as const;
  it("risk_based: khách từng bom hàng hoặc đơn lớn", () => {
    expect(requiresPrepay(risk, null, 458_000)).toBe(false);
    expect(requiresPrepay(risk, { noShowCount: 0 }, 999_999)).toBe(false);
    expect(requiresPrepay(risk, { noShowCount: 1 }, 100_000)).toBe(true);
    expect(requiresPrepay(risk, null, 1_000_000)).toBe(true);
  });
  it("never / always", () => {
    expect(requiresPrepay({ ...risk, prepayPolicy: "never" }, { noShowCount: 3 }, 5_000_000)).toBe(false);
    expect(requiresPrepay({ ...risk, prepayPolicy: "always" }, null, 1)).toBe(true);
  });
});
