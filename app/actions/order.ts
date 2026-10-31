"use server";

import * as z from "zod";
import type { CheckoutErrorKey } from "@/data/copy";
import { site } from "@/data/site";
import { fits, requirementOf } from "@/lib/domain/capacity";
import { orderCode, transferMemo } from "@/lib/domain/order-code";
import { normalizePhone } from "@/lib/domain/phone";
import { priceOrder, type CartLine } from "@/lib/domain/pricing";
import { vnTimeLabel } from "@/lib/domain/time";
import { LIMITS, type FieldErrors, type FieldKey, type PlaceOrderInput, type PlaceOrderResult } from "@/lib/order-contract";
import { serverNow } from "@/lib/server/clock";
import { getCatalog } from "@/lib/server/dal/catalog";
import { getOvenSnapshot } from "@/lib/server/dal/schedule";

// M3: ĐẶT ĐƠN GIẢ — kiểm tra thật (zod, catalog, giá, suất đang còn) nhưng KHÔNG ghi DB, KHÔNG giữ suất.
// Bản production trả `server_error` (khách thấy "Gọi quán / Nhắn Zalo") trừ khi chạy e2e (E2E=1).
// TODO(M4): rate-limit, transaction giữ suất, idempotency, lưu khách, Telegram, cookie th_c (§8.1).

const stubEnabled = process.env.NODE_ENV !== "production" || process.env.E2E === "1";

const msg = (key: CheckoutErrorKey) => key;
const qty = z.number().int().min(1).max(10);

const Input = z.object({
  idempotencyKey: z.uuid(),
  batchId: z.number().int().positive(),
  lines: z
    .array(
      z.object({
        productId: z.string().max(40),
        qty,
        comboChoices: z.record(z.string(), z.string()).optional(),
        addons: z.array(z.object({ productId: z.string().max(40), qty })).max(5).optional(),
      }),
    )
    .min(1)
    .max(15),
  customer: z.object({
    phone: z.string().max(20, msg("phoneInvalid")),
    name: z.string().trim().min(LIMITS.nameMin, msg("nameShort")).max(LIMITS.nameMax, msg("nameLong")),
    remember: z.boolean(),
  }),
  fulfillment: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("delivery"),
      zoneId: z.number(msg("zoneRequired")).int(),
      addressText: z.string().trim().min(LIMITS.addressMin, msg("addressShort")).max(LIMITS.addressMax, msg("addressLong")).optional(),
      savedAddressToken: z.string().max(200).optional(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
    }),
    z.object({ type: z.literal("pickup"), pickupPointId: z.number().int() }),
  ]),
  paymentMethod: z.enum(["cod", "transfer"]),
  note: z.string().trim().max(LIMITS.noteMax, msg("noteLong")).optional(),
  website: z.string().max(0).optional(),
  startedAt: z.number().int(),
}) satisfies z.ZodType<PlaceOrderInput>;

const FIELD_OF: Record<string, FieldKey> = {
  "customer.phone": "phone",
  "customer.name": "name",
  "fulfillment.zoneId": "zone",
  "fulfillment.addressText": "address",
  note: "note",
};

function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const field = FIELD_OF[issue.path.join(".")];
    if (field && !out[field]) out[field] = issue.message as CheckoutErrorKey;
  }
  return out;
}

export async function placeOrder(raw: PlaceOrderInput): Promise<PlaceOrderResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid", fieldErrors: fieldErrors(parsed.error) };
  const input = parsed.data;

  // Bot: điền honeypot hoặc gửi trong < 3 giây.
  if (input.website || Date.now() - input.startedAt < 3000) return { ok: false, reason: "invalid", fieldErrors: {} };

  const phone = normalizePhone(input.customer.phone);
  const f = input.fulfillment;
  if (!phone) return { ok: false, reason: "invalid", fieldErrors: { phone: "phoneInvalid" } };
  if (f.type === "delivery" && !f.addressText && !f.savedAddressToken) {
    return { ok: false, reason: "invalid", fieldErrors: { address: "addressShort" } };
  }
  if (!stubEnabled) return { ok: false, reason: "server_error" };

  const now = serverNow();
  const [catalog, oven] = await Promise.all([getCatalog(), getOvenSnapshot(now)]);
  if (oven.status.kind === "paused") return { ok: false, reason: "paused" };

  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  const unknown = input.lines.flatMap((l) => [l.productId, ...(l.addons ?? []).map((a) => a.productId)]).filter((id) => !byId.has(id));
  if (unknown.length > 0) return { ok: false, reason: "unavailable", productIds: unknown };

  const lines: CartLine[] = input.lines.map((l) => ({
    product: byId.get(l.productId)!,
    qty: l.qty,
    comboChoices: l.comboChoices,
    addons: l.addons?.map((a) => ({ product: byId.get(a.productId)!, qty: a.qty })),
  }));

  const zone = f.type === "delivery" ? catalog.zones.find((z) => z.id === f.zoneId) : undefined;
  const point = f.type === "pickup" ? catalog.pickupPoints.find((p) => p.id === f.pickupPointId) : undefined;
  if (f.type === "delivery" && !zone) return { ok: false, reason: "invalid", fieldErrors: { zone: "zoneRequired" } };
  if (f.type === "pickup" && !point) return { ok: false, reason: "invalid", fieldErrors: {} };

  const priced = priceOrder({
    lines,
    fulfillment: zone
      ? { type: "delivery", zone }
      : { type: "pickup", point: point!, giftProduct: point!.giftProductId ? byId.get(point!.giftProductId) : undefined },
    shipping: { freeShipFrom: oven.rules.freeShipFrom },
  });
  if (!priced.ok) {
    return priced.error.reason === "unavailable"
      ? { ok: false, reason: "unavailable", productIds: priced.error.productIds }
      : { ok: false, reason: "invalid", fieldErrors: {} };
  }

  const req = requirementOf(lines.map((l) => ({ product: l.product, qty: l.qty })));
  const all = oven.days.flatMap((d) => d.slots);
  const slot = all.find((s) => s.batchId === input.batchId);
  const alternatives = all.filter((s) => s.batchId !== input.batchId && s.level !== "closed" && fits(req, s));
  if (!slot || slot.level === "closed") return { ok: false, reason: "cutoff_passed", alternatives };
  if (!fits(req, slot)) return { ok: false, reason: "slot_full", alternatives };

  const day = oven.days.find((d) => d.date === slot.date)!;
  const seq = 1 + Math.floor(Math.random() * 30); // đơn giả — M4 lấy từ service_days.order_seq
  const readyAt = new Date(slot.readyAt);
  const etaEnd = vnTimeLabel(new Date(readyAt.getTime() + oven.rules.deliveryWindowMin * 60_000));

  return {
    ok: true,
    code: orderCode(slot.date, seq),
    seq,
    trackingPath: "/",
    readyLabel: slot.readyLabel,
    dayLabel: day.label,
    etaLabel: zone ? `khoảng ${slot.readyLabel}–${etaEnd}` : `${slot.readyLabel} tại ${point?.name ?? site.kitchen.name}`,
    cutoffLabel: vnTimeLabel(new Date(slot.cutoffAt)),
    total: priced.total,
    status: "placed",
    payment:
      input.paymentMethod === "cod"
        ? { method: "cod" }
        : { method: "transfer", qrUrl: "", memo: transferMemo(slot.date, seq), amount: priced.total },
  };
}
