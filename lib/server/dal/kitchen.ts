import "server-only";
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { buildPrepReport, type PrepReport } from "@/lib/domain/prep";
import { addDays, vnDateOf, vnDayLabel, vnTimeLabel, type ISODate } from "@/lib/domain/time";
import type {
  BatchStatus,
  Channel,
  ComboGroup,
  DayStatus,
  Fulfillment,
  Kind,
  OrderStatus,
  OrderWithItems,
  PaymentMethod,
  PaymentStatus,
} from "@/lib/domain/types";
import { prepSummaryText } from "@/lib/kitchen-text";
import { getDb, type Db, type Executor } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { ensureBatches } from "@/lib/server/dal/schedule";
import { loadSettings } from "@/lib/server/dal/settings";

// Dữ liệu Kitchen Dashboard (§10) cho một ngày phục vụ. Không cache (§5.3) — bếp cần số thật.
// Trả DTO đã gọn cho client: không trả record DB thô, không token theo dõi, không idempotency key.

export type KitchenItem = { name: string; qty: number; isGift: boolean; choices: string | null; addons: { name: string; qty: number }[] };

export type KitchenOrder = {
  id: string;
  code: string;
  seq: number;
  batchId: number;
  channel: Channel;
  status: OrderStatus;
  fulfillment: Fulfillment;
  customerName: string;
  customerPhone: string;
  zoneName: string | null;
  routeId: number | null;
  pickupName: string | null;
  addressText: string | null;
  lat: number | null;
  lng: number | null;
  items: KitchenItem[];
  panUnits: number;
  bbqUnits: number;
  total: number;
  /** Tiền shipper/quầy cần thu (0 nếu đã trả). */
  collect: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  note: string | null;
  cancelReason: string | null;
  createdAt: string;
};

export type KitchenBatch = {
  id: number;
  readyAt: string;
  ovenAt: string;
  cutoffAt: string;
  readyLabel: string;
  ovenLabel: string;
  capPan: number;
  capBbq: number;
  usedPan: number;
  usedBbq: number;
  status: BatchStatus;
};

export type KitchenProduct = {
  id: string;
  kind: Kind;
  name: string;
  price: number;
  isAvailable: boolean;
  usesPan: number;
  usesBbq: number;
  comboConfig: ComboGroup[] | null;
  upsellIds: string[];
};

export type KitchenDay = {
  date: ISODate;
  today: ISODate;
  dayLabel: string;
  /** null = ngày không có lịch (lò nghỉ / chưa sinh mẻ). */
  status: DayStatus | null;
  pauseMessage: string | null;
  serverNow: string;
  /** Các ngày cho bộ chọn ngày ở header. */
  days: { date: ISODate; label: string }[];
  batches: KitchenBatch[];
  orders: KitchenOrder[];
  prep: PrepReport;
  products: KitchenProduct[];
  zones: { id: number; name: string; routeId: number; shipFee: number }[];
  routes: { id: number; name: string }[];
  points: { id: number; name: string }[];
};

const PAST_DAYS = 1;

