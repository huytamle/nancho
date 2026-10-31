import "server-only";
import { and, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { site } from "@/data/site";
import { fits, requirementOf, type Requirement } from "@/lib/domain/capacity";
import { orderCode, transferMemo } from "@/lib/domain/order-code";
import { canEditFeedback, canRate, ratableItems, type RatableItem, type Score } from "@/lib/domain/feedback";
import { pauseCancelOf } from "@/lib/domain/oven-lock";
import { HOLD_EXPIRED_REASON, holdUntil as holdDeadline, isHeld, needsHold } from "@/lib/domain/hold";
import { canTransition, customerStage, releasesCapacity, shouldAutoConfirm, type CustomerStage } from "@/lib/domain/order-status";
import { priceOrder, requiresPrepay, type CartLine, type PricedItem } from "@/lib/domain/pricing";
import { pointsFor } from "@/lib/domain/promo";
import { vnDateOf, vnDayLabel, vnTimeLabel, type ISODate } from "@/lib/domain/time";
import { isExtra, segmentOf, type Channel, type OrderStatus, type PaymentMethod, type PaymentStatus } from "@/lib/domain/types";
import type { PlaceOrderInput, PlaceOrderResult } from "@/lib/order-contract";
import type { TransferInfo } from "@/lib/payments";
import { getDb, type Db, type Executor } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import type { Catalog } from "@/lib/server/dal/catalog";
import { findCustomerByPhone, resolveSavedAddress } from "@/lib/server/dal/customers";
import { releaseExpiredHolds } from "@/lib/server/dal/holds";
import { getOvenSnapshot } from "@/lib/server/dal/schedule";
import { consumeVoucher, releaseVouchers, resolvePromo, type Member } from "@/lib/server/dal/promo";
import { loadSettings } from "@/lib/server/dal/settings";
import { transferFor } from "@/lib/server/payments/vietqr";
import { almostFullText, cancelledText, newOrderText } from "@/lib/server/notify/messages";

// Đặt đơn thật (§8.1) & huỷ đơn bằng token. Server Action chỉ lo parse/rate-limit/cookie/after();
// toàn bộ nghiệp vụ nằm ở đây để integration test gọi thẳng với Postgres thật.

type Success = Extract<PlaceOrderResult, { ok: true }>;

export type PlaceOrderOutcome = {
  result: PlaceOrderResult;
  /** Chỉ có khi vừa tạo đơn mới (không có khi trả lại kết quả idempotent). */
  created?: { customerId: string; telegram: string[] };
};

/** Đơn do nhân viên nhập ("Thêm đơn nhanh", §10.4): đã nói chuyện với khách → xác nhận luôn, không Telegram. */
export type StaffEntry = { actor: string; channel: Channel; overrideCutoff: boolean };

export type PlaceOrderCtx = {
  now: Date;
  catalog: Catalog;
  db?: Db;
  staff?: StaffEntry;
  /** Kênh marketing từ cookie `th_src`. */
  source?: string | null;
  /** Khách đăng nhập (M12): tích điểm, lịch sử, ví mã. */
  member?: Pick<Member, "id"> | null;
};

const trackingToken = () => randomBytes(16).toString("base64url"); // 128 bit → 22 ký tự

class Rejected extends Error {
  constructor(readonly reason: "slot_full" | "cutoff_passed" | "paused" | "promo_used") {
    super(reason);
  }
}

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
}

