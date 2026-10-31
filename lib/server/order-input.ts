import "server-only";
import * as z from "zod";
import type { CheckoutErrorKey } from "@/data/copy";
import { LIMITS, type FieldErrors, type FieldKey, type PlaceOrderInput } from "@/lib/order-contract";

// Schema zod của placeOrder (§8.1) — dùng chung cho đơn web và "Thêm đơn nhanh" của nhân viên.

const msg = (key: CheckoutErrorKey) => key;
const qty = z.number().int().min(1).max(10);

export const OrderInput = z.object({
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

export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const field = FIELD_OF[issue.path.join(".")];
    if (field && !out[field]) out[field] = issue.message as CheckoutErrorKey;
  }
  return out;
}
