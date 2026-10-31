import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { maskName } from "@/lib/domain/phone";
import { requiresPrepay } from "@/lib/domain/pricing";
import type { PaymentSettings } from "@/lib/domain/types";
import type { LookupResult } from "@/lib/order-contract";
import { signAddress, verifyAddress } from "@/lib/server/customer-cookie";
import { getDb, type Executor } from "@/lib/server/db/client";
import { addresses, customers, orders, zones } from "@/lib/server/db/schema";

// Nhận diện khách cũ (§7.7). Quyền riêng tư: thiết bị lạ chỉ nhận tên gọi + tên khu vực + token địa chỉ;
// mô tả nhà/toạ độ chỉ trả cho chính thiết bị có cookie `th_c` của khách đó.

export async function findCustomerByPhone(phone: string, db: Executor = getDb()) {
  const [c] = await db.select().from(customers).where(eq(customers.phone, phone)).limit(1);
  return c ?? null;
}

/** Đơn giao gần nhất của khách — nguồn của "giao tới địa chỉ lần trước". */
async function lastDelivery(customerId: string, db: Executor) {
  const [o] = await db
    .select({ id: orders.id, zoneId: orders.zoneId, addressText: orders.addressText, lat: orders.lat, lng: orders.lng })
    .from(orders)
    .where(and(eq(orders.customerId, customerId), eq(orders.fulfillment, "delivery")))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  return o ?? null;
}

async function activeZone(zoneId: number | null, db: Executor) {
  if (zoneId === null) return null;
  const [z] = await db.select().from(zones).where(and(eq(zones.id, zoneId), eq(zones.isActive, true))).limit(1);
  return z ?? null;
}

export async function lookupCustomer(
  phone: string,
  ctx: { rememberedId: string | null; payment: PaymentSettings; now: Date; db?: Executor },
): Promise<LookupResult> {
  const db = ctx.db ?? getDb();
  const c = await findCustomerByPhone(phone, db);
  // Khách bị chặn: trả như khách mới — không lộ lý do (§8.1).
  if (!c || c.isBlocked) return { status: "new" };
  const prepay = requiresPrepay(ctx.payment, c, 0);

  if (ctx.rememberedId === c.id && c.remember) {
    const [saved] = await db
      .select()
      .from(addresses)
      .where(eq(addresses.customerId, c.id))
      .orderBy(desc(addresses.lastUsedAt))
      .limit(1);
    const src = saved ? { ...saved, addressText: saved.description } : await lastDelivery(c.id, db);
    const zone = await activeZone(src?.zoneId ?? null, db);
    return {
      status: "self",
      name: c.name,
      zoneId: zone?.id ?? null,
      addressText: src?.addressText ?? null,
      lat: src?.lat ?? null,
      lng: src?.lng ?? null,
      requiresPrepay: prepay,
    };
  }

  const last = await lastDelivery(c.id, db);
  const zone = await activeZone(last?.zoneId ?? null, db);
  return {
    status: "known",
    greetingName: maskName(c.name),
    zoneId: zone?.id ?? null,
    zoneName: zone?.name ?? null,
    savedAddressToken: last && zone && last.addressText ? signAddress(c.id, last.id, ctx.now) : null,
    requiresPrepay: prepay,
  };
}

/** Địa chỉ thật sau `savedAddressToken` — chỉ khi token còn hạn và thuộc đúng khách `customerId`. */
export async function resolveSavedAddress(token: string, customerId: string | null, now: Date, db: Executor = getDb()) {
  const t = verifyAddress(token, now);
  if (!t || t.customerId !== customerId) return null;
  const [o] = await db
    .select({ addressText: orders.addressText, lat: orders.lat, lng: orders.lng })
    .from(orders)
    .where(and(eq(orders.id, t.orderId), eq(orders.customerId, customerId)))
    .limit(1);
  return o?.addressText ? o : null;
}