/** DTO trả cho khách — dùng chung cho đơn vừa tạo và lần gửi lại cùng `idempotencyKey`. */
function successOf(
  o: Pick<t.Order, "code" | "seq" | "trackingToken" | "serviceDate" | "total" | "discount" | "status" | "paymentMethod" | "fulfillment" | "holdUntil" | "memberId">,
  b: Pick<t.BatchRow, "readyAt" | "cutoffAt" | "ovenAt" | "segment">,
  ctx: { now: Date; deliveryWindowMin: number; pointName: string | null },
): Success {
  const cafe = b.segment === "cafe";
  // Cà phê: khung giao ovenAt–readyAt (M12); pizza: giờ ra lò + cửa sổ giao.
  const readyLabel = cafe ? `${vnTimeLabel(b.ovenAt)}–${vnTimeLabel(b.readyAt)}` : vnTimeLabel(b.readyAt);
  const etaEnd = vnTimeLabel(new Date(b.readyAt.getTime() + ctx.deliveryWindowMin * 60_000));
  return {
    ok: true,
    code: o.code,
    seq: o.seq,
    trackingPath: `/o/${o.trackingToken}`,
    readyLabel,
    dayLabel: vnDayLabel(o.serviceDate, vnDateOf(ctx.now)),
    etaLabel: cafe
      ? `trong khung ${readyLabel}`
      : o.fulfillment === "delivery"
        ? `khoảng ${readyLabel}–${etaEnd}`
        : `${readyLabel} tại ${ctx.pointName ?? site.kitchen.name}`,
    cutoffLabel: vnTimeLabel(b.cutoffAt),
    total: o.total,
    discount: o.discount,
    points: o.memberId ? pointsFor(o.total) : null,
    status: o.status === "confirmed" ? "confirmed" : "placed",
    holdUntil: o.holdUntil?.toISOString() ?? null,
    payment:
      o.paymentMethod === "cod"
        ? { method: "cod" }
        : { method: "transfer", ...transferFor(o.total, transferMemo(o.serviceDate, o.seq)) },
  };
}

async function replay(key: string, ctx: { now: Date; deliveryWindowMin: number }, db: Executor): Promise<Success | null> {
  const [row] = await db
    .select({ order: t.orders, batch: t.batches, pointName: t.pickupPoints.name })
    .from(t.orders)
    .innerJoin(t.batches, eq(t.batches.id, t.orders.batchId))
    .leftJoin(t.pickupPoints, eq(t.pickupPoints.id, t.orders.pickupPointId))
    .where(eq(t.orders.idempotencyKey, key))
    .limit(1);
  return row ? successOf(row.order, row.batch, { ...ctx, pointName: row.pointName }) : null;
}

/** Mẻ khác (cùng ngày & các ngày tới) còn vừa cả đơn — gợi ý khi mẻ chọn vừa kín/chốt. */
async function alternativesFor(batchId: number, req: Requirement, now: Date, db: Executor) {
  const snap = await getOvenSnapshot(now, db);
  return snap.days.flatMap((d) => d.slots).filter((s) => s.batchId !== batchId && s.level !== "closed" && fits(req, s));
}

async function rejectionReason(batchId: number, now: Date, db: Executor, override = false): Promise<Rejected["reason"]> {
  const [row] = await db
    .select({ batch: t.batches, dayStatus: t.serviceDays.status })
    .from(t.batches)
    .innerJoin(t.serviceDays, eq(t.serviceDays.date, t.batches.serviceDate))
    .where(eq(t.batches.id, batchId))
    .limit(1);
  if (!row) return "cutoff_passed";
  if (row.dayStatus === "paused") return "paused";
  if (row.dayStatus !== "open") return "cutoff_passed";
  if (override) return row.batch.status === "open" || row.batch.status === "closed" ? "slot_full" : "cutoff_passed";
  if (row.batch.status !== "open" || now >= row.batch.cutoffAt) return "cutoff_passed";
  return "slot_full";
}

/**
 * `input` đã qua zod; `phone` đã chuẩn hoá. Thứ tự theo pipeline §8.1 (phần sau rate-limit).
 * Giữ suất bằng một câu UPDATE có điều kiện (§7.3) — khoá dòng mẻ nên các đơn song song xếp hàng tự nhiên.
 */