export async function loadKitchenDay(date: ISODate, now: Date, db: Executor = getDb()): Promise<KitchenDay> {
  const today = vnDateOf(now);
  const [settings, dayRows, batchRows, orderRows, productRows, ingredientRows, recipeRows, zoneRows, routeRows, pointRows] =
    await Promise.all([
      loadSettings(db),
      db.select().from(t.serviceDays).where(eq(t.serviceDays.date, date)).limit(1),
      db.select().from(t.batches).where(eq(t.batches.serviceDate, date)).orderBy(asc(t.batches.readyAt)),
      db.select().from(t.orders).where(eq(t.orders.serviceDate, date)).orderBy(asc(t.orders.seq)),
      db.select().from(t.products).where(eq(t.products.isActive, true)).orderBy(asc(t.products.sort), asc(t.products.id)),
      db.select().from(t.ingredients),
      db.select().from(t.recipeLines),
      db.select().from(t.zones).orderBy(asc(t.zones.sort), asc(t.zones.id)),
      db.select().from(t.routes).orderBy(asc(t.routes.sort), asc(t.routes.id)),
      db.select().from(t.pickupPoints).orderBy(asc(t.pickupPoints.id)),
    ]);
  const items =
    orderRows.length === 0
      ? []
      : await db
          .select()
          .from(t.orderItems)
          .where(inArray(t.orderItems.orderId, orderRows.map((o) => o.id)))
          .orderBy(asc(t.orderItems.id));

  const productName = new Map(productRows.map((p) => [p.id, p.name]));
  const comboGroups = new Map(productRows.map((p) => [p.id, (p.comboConfig ?? []).map((g) => g.key)]));
  const zoneById = new Map(zoneRows.map((z) => [z.id, z]));
  const pointById = new Map(pointRows.map((p) => [p.id, p]));
  const day = dayRows[0];

  const orders: KitchenOrder[] = orderRows.map((o) => {
    const own = items.filter((i) => i.orderId === o.id);
    const zone = o.zoneId !== null ? zoneById.get(o.zoneId) : undefined;
    return {
      id: o.id,
      code: o.code,
      seq: o.seq,
      batchId: o.batchId,
      channel: o.channel,
      status: o.status,
      fulfillment: o.fulfillment,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      zoneName: zone?.name ?? null,
      routeId: zone?.routeId ?? null,
      pickupName: o.pickupPointId !== null ? (pointById.get(o.pickupPointId)?.name ?? null) : null,
      addressText: o.addressText,
      lat: o.lat,
      lng: o.lng,
      items: own
        .filter((i) => i.parentItemId === null)
        .map((i) => ({
          name: i.name,
          qty: i.qty,
          isGift: i.isGift,
          // jsonb không giữ thứ tự key → xếp theo nhóm trong cấu hình combo (pizza trước BBQ).
          choices: i.comboChoices
            ? (comboGroups.get(i.productId)?.length ? comboGroups.get(i.productId)! : Object.keys(i.comboChoices))
                .map((k) => i.comboChoices![k])
                .filter(Boolean)
                .map((id) => productName.get(id) ?? id)
                .join(" + ")
            : null,
          addons: own.filter((a) => a.parentItemId === i.id).map((a) => ({ name: a.name, qty: a.qty })),
        })),
      panUnits: o.panUnits,
      bbqUnits: o.bbqUnits,
      total: o.total,
      collect: o.paymentStatus === "unpaid" ? o.total : 0,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      note: o.note,
      cancelReason: o.cancelReason,
      createdAt: o.createdAt.toISOString(),
    };
  });

  const prepOrders: OrderWithItems[] = orderRows.map((o) => ({
    ...o,
    items: items
      .filter((i) => i.orderId === o.id)
      .map((i) => ({
        productId: i.productId,
        name: i.name,
        unitPrice: i.unitPrice,
        qty: i.qty,
        lineTotal: i.lineTotal,
        comboChoices: i.comboChoices,
        isGift: i.isGift,
      })),
  }));

  const daysAhead = settings.ordering.daysAhead;
  return {
    date,
    today,
    dayLabel: vnDayLabel(date, today),
    status: day?.status ?? null,
    pauseMessage: day?.pauseMessage ?? null,
    serverNow: now.toISOString(),
    days: Array.from({ length: PAST_DAYS + daysAhead + 1 }, (_, i) => addDays(today, i - PAST_DAYS)).map((d) => ({
      date: d,
      label: d === addDays(today, -1) ? "Hôm qua" : d === today ? "Hôm nay" : vnDayLabel(d, today),
    })),
    batches: batchRows.map((b) => ({
      id: b.id,
      readyAt: b.readyAt.toISOString(),
      ovenAt: b.ovenAt.toISOString(),
      cutoffAt: b.cutoffAt.toISOString(),
      readyLabel: vnTimeLabel(b.readyAt),
      ovenLabel: vnTimeLabel(b.ovenAt),
      capPan: b.capPan,
      capBbq: b.capBbq,
      usedPan: b.usedPan,
      usedBbq: b.usedBbq,
      status: b.status,
    })),
    orders,
    prep: buildPrepReport({
      date,
      now,
      orders: prepOrders,
      products: productRows,
      recipes: recipeRows,
      ingredients: ingredientRows,
      batches: batchRows,
      zones: zoneRows,
      routes: routeRows,
      points: pointRows,
    }),
    products: productRows.map((p) => ({
      id: p.id,
      kind: p.kind,
      name: p.name,
      price: p.price,
      isAvailable: p.isAvailable,
      usesPan: p.usesPan,
      usesBbq: p.usesBbq,
      comboConfig: p.comboConfig,
      upsellIds: p.upsellIds,
    })),
    zones: zoneRows.filter((z) => z.isActive).map((z) => ({ id: z.id, name: z.name, routeId: z.routeId, shipFee: z.shipFee })),
    routes: routeRows.map((r) => ({ id: r.id, name: r.name })),
    points: pointRows.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name })),
  };
}

