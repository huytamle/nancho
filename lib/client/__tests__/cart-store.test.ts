import { describe, expect, it } from "vitest";
import { cartReducer, EMPTY_CART, itemKey, revive } from "@/lib/client/cart-store";

const combo = { productId: "combo-doi", qty: 1, comboChoices: { pizza: "pepperoni-pan", bbq: "ribs-sv" }, addons: [] };

describe("cartReducer", () => {
  it("gộp dòng cùng món + cùng lựa chọn, tách dòng khác lựa chọn", () => {
    let s = cartReducer(EMPTY_CART, { type: "add", item: combo });
    s = cartReducer(s, { type: "add", item: { ...combo, comboChoices: { bbq: "ribs-sv", pizza: "pepperoni-pan" } } });
    expect(s.items).toHaveLength(1);
    expect(s.items[0].qty).toBe(2);
    s = cartReducer(s, { type: "add", item: { ...combo, addons: [{ productId: "sauce-bbq-smoky", qty: 1 }] } });
    expect(s.items).toHaveLength(2);
  });

  it("setQty 0 xoá dòng; placed xoá giỏ + ghi chú, giữ thông tin khách", () => {
    let s = cartReducer(EMPTY_CART, { type: "add", item: combo });
    s = cartReducer(s, { type: "draft", patch: { name: "Tuấn", note: "ít cay" } });
    s = cartReducer(s, { type: "setQty", key: s.items[0].key, qty: 3 });
    expect(s.items[0].qty).toBe(3);
    expect(cartReducer(s, { type: "setQty", key: s.items[0].key, qty: 0 }).items).toEqual([]);
    const placed = cartReducer(s, { type: "placed" });
    expect(placed.items).toEqual([]);
    expect(placed.draft).toMatchObject({ name: "Tuấn", note: "" });
  });

  it("itemKey không phụ thuộc thứ tự lựa chọn/add-on", () => {
    const a = itemKey({ productId: "x", comboChoices: { a: "1", b: "2" }, addons: [{ productId: "p", qty: 1 }, { productId: "q", qty: 1 }] });
    const b = itemKey({ productId: "x", comboChoices: { b: "2", a: "1" }, addons: [{ productId: "q", qty: 1 }, { productId: "p", qty: 1 }] });
    expect(a).toBe(b);
  });
});

describe("revive", () => {
  it("bỏ dữ liệu hỏng; giỏ của ngày đã qua bị xoá nhưng giữ thông tin khách", () => {
    expect(revive(null, "2026-11-06")).toBe(EMPTY_CART);
    expect(revive("{oops", "2026-11-06")).toBe(EMPTY_CART);
    expect(revive(JSON.stringify({ v: 2 }), "2026-11-06")).toBe(EMPTY_CART);
    const saved = { ...EMPTY_CART, items: [{ ...combo, key: "k" }], batchId: 3, serviceDate: "2026-11-05", draft: { ...EMPTY_CART.draft, phone: "0912 345 678" } };
    const old = revive(JSON.stringify(saved), "2026-11-06");
    expect(old.items).toEqual([]);
    expect(old.batchId).toBeNull();
    expect(old.draft.phone).toBe("0912 345 678");
    expect(revive(JSON.stringify(saved), "2026-11-05").items).toHaveLength(1);
  });
});

describe("segment (M12)", () => {
  it("đổi tab bỏ mẻ đã chọn; thay giỏ khi đổi cà phê ↔ pizza, giữ nháp", () => {
    let s = cartReducer({ ...EMPTY_CART, draft: { ...EMPTY_CART.draft, phone: "0912 345 678" } }, { type: "add", item: combo });
    s = cartReducer(s, { type: "selectSlot", batchId: 3, date: "2026-11-06" });
    expect(cartReducer(s, { type: "segment", segment: "pizza" })).toBe(s);
    const cafe = cartReducer(s, { type: "replace", segment: "cafe", item: { productId: "cafe-latte", qty: 2, addons: [] } });
    expect(cafe.segment).toBe("cafe");
    expect(cafe.batchId).toBeNull();
    expect(cafe.items.map((i) => i.productId)).toEqual(["cafe-latte"]);
    expect(cafe.draft.phone).toBe("0912 345 678");
    expect(cartReducer(cafe, { type: "segment", segment: "pizza" }).serviceDate).toBeNull();
  });
});