export async function placeOrderCore(input: PlaceOrderInput, phone: string, ctx: PlaceOrderCtx): Promise<PlaceOrderOutcome> {
  const db = ctx.db ?? getDb();
  const { now, catalog } = ctx;
  const { ordering, payment, shipping } = await loadSettings(db);
  const replayCtx = { now, deliveryWindowMin: ordering.deliveryWindowMin };

  const previous = await replay(input.idempotencyKey, replayCtx, db);
  if (previous) return { result: previous };

  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  const ids = input.lines.flatMap((l) => [l.productId, ...(l.addons ?? []).map((a) => a.productId)]);
  const unknown = ids.filter((id) => !byId.has(id));
  if (unknown.length > 0) return { result: { ok: false, reason: "unavailable", productIds: [...new Set(unknown)] } };

  const lines: CartLine[] = input.lines.map((l) => ({
    product: byId.get(l.productId)!,
    qty: l.qty,
    comboChoices: l.comboChoices,
    addons: l.addons?.map((a) => ({ product: byId.get(a.productId)!, qty: a.qty })),
  }));

  const f = input.fulfillment;
  const zone = f.type === "delivery" ? catalog.zones.find((z) => z.id === f.zoneId) : undefined;
  const point = f.type === "pickup" ? catalog.pickupPoints.find((p) => p.id === f.pickupPointId) : undefined;
  if (f.type === "delivery" && !zone) return { result: { ok: false, reason: "invalid", fieldErrors: { zone: "zoneRequired" } } };
  if (f.type === "pickup" && !point) return { result: { ok: false, reason: "invalid", fieldErrors: {} } };

  const fulfillmentInput = zone
    ? ({ type: "delivery", zone } as const)
    : ({ type: "pickup", point: point!, giftProduct: point!.giftProductId ? byId.get(point!.giftProductId) : undefined } as const);
  let priced = priceOrder({ lines, fulfillment: fulfillmentInput, shipping });

  // Mã ưu đãi / giới thiệu (M12): kiểm tra trên tạm tính rồi tính lại với số giảm. Nhân viên nhập đơn không dùng mã.
  let promo: { voucherId: number | null; referrerId: string | null } = { voucherId: null, referrerId: null };
  if (priced.ok && input.promoCode && !ctx.staff) {
    const r = await resolvePromo(input.promoCode, { phone, member: ctx.member ?? null, subtotal: priced.subtotal, now }, db);
    if (!r.ok) return { result: { ok: false, reason: "promo", promo: r.reason, ...(r.minSubtotal ? { minSubtotal: r.minSubtotal } : {}) } };
    promo = { voucherId: r.voucherId, referrerId: r.referrerId };
    priced = priceOrder({ lines, fulfillment: fulfillmentInput, shipping, discount: r.amount });
  }
  const segment = segmentOf(lines.find((l) => !isExtra(l.product.kind))?.product.kind ?? "pizza");
  if (!priced.ok) {
    return {
      result:
        priced.error.reason === "unavailable"
          ? { ok: false, reason: "unavailable", productIds: priced.error.productIds }
          : { ok: false, reason: "invalid", fieldErrors: {} },
    };
  }

  // Nhân viên nhập đơn tự quyết chặn/trả trước sau khi đã gọi khách.
  const { staff } = ctx;
  const existing = await findCustomerByPhone(phone, db);
  if (existing?.isBlocked && !staff) return { result: { ok: false, reason: "contact_us" } };
  const prepayRequired = requiresPrepay(payment, existing, priced.total);
  if (!staff && input.paymentMethod === "cod" && prepayRequired) {
    return { result: { ok: false, reason: "prepay_required" } };
  }
  // Bắt buộc trả trước → giữ suất có hạn (§18.2); đơn chờ CK không tự xác nhận dù là khách quen.
  const hold = needsHold({ paymentMethod: input.paymentMethod, prepayRequired, byStaff: !!staff });

  // Địa chỉ: khách gõ mới, hoặc "dùng địa chỉ lần trước" qua token ký (server tự tra mô tả nhà thật).
  let address: { addressText: string; lat: number | null; lng: number | null } | null = null;
  if (f.type === "delivery") {
    if (f.addressText) address = { addressText: f.addressText, lat: f.lat ?? null, lng: f.lng ?? null };
    else if (f.savedAddressToken) {
      const saved = await resolveSavedAddress(f.savedAddressToken, existing?.id ?? null, now, db);
      if (saved) address = { addressText: saved.addressText!, lat: saved.lat, lng: saved.lng };
    }
    if (!address) return { result: { ok: false, reason: "invalid", fieldErrors: { address: "addressShort" } } };
  }

  const req = requirementOf(lines.map((l) => ({ product: l.product, qty: l.qty })));

  try {
    const created = await db.transaction(async (tx) => {
      await releaseExpiredHolds(now, tx); // suất của đơn quá hạn về lại mẻ trước khi giữ suất mới
      const [batch] = await tx
        .update(t.batches)
        .set({ usedPan: sql`${t.batches.usedPan} + ${req.pan}`, usedBbq: sql`${t.batches.usedBbq} + ${req.bbq}` })
        .where(
          and(
            eq(t.batches.id, input.batchId),
            eq(t.batches.segment, segment), // cà phê chỉ vào khung cà phê, pizza chỉ vào mẻ lò
            // Owner "vượt giờ chốt": nhận cả mẻ đã chốt nhưng chưa vào lò; sức chứa vẫn giữ nguyên.
            staff?.overrideCutoff ? inArray(t.batches.status, ["open", "closed"]) : eq(t.batches.status, "open"),
            staff?.overrideCutoff ? undefined : gt(t.batches.cutoffAt, now),
            lte(sql`${t.batches.usedPan} + ${req.pan}`, t.batches.capPan),
            lte(sql`${t.batches.usedBbq} + ${req.bbq}`, t.batches.capBbq),
            sql`EXISTS (SELECT 1 FROM ${t.serviceDays} WHERE ${t.serviceDays.date} = ${t.batches.serviceDate} AND ${t.serviceDays.status} = 'open')`,
          ),
        )
        .returning();
      if (!batch) throw new Rejected(await rejectionReason(input.batchId, now, tx, staff?.overrideCutoff));

      const [day] = await tx
        .update(t.serviceDays)
        .set({ orderSeq: sql`${t.serviceDays.orderSeq} + 1` })
        .where(eq(t.serviceDays.date, batch.serviceDate))
        .returning({ seq: t.serviceDays.orderSeq });

      const [customer] = await tx
        .insert(t.customers)
        .values({ phone, name: input.customer.name, remember: input.customer.remember, orderCount: 1, lastOrderAt: now })
        .onConflictDoUpdate({
          target: t.customers.phone,
          set: {
            name: input.customer.name,
            remember: input.customer.remember,
            orderCount: sql`${t.customers.orderCount} + 1`,
            lastOrderAt: now,
          },
        })
        .returning();

      if (input.customer.remember && zone && address) await rememberAddress(tx, customer.id, zone.id, address, now);

      const status: OrderStatus = staff || (!hold && shouldAutoConfirm({ ...customer, paid: false })) ? "confirmed" : "placed";
      const [order] = await tx
        .insert(t.orders)
        .values({
          code: orderCode(batch.serviceDate, day.seq),
          seq: day.seq,
          serviceDate: batch.serviceDate,
          batchId: batch.id,
          channel: staff?.channel ?? "web",
          customerId: customer.id,
          customerName: input.customer.name,
          customerPhone: phone,
          fulfillment: f.type,
          zoneId: zone?.id ?? null,
          pickupPointId: point?.id ?? null,
          addressText: address?.addressText ?? null,
          lat: address?.lat ?? null,
          lng: address?.lng ?? null,
          panUnits: req.pan,
          bbqUnits: req.bbq,
          subtotal: priced.subtotal,
          shipFee: priced.shipFee,
          discount: priced.discount,
          total: priced.total,
          paymentMethod: input.paymentMethod,
          status,
          note: input.note || null,
          source: staff ? null : (ctx.source ?? null),
          trackingToken: trackingToken(),
          idempotencyKey: input.idempotencyKey,
          holdUntil: hold ? holdDeadline(now, payment.holdMinutes) : null,
          memberId: ctx.member?.id ?? null,
          referrerId: promo.referrerId,
          createdAt: now,
        })
        .returning();
      if (promo.voucherId !== null && !(await consumeVoucher(tx, promo.voucherId, order.id))) throw new Rejected("promo_used");

      await insertItems(tx, order.id, priced.items);
      await tx.insert(t.orderEvents).values([
        {
          orderId: order.id,
          type: "placed",
          actor: staff?.actor ?? "customer",
          data: { channel: staff?.channel ?? "web", ...(staff?.overrideCutoff ? { overrideCutoff: true } : {}) },
          createdAt: now,
        },
        ...(status === "confirmed"
          ? [
              {
                orderId: order.id,
                type: "status_changed" as const,
                actor: staff?.actor ?? "system",
                data: { from: "placed", to: "confirmed" },
                createdAt: now,
              },
            ]
          : []),
      ]);
      return { order, batch, customer };
    });

    const { order, batch, customer } = created;
    if (staff) {
      return { result: successOf(order, batch, { ...replayCtx, pointName: point?.name ?? null }), created: { customerId: customer.id, telegram: [] } };
    }
    const today = vnDateOf(now);
    const readyLabel = vnTimeLabel(batch.readyAt);
    const dayLabel = batch.serviceDate === today ? "" : vnDayLabel(batch.serviceDate, today);
    const shortOf = (id: string) => byId.get(id)?.short ?? id;
    const telegram = [
      newOrderText({
        seq: order.seq,
        code: order.code,
        readyLabel,
        dayLabel,
        name: order.customerName,
        phone,
        where: zone ? zone.name : `Nhận tại ${point!.name.replace(/^Cà phê /, "")}`,
        items: priced.items.filter((i) => i.parentIndex === null && !i.isGift).map((i) => ({ short: shortOf(i.productId), qty: i.qty })),
        total: order.total,
        paymentMethod: order.paymentMethod,
        needsConfirm: order.status === "placed",
        holdUntil: order.holdUntil ? vnTimeLabel(order.holdUntil) : null,
        note: order.note,
        link: `${process.env.NEXT_PUBLIC_SITE_URL ?? site.url}/admin/kitchen?ngay=${order.serviceDate}&tab=don`,
      }),
    ];
    // "Sắp kín lò": gửi đúng lần đơn này làm mẻ chuyển từ ≥ 2 xuống còn 1 khay → tự nhiên chỉ một lần/mẻ.
    const left = batch.capPan - batch.usedPan;
    if (req.pan > 0 && left === 1) telegram.push(almostFullText({ readyLabel, dayLabel }));

    return {
      result: successOf(order, batch, { ...replayCtx, pointName: point?.name ?? null }),
      created: { customerId: customer.id, telegram },
    };
  } catch (err) {
    if (err instanceof Rejected) {
      if (err.reason === "paused") return { result: { ok: false, reason: "paused" } };
      if (err.reason === "promo_used") return { result: { ok: false, reason: "promo", promo: "used" } };
      return { result: { ok: false, reason: err.reason, alternatives: await alternativesFor(input.batchId, req, now, db) } };
    }
    // Hai lần gửi cùng idempotencyKey chạy song song: lần thua trả lại đơn của lần thắng.
    if (pgCode(err) === "23505") {
      const again = await replay(input.idempotencyKey, replayCtx, db);
      if (again) return { result: again };
    }
    throw err;
  }
}

