"use server";

import { DELIVERY_FEE, MAX_ITEM_QTY } from "@/data/delivery";
import { menu, type MenuItemId } from "@/data/menu";

export type DeliveryErrorKey =
  | "emptyCart"
  | "nameShort"
  | "phoneInvalid"
  | "addressShort"
  | "notesLong";

export type DeliveryState = {
  ok: boolean;
  status: "" | "success" | "invalid";
  errors: {
    cart?: DeliveryErrorKey;
    name?: DeliveryErrorKey;
    phone?: DeliveryErrorKey;
    address?: DeliveryErrorKey;
    notes?: DeliveryErrorKey;
  };
};

const empty: DeliveryState = { ok: false, status: "", errors: {} };

const prices = new Map(
  menu.flatMap((group) => group.items.map((item) => [item.id, item.price])),
);

function read(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function normalizePhone(raw: string) {
  return raw.replace(/[\s.\-()]/g, "");
}

function isPhone(value: string) {
  return /^(0|\+84)(3|5|7|8|9)\d{8}$/.test(value);
}

function parseCart(raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const lines: { id: MenuItemId; qty: number; price: number }[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== "object") continue;
    const id = (row as { id?: unknown }).id;
    const qty = Number((row as { qty?: unknown }).qty);
    if (typeof id !== "string" || !prices.has(id as MenuItemId)) continue;
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_ITEM_QTY) continue;
    lines.push({
      id: id as MenuItemId,
      qty,
      price: prices.get(id as MenuItemId)!,
    });
  }
  return lines;
}

export async function createDeliveryOrder(
  _prev: DeliveryState,
  formData: FormData,
): Promise<DeliveryState> {
  const name = read(formData, "name");
  const phone = normalizePhone(read(formData, "phone"));
  const address = read(formData, "address");
  const notes = read(formData, "notes");
  const lines = parseCart(read(formData, "items"));

  const errors: DeliveryState["errors"] = {};

  if (lines.length === 0) errors.cart = "emptyCart";
  if (name.length < 2) errors.name = "nameShort";
  if (!isPhone(phone)) errors.phone = "phoneInvalid";
  if (address.length < 8) errors.address = "addressShort";
  if (notes.length > 300) errors.notes = "notesLong";

  if (Object.keys(errors).length > 0) {
    return { ok: false, status: "invalid", errors };
  }

  const subtotal = lines.reduce((sum, line) => sum + line.price * line.qty, 0);

  console.info("[THE HEAT] Delivery", {
    name,
    phone,
    address,
    notes: notes || undefined,
    items: lines,
    subtotal,
    fee: DELIVERY_FEE,
    total: subtotal + DELIVERY_FEE,
  });

  return { ...empty, ok: true, status: "success" };
}