export type OrderEventView = { type: string; actor: string; at: string; data: Record<string, unknown> | null };

/** Lịch sử đơn cho sheet chi tiết; `actor` đổi "staff:3" → tên nhân viên. */
export async function loadOrderEvents(orderId: string, db: Executor = getDb()): Promise<OrderEventView[]> {
  const [rows, people] = await Promise.all([
    db.select().from(t.orderEvents).where(eq(t.orderEvents.orderId, orderId)).orderBy(desc(t.orderEvents.id)),
    db.select({ id: t.staff.id, name: t.staff.name }).from(t.staff),
  ]);
  const nameOf = new Map(people.map((p) => [`staff:${p.id}`, p.name]));
  return rows.map((e) => ({
    type: e.type,
    actor: nameOf.get(e.actor) ?? e.actor,
    at: e.createdAt.toISOString(),
    data: (e.data as Record<string, unknown> | null) ?? null,
  }));
}

/** Văn bản Bảng Tổng Hợp (§10.2) cho Telegram/Copy. */
export function prepText(day: Pick<KitchenDay, "prep" | "batches" | "dayLabel" | "date">) {
  const lastCutoff = day.batches.reduce((m, b) => (b.cutoffAt > m ? b.cutoffAt : m), "");
  return prepSummaryText(day.prep, { date: day.date, cutoffLabel: lastCutoff ? vnTimeLabel(new Date(lastCutoff)) : null });
}

// ── Cron hằng ngày (§5.4) ──

export type DailyResult = { created: { days: number; batches: number }; summarySent: boolean; rateLimitsDeleted: number };

/**
 * Sinh mẻ cho hôm nay … +daysAhead, dọn rate_limits cũ, và gửi Bảng Tổng Hợp **một lần** sau giờ chốt muộn nhất
 * (giành quyền gửi bằng UPDATE … WHERE summary_sent_at IS NULL — hai cron chồng nhau cũng chỉ một tin).
 */
export async function runDaily(now: Date, send: (text: string) => Promise<boolean>, db: Db = getDb()): Promise<DailyResult> {
  const today = vnDateOf(now);
  const { ordering } = await loadSettings(db);
  const created = await ensureBatches(today, ordering.daysAhead + 1, db);
  const deleted = await db
    .delete(t.rateLimits)
    .where(lt(t.rateLimits.windowStart, new Date(now.getTime() - 2 * 86_400_000)))
    .returning({ key: t.rateLimits.key });

  let summarySent = false;
  const [{ last } = { last: null }] = await db
    .select({ last: sql<string | null>`max(${t.batches.cutoffAt})` })
    .from(t.batches)
    .where(eq(t.batches.serviceDate, today));
  if (last && now >= new Date(last)) {
    const [claimed] = await db
      .update(t.serviceDays)
      .set({ summarySentAt: now })
      .where(and(eq(t.serviceDays.date, today), isNull(t.serviceDays.summarySentAt)))
      .returning({ date: t.serviceDays.date });
    if (claimed) {
      summarySent = await send(prepText(await loadKitchenDay(today, now, db)));
      // Gửi lỗi → nhả quyền để lần cron sau thử lại.
      if (!summarySent) await db.update(t.serviceDays).set({ summarySentAt: null }).where(eq(t.serviceDays.date, today));
    }
  }
  return { created, summarySent, rateLimitsDeleted: deleted.length };
}