async function rememberAddress(
  tx: Executor,
  customerId: string,
  zoneId: number,
  a: { addressText: string; lat: number | null; lng: number | null },
  now: Date,
) {
  const updated = await tx
    .update(t.addresses)
    .set({ zoneId, lat: a.lat, lng: a.lng, lastUsedAt: now })
    .where(and(eq(t.addresses.customerId, customerId), eq(t.addresses.description, a.addressText)))
    .returning({ id: t.addresses.id });
  if (updated.length === 0) {
    await tx.insert(t.addresses).values({ customerId, zoneId, description: a.addressText, lat: a.lat, lng: a.lng, lastUsedAt: now });
  }
}

/** Món chính trước (lấy id), add-on sau với `parent_item_id`. */
async function insertItems(tx: Executor, orderId: string, items: PricedItem[]) {
  const row = (i: PricedItem, parentItemId: number | null) => ({
    orderId,
    productId: i.productId,
    name: i.name,
    unitPrice: i.unitPrice,
    qty: i.qty,
    lineTotal: i.lineTotal,
    comboChoices: i.comboChoices,
    isGift: i.isGift,
    parentItemId,
  });
  const parents = items.map((i, idx) => ({ i, idx })).filter(({ i }) => i.parentIndex === null);
  const ids = await tx
    .insert(t.orderItems)
    .values(parents.map(({ i }) => row(i, null)))
    .returning({ id: t.orderItems.id });
  const idOf = new Map(parents.map(({ idx }, n) => [idx, ids[n].id]));
  const children = items.filter((i) => i.parentIndex !== null);
  if (children.length > 0) await tx.insert(t.orderItems).values(children.map((i) => row(i, idOf.get(i.parentIndex!)!)));
}

