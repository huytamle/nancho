import { describe, expect, it } from "vitest";
import { seedPickupPoints, seedZones } from "@/data/seed";
import { priceOrder, type CartLine, type FulfillmentInput } from "@/lib/domain/pricing";
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

  it("add-on mua riêng là một dòng bình thường", () => {
    const r = priceOrder({ lines: [{ product: P["cold-brew-reu"], qty: 2 }], fulfillment: kp2, shipping: noFree });
    expect(r).toMatchObject({ ok: true, subtotal: 36_000, total: 46_000 });
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
