// Giỏ hàng + nháp "Chốt đơn" (§9.7): reducer thuần + store ngoài React, lưu localStorage `th_cart_v1`.
// Không dùng Context/Zustand: useSyncExternalStore đủ cho vài chục dòng dữ liệu (§5.2).

import { useSyncExternalStore } from "react";
import { vnDateOf, type ISODate } from "@/lib/domain/time";
import { track } from "@/lib/client/analytics";
import type { Segment } from "@/lib/domain/types";

export type CartAddon = { productId: string; qty: number };
export type CartItem = {
  key: string;
  productId: string;
  qty: number;
  comboChoices?: Record<string, string>;
  addons: CartAddon[];
};

export type Draft = {
  phone: string;
  name: string;
  fulfillment: "delivery" | "pickup";
  zoneId: number | null;
  addressText: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  paymentMethod: "cod" | "transfer";
  note: string;
  remember: boolean;
  /** Mã ưu đãi/giới thiệu khách nhập (M12) — server kiểm tra lại khi đặt. */
  promo: string;
};

export type CartState = {
  v: 1;
  items: CartItem[];
  batchId: number | null;
  serviceDate: ISODate | null;
  /** Tab thực đơn đang xem (M12): pizza theo mẻ T6–CN, cà phê theo khung giao trong ngày. */
  segment: Segment;
  draft: Draft;
};

export type CartAction =
  | { type: "add"; item: Omit<CartItem, "key"> }
  | { type: "setQty"; key: string; qty: number }
  | { type: "restore"; state: CartState }
  | { type: "selectSlot"; batchId: number; date: ISODate }
  | { type: "segment"; segment: Segment }
  /** Đổi giỏ sang segment khác (cà phê ↔ pizza không chung đơn): bỏ món cũ, giữ nháp. */
  | { type: "replace"; segment: Segment; item: Omit<CartItem, "key"> }
  | { type: "draft"; patch: Partial<Draft> }
  | { type: "placed" };

const STORAGE_KEY = "th_cart_v1";

export const EMPTY_CART: CartState = {
  v: 1,
  items: [],
  batchId: null,
  serviceDate: null,
  segment: "pizza",
  draft: {
    phone: "",
    name: "",
    fulfillment: "delivery",
    zoneId: null,
    addressText: "",
    lat: null,
    lng: null,
    accuracy: null,
    paymentMethod: "cod",
    note: "",
    remember: false,
    promo: "",
  },
};

/** Cùng món + cùng lựa chọn combo + cùng add-on → gộp một dòng. */
export function itemKey(item: Omit<CartItem, "key" | "qty">): string {
  const choices = Object.entries(item.comboChoices ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  const addons = item.addons
    .map((a) => `${a.productId}*${a.qty}`)
    .sort()
    .join(",");
  return `${item.productId}|${choices}|${addons}`;
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "add": {
      const key = itemKey(action.item);
      const existing = state.items.find((i) => i.key === key);
      const items = existing
        ? state.items.map((i) => (i.key === key ? { ...i, qty: i.qty + action.item.qty } : i))
        : [...state.items, { ...action.item, key }];
      return { ...state, items };
    }
    case "setQty":
      return {
        ...state,
        items:
          action.qty <= 0
            ? state.items.filter((i) => i.key !== action.key)
            : state.items.map((i) => (i.key === action.key ? { ...i, qty: action.qty } : i)),
      };
    case "restore":
      return action.state;
    case "selectSlot":
      return { ...state, batchId: action.batchId, serviceDate: action.date };
    case "segment":
      return action.segment === state.segment ? state : { ...state, segment: action.segment, batchId: null, serviceDate: null };
    case "replace":
      return { ...state, segment: action.segment, batchId: null, serviceDate: null, items: [{ ...action.item, key: itemKey(action.item) }] };
    case "draft":
      return { ...state, draft: { ...state.draft, ...action.patch } };
    case "placed":
      return { ...state, items: [], draft: { ...state.draft, note: "", promo: "" } };
  }
}

/** Đọc nháp đã lưu; bỏ nếu hỏng hoặc ngày phục vụ đã qua. */
export function revive(raw: string | null, today: ISODate): CartState {
  if (!raw) return EMPTY_CART;
  try {
    const s = JSON.parse(raw) as CartState;
    if (s?.v !== 1 || !Array.isArray(s.items)) return EMPTY_CART;
    const draft = { ...EMPTY_CART.draft, ...s.draft };
    if (s.serviceDate && s.serviceDate < today) return { ...EMPTY_CART, draft: { ...draft, note: "" } };
    return { ...EMPTY_CART, ...s, draft };
  } catch {
    return EMPTY_CART;
  }
}

let state: CartState | null = null;
const listeners = new Set<() => void>();

function current(): CartState {
  if (state === null) {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {}
    state = revive(raw, vnDateOf(new Date()));
  }
  return state;
}

export function dispatch(action: CartAction) {
  state = cartReducer(current(), action);
  if (action.type === "add") track("add_to_cart", { item: action.item.productId, qty: action.item.qty });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
  listeners.forEach((l) => l());
}

export function getCart(): CartState {
  return current();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCart(): CartState {
  return useSyncExternalStore(subscribe, current, () => EMPTY_CART);
}