// ── Huỷ bởi khách (§7.5) ──

export type CancelOutcome =
  | { ok: true; telegram: string | null }
  | { ok: false; reason: "too_late" | "not_found" };

export async function cancelOrderByTokenCore(token: string, ctx: { now: Date; reason?: string; db?: Db }): Promise<CancelOutcome> {
  const db = ctx.db ?? getDb();
  const { now } = ctx;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ order: t.orders, batch: t.batches })
      .from(t.orders)
      .innerJoin(t.batches, eq(t.batches.id, t.orders.batchId))
      .where(eq(t.orders.trackingToken, token))
      .limit(1)
      .for("update", { of: t.orders });
    if (!row) return { ok: false, reason: "not_found" } as const;
    const { order, batch } = row;
    if (order.status === "cancelled") return { ok: true, telegram: null } as const; // bấm huỷ hai lần

    const check = canTransition(order.status, "cancelled", {
      actor: { type: "customer" },
      fulfillment: order.fulfillment,
      now,
      cutoffAt: batch.cutoffAt,
    });
    if (!check.ok) return { ok: false, reason: "too_late" } as const;

    // WHERE trạng thái cũ: không bao giờ trả suất hai lần (§7.3).
    const [cancelled] = await tx
      .update(t.orders)
      .set({ status: "cancelled", cancelReason: ctx.reason?.trim() || null, updatedAt: now })
      .where(and(eq(t.orders.id, order.id), inArray(t.orders.status, ["placed", "confirmed"])))
      .returning({ id: t.orders.id });
    if (!cancelled) return { ok: false, reason: "too_late" } as const;

    if (releasesCapacity(order.status, "cancelled")) {
      await tx
        .update(t.batches)
        .set({ usedPan: sql`${t.batches.usedPan} - ${order.panUnits}`, usedBbq: sql`${t.batches.usedBbq} - ${order.bbqUnits}` })
        .where(eq(t.batches.id, batch.id));
    }
    await releaseVouchers(tx, [order.id]);
    await tx.insert(t.orderEvents).values({
      orderId: order.id,
      type: "cancelled",
      actor: "customer",
      data: { from: order.status, reason: ctx.reason?.trim() || null },
      createdAt: now,
    });

    const today = vnDateOf(now);
    return {
      ok: true,
      telegram: cancelledText({
        seq: order.seq,
        readyLabel: vnTimeLabel(batch.readyAt),
        dayLabel: batch.serviceDate === today ? "" : vnDayLabel(batch.serviceDate, today),
        units: order.panUnits + order.bbqUnits,
      }),
    } as const;
  });
}

// ── Biên nhận /o/[token] ──

export type OrderView = {
  code: string;
  seq: number;
  status: OrderStatus;
  stage: CustomerStage;
  fulfillment: "delivery" | "pickup";
  /** M12: `cafe` = đơn cà phê giao theo khung. */
  segment: "pizza" | "cafe";
  serviceDate: ISODate;
  dayLabel: string;
  readyLabel: string;
  ovenLabel: string;
  etaLabel: string;
  cutoffLabel: string;
  canCancel: boolean;
  customerName: string;
  zoneName: string | null;
  addressText: string | null;
  pickup: { name: string; address: string; mapsUrl: string | null } | null;
  items: { id: number; name: string; qty: number; lineTotal: number; isGift: boolean; parentId: number | null }[];
  /** Ý định để "Đặt lại đơn này" (không gồm quà). */
  reorder: { productId: string; qty: number; comboChoices?: Record<string, string>; addons: { productId: string; qty: number }[] }[];
  subtotal: number;
  shipFee: number;
  discount: number;
  total: number;
  payment: { method: PaymentMethod; status: PaymentStatus; memo: string; transfer: TransferInfo };
  /** Đang giữ suất chờ CK (§18.2) — hạn ISO. */
  holdUntil: string | null;
  /** Đơn tự huỷ vì hết giờ giữ suất. */
  holdExpired: boolean;
  /** Đơn huỷ vì quán khoá lò (§18.1) → lý do; null = không phải. */
  pausedReason: string | null;
  /** Chấm điểm khẩu vị (§18.5); null = chưa/không còn mở. */
  feedback: FeedbackView | null;
};

export type FeedbackView = {
  items: RatableItem[];
  /** Bản đã gửi (để sửa). */
  saved: { ratings: Record<string, Score>; tags: Record<string, string[]>; comment: string | null } | null;
  editable: boolean;
};

export async function getOrderView(token: string, now: Date, db: Executor = getDb()): Promise<OrderView | null> {
  if (!/^[\w-]{22}$/.test(token)) return null;
  await releaseExpiredHolds(now, db);
  const [row] = await db
    .select({ order: t.orders, batch: t.batches, zoneName: t.zones.name, point: t.pickupPoints })
    .from(t.orders)
    .innerJoin(t.batches, eq(t.batches.id, t.orders.batchId))
    .leftJoin(t.zones, eq(t.zones.id, t.orders.zoneId))
    .leftJoin(t.pickupPoints, eq(t.pickupPoints.id, t.orders.pickupPointId))
    .where(eq(t.orders.trackingToken, token))
    .limit(1);
  if (!row) return null;
  const { order: o, batch: b } = row;
  const [items, { ordering }, [saved]] = await Promise.all([
    db.select().from(t.orderItems).where(eq(t.orderItems.orderId, o.id)).orderBy(t.orderItems.id),
    loadSettings(db),
    db.select().from(t.feedback).where(eq(t.feedback.orderId, o.id)).limit(1),
  ]);
  const feedback = canRate(o.status, o.serviceDate, vnDateOf(now)) ? await feedbackView(items, saved ?? null, now, db) : null;

  const cafe = b.segment === "cafe";
  const readyLabel = vnTimeLabel(b.readyAt);
  const etaEnd = vnTimeLabel(new Date(b.readyAt.getTime() + ordering.deliveryWindowMin * 60_000));
  const sold = items.filter((i) => !i.isGift);
  return {
    code: o.code,
    seq: o.seq,
    status: o.status,
    stage: customerStage(o.status, o.fulfillment),
    fulfillment: o.fulfillment,
    serviceDate: o.serviceDate,
    dayLabel: vnDayLabel(o.serviceDate, vnDateOf(now)),
    readyLabel,
    ovenLabel: vnTimeLabel(b.ovenAt),
    etaLabel: cafe ? `${vnTimeLabel(b.ovenAt)}–${readyLabel}` : o.fulfillment === "delivery" ? `${readyLabel}–${etaEnd}` : readyLabel,
    segment: b.segment,
    cutoffLabel: vnTimeLabel(b.cutoffAt),
    canCancel: canTransition(o.status, "cancelled", { actor: { type: "customer" }, fulfillment: o.fulfillment, now, cutoffAt: b.cutoffAt }).ok,
    customerName: o.customerName,
    zoneName: row.zoneName,
    addressText: o.addressText,
    pickup: row.point ? { name: row.point.name, address: row.point.address, mapsUrl: row.point.mapsUrl } : null,
    items: items.map((i) => ({ id: i.id, name: i.name, qty: i.qty, lineTotal: i.lineTotal, isGift: i.isGift, parentId: i.parentItemId })),
    reorder: sold
      .filter((i) => i.parentItemId === null)
      .map((i) => ({
        productId: i.productId,
        qty: i.qty,
        ...(i.comboChoices ? { comboChoices: i.comboChoices } : {}),
        addons: sold.filter((a) => a.parentItemId === i.id).map((a) => ({ productId: a.productId, qty: a.qty })),
      })),
    subtotal: o.subtotal,
    shipFee: o.shipFee,
    discount: o.discount,
    total: o.total,
    payment: {
      method: o.paymentMethod,
      status: o.paymentStatus,
      memo: transferMemo(o.serviceDate, o.seq),
      transfer: transferFor(o.total, transferMemo(o.serviceDate, o.seq)),
    },
    holdUntil: isHeld(o) ? o.holdUntil!.toISOString() : null,
    holdExpired: o.status === "cancelled" && o.cancelReason === HOLD_EXPIRED_REASON,
    pausedReason: o.status === "cancelled" ? pauseCancelOf(o.cancelReason) : null,
    feedback,
  };
}

async function feedbackView(
  items: (typeof t.orderItems.$inferSelect)[],
  saved: typeof t.feedback.$inferSelect | null,
  now: Date,
  db: Executor,
): Promise<FeedbackView | null> {
  const list = await ratableFor(items, db);
  if (list.length === 0) return null;
  return {
    items: list,
    saved: saved ? { ratings: saved.ratings, tags: saved.tags, comment: saved.comment } : null,
    editable: !saved || canEditFeedback(saved.createdAt, now),
  };
}

export async function ratableFor(items: (typeof t.orderItems.$inferSelect)[], db: Executor): Promise<RatableItem[]> {
  const ids = [...new Set(items.flatMap((i) => [i.productId, ...Object.values(i.comboChoices ?? {})]))];
  if (ids.length === 0) return [];
  const products = await db.select({ id: t.products.id, name: t.products.name, kind: t.products.kind }).from(t.products).where(inArray(t.products.id, ids));
  return ratableItems(
    items.map((i) => ({ productId: i.productId, isGift: i.isGift, parentId: i.parentItemId, comboChoices: i.comboChoices })),
    new Map(products.map((p) => [p.id, p])),
  );
}
