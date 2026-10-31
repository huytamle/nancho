// Schema Drizzle = BLUEPRINT §6.2. Cột snake_case trong DB (casing ở client + drizzle.config), camelCase trong TS.
// Mọi bảng bật RLS và KHÔNG có policy (§12): Data API của Supabase không đọc/ghi được, app dùng role chủ bảng.
// File này không có `import 'server-only'` vì drizzle-kit đọc nó ngoài Next; chỉ chứa định nghĩa, không kết nối.

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { CashCounts } from "@/lib/domain/cash";
import type { ChecklistDone, ChecklistItem } from "@/lib/domain/checklist";
import type { ExpenseCategory } from "@/lib/domain/expense-command";
import type { PayLine } from "@/lib/domain/payroll";
import type { BillLine, CountClass, CountLine, FormulaLine, WasteReason } from "@/lib/domain/stock";
import type { Role } from "@/lib/domain/roles";
import type { TimeFlag } from "@/lib/domain/worktime";
import type { ComboGroup, ISODate } from "@/lib/domain/types";

const tstz = () => timestamp({ withTimezone: true });
const isoDate = () => date({ mode: "string" }).$type<ISODate>();
const createdAt = () => tstz().notNull().defaultNow();
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const productKind = pgEnum("product_kind", ["pizza", "bbq", "combo", "addon"]);
export const dayStatus = pgEnum("day_status", ["open", "closed", "paused"]);
export const batchStatus = pgEnum("batch_status", ["open", "closed", "baking", "done"]);
export const channel = pgEnum("channel", ["web", "phone", "zalo", "walkin", "grab", "shopee"]);
export const fulfillment = pgEnum("fulfillment", ["delivery", "pickup"]);
export const paymentMethod = pgEnum("payment_method", ["cod", "transfer"]);
export const paymentStatus = pgEnum("payment_status", ["unpaid", "paid", "refunded"]);
export const orderStatus = pgEnum("order_status", [
  "placed",
  "confirmed",
  "baking",
  "ready",
  "delivering",
  "completed",
  "cancelled",
  "no_show",
]);
// Vai trò vận hành (§17.2) — một người có nhiều vai trò.
export const role = pgEnum("role", ["owner", "manager", "kitchen", "server", "barista", "shipper"]);
export const shiftStatus = pgEnum("shift_status", ["open", "closed"]);
export const cashBox = pgEnum("cash_box", ["register", "petty"]);
export const cashEntryKind = pgEnum("cash_entry_kind", ["open", "close", "check", "drop", "replenish"]);
export const expenseSource = pgEnum("expense_source", ["petty", "pocket", "bank"]);
export const expenseStatus = pgEnum("expense_status", ["recorded", "pending", "approved", "rejected", "reimbursed"]);
export const checklistMoment = pgEnum("checklist_moment", ["open", "during", "close", "weekly"]);
export const handbookKind = pgEnum("handbook_kind", ["sop", "recipe"]);
export const timesheetStatus = pgEnum("timesheet_status", ["draft", "submitted", "acknowledged"]);
export const payslipStatus = pgEnum("payslip_status", ["draft", "approved", "paid"]);
export const stockLevel = pgEnum("stock_level", ["raw", "prep", "goods"]);
export const stockMoveKind = pgEnum("stock_move_kind", ["purchase", "produce_in", "produce_out", "sale", "waste", "adjust"]);
export const billStatus = pgEnum("bill_status", ["open", "paid", "cancelled"]);

// ── Thực đơn ──

export const products = pgTable(
  "products",
  {
    id: text().primaryKey(),
    kind: productKind().notNull(),
    name: text().notNull(),
    short: text().notNull(),
    description: text(),
    price: integer().notNull(),
    image: text().notNull(),
    badge: text(),
    usesPan: smallint().notNull().default(0),
    usesBbq: smallint().notNull().default(0),
    comboConfig: jsonb().$type<ComboGroup[]>(),
    upsellIds: text().array().notNull().default(sql`'{}'::text[]`),
    supplier: text().$type<"reu">(),
    isActive: boolean().notNull().default(true),
    isAvailable: boolean().notNull().default(true),
    sort: smallint().notNull().default(0),
  },
  (t) => [
    check("products_price_check", sql`${t.price} >= 0`),
    check("products_short_check", sql`char_length(${t.short}) <= 40`),
    check("products_units_check", sql`${t.usesPan} >= 0 AND ${t.usesBbq} >= 0`),
  ],
).enableRLS();

/**
 * Nguyên liệu (bán thành phẩm, hàng dùng thẳng) + cột kho (§17.8, M10). `avg_cost` là đ/đơn vị gốc có phần lẻ —
 * ngoại lệ duy nhất của luật tiền nguyên; thành tiền luôn làm tròn về int.
 */
export const ingredients = pgTable(
  "ingredients",
  {
    id: text().primaryKey(),
    label: text().notNull(),
    unit: text().notNull(),
    unitWeightG: integer(),
    storage: text().notNull(),
    sort: smallint().notNull().default(0),
    level: stockLevel().notNull().default("prep"),
    trackStock: boolean().notNull().default(false),
    purchaseUnit: text(),
    purchaseFactor: numeric({ precision: 12, scale: 3, mode: "number" }),
    avgCost: numeric({ precision: 12, scale: 4, mode: "number" }).notNull().default(0),
    shelfLifeHours: integer(),
    parLevel: numeric({ precision: 12, scale: 3, mode: "number" }),
    aliases: text().array().notNull().default(sql`'{}'::text[]`),
    countClass: text().$type<CountClass>().notNull().default("C"),
    countRoles: role().array().$type<Role[]>().notNull().default(sql`'{kitchen}'::role[]`),
    countTolerancePct: smallint().notNull().default(5),
  },
  (t) => [
    check("ingredients_count_class_check", sql`${t.countClass} IN ('A', 'B', 'C')`),
    check("ingredients_cost_check", sql`${t.avgCost} >= 0`),
    check("ingredients_purchase_check", sql`(${t.purchaseUnit} IS NULL) = (${t.purchaseFactor} IS NULL) AND coalesce(${t.purchaseFactor}, 1) > 0`),
    check("ingredients_stock_check", sql`coalesce(${t.shelfLifeHours}, 1) > 0 AND coalesce(${t.parLevel}, 0) >= 0 AND ${t.countTolerancePct} BETWEEN 0 AND 100`),
  ],
).enableRLS();

export const recipeLines = pgTable(
  "recipe_lines",
  {
    productId: text()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    ingredientId: text()
      .notNull()
      .references(() => ingredients.id),
    qty: numeric({ precision: 10, scale: 2, mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.ingredientId] }), check("recipe_lines_qty_check", sql`${t.qty} > 0`)],
).enableRLS();

// ── Giao hàng ──

export const routes = pgTable("routes", {
  id: serial().primaryKey(),
  name: text().notNull(),
  sort: smallint().notNull().default(0),
}).enableRLS();

export const zones = pgTable(
  "zones",
  {
    id: serial().primaryKey(),
    name: text().notNull(),
    routeId: integer()
      .notNull()
      .references(() => routes.id),
    shipFee: integer().notNull(),
    sort: smallint().notNull().default(0),
    isActive: boolean().notNull().default(true),
  },
  (t) => [check("zones_ship_fee_check", sql`${t.shipFee} >= 0`)],
).enableRLS();

export const pickupPoints = pgTable("pickup_points", {
  id: serial().primaryKey(),
  name: text().notNull(),
  address: text().notNull(),
  mapsUrl: text(),
  giftProductId: text().references(() => products.id, { onDelete: "set null" }),
  isActive: boolean().notNull().default(true),
}).enableRLS();

// ── Lịch lò ──

export const slotTemplates = pgTable(
  "slot_templates",
  {
    id: serial().primaryKey(),
    weekday: smallint().notNull(),
    readyTime: time().notNull(),
    ovenLeadMin: smallint().notNull(),
    cutoffTime: time().notNull(),
    capPan: smallint().notNull(),
    capBbq: smallint().notNull(),
    isActive: boolean().notNull().default(true),
  },
  (t) => [
    unique("slot_templates_weekday_ready_time_key").on(t.weekday, t.readyTime),
    check("slot_templates_weekday_check", sql`${t.weekday} BETWEEN 0 AND 6`),
    check("slot_templates_cutoff_check", sql`${t.cutoffTime} < ${t.readyTime}`),
    check("slot_templates_cap_check", sql`${t.capPan} >= 0 AND ${t.capBbq} >= 0 AND ${t.ovenLeadMin} >= 0`),
  ],
).enableRLS();

export const serviceDays = pgTable("service_days", {
  date: isoDate().primaryKey(),
  status: dayStatus().notNull().default("open"),
  pauseMessage: text(),
  orderSeq: integer().notNull().default(0),
  summarySentAt: tstz(),
  note: text(),
}).enableRLS();

export const batches = pgTable(
  "batches",
  {
    id: serial().primaryKey(),
    serviceDate: isoDate()
      .notNull()
      .references(() => serviceDays.date, { onDelete: "cascade" }),
    readyAt: tstz().notNull(),
    ovenAt: tstz().notNull(),
    cutoffAt: tstz().notNull(),
    capPan: smallint().notNull(),
    capBbq: smallint().notNull(),
    usedPan: smallint().notNull().default(0),
    usedBbq: smallint().notNull().default(0),
    status: batchStatus().notNull().default("open"),
  },
  (t) => [
    unique("batches_service_date_ready_at_key").on(t.serviceDate, t.readyAt),
    check("batches_capacity_check", sql`${t.usedPan} <= ${t.capPan} AND ${t.usedBbq} <= ${t.capBbq}`),
    check("batches_used_check", sql`${t.usedPan} >= 0 AND ${t.usedBbq} >= 0`),
    check("batches_times_check", sql`${t.cutoffAt} <= ${t.ovenAt} AND ${t.ovenAt} <= ${t.readyAt}`),
  ],
).enableRLS();

// ── Khách & đơn ──

export const customers = pgTable("customers", {
  id: uuid().primaryKey().defaultRandom(),
  phone: text().notNull().unique(),
  name: text().notNull(),
  remember: boolean().notNull().default(false),
  orderCount: integer().notNull().default(0),
  completedCount: integer().notNull().default(0),
  noShowCount: integer().notNull().default(0),
  lastOrderAt: tstz(),
  isBlocked: boolean().notNull().default(false),
  staffNote: text(),
  marketingOptIn: boolean().notNull().default(false),
  createdAt: createdAt(),
}).enableRLS();

export const addresses = pgTable(
  "addresses",
  {
    id: uuid().primaryKey().defaultRandom(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    zoneId: integer()
      .notNull()
      .references(() => zones.id),
    description: text().notNull(),
    lat: doublePrecision(),
    lng: doublePrecision(),
    lastUsedAt: tstz().notNull().defaultNow(),
  },
  (t) => [index("addresses_customer_id_idx").on(t.customerId)],
).enableRLS();

export const orders = pgTable(
  "orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull().unique(),
    seq: integer().notNull(),
    serviceDate: isoDate()
      .notNull()
      .references(() => serviceDays.date),
    batchId: integer()
      .notNull()
      .references(() => batches.id),
    channel: channel().notNull().default("web"),
    customerId: uuid()
      .notNull()
      .references(() => customers.id),
    customerName: text().notNull(),
    customerPhone: text().notNull(),
    fulfillment: fulfillment().notNull(),
    zoneId: integer().references(() => zones.id),
    pickupPointId: integer().references(() => pickupPoints.id),
    addressText: text(),
    lat: doublePrecision(),
    lng: doublePrecision(),
    panUnits: smallint().notNull().default(0),
    bbqUnits: smallint().notNull().default(0),
    subtotal: integer().notNull(),
    shipFee: integer().notNull().default(0),
    discount: integer().notNull().default(0),
    total: integer().notNull(),
    paymentMethod: paymentMethod().notNull(),
    paymentStatus: paymentStatus().notNull().default("unpaid"),
    status: orderStatus().notNull().default("placed"),
    note: text(),
    source: text(),
    trackingToken: text().notNull().unique(),
    idempotencyKey: uuid().notNull().unique(),
    cancelReason: text(),
    /** Hạn giữ suất cho đơn bắt buộc trả trước (§18.2); null = không có hạn. */
    holdUntil: tstz(),
    createdAt: createdAt(),
    updatedAt: tstz()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("orders_service_date_seq_key").on(t.serviceDate, t.seq),
    index("orders_service_date_batch_id_idx").on(t.serviceDate, t.batchId),
    index("orders_customer_phone_idx").on(t.customerPhone),
    index("orders_status_idx").on(t.status),
    // releaseExpiredHolds chạy mỗi lần xem lò/đặt đơn → chỉ quét các đơn đang giữ suất.
    index("orders_hold_until_idx").on(t.holdUntil).where(sql`${t.status} = 'placed' AND ${t.paymentStatus} = 'unpaid' AND ${t.holdUntil} IS NOT NULL`),
    // Bất biến §6.3.4: đúng một trong zone_id / pickup_point_id, khớp với fulfillment.
    check(
      "orders_fulfillment_check",
      sql`(${t.fulfillment} = 'delivery' AND ${t.zoneId} IS NOT NULL AND ${t.pickupPointId} IS NULL)
        OR (${t.fulfillment} = 'pickup' AND ${t.pickupPointId} IS NOT NULL AND ${t.zoneId} IS NULL)`,
    ),
    // Bất biến §6.3.2 (phần trong một dòng).
    check(
      "orders_total_check",
      sql`${t.subtotal} >= 0 AND ${t.shipFee} >= 0 AND ${t.discount} >= 0
        AND ${t.total} = ${t.subtotal} + ${t.shipFee} - ${t.discount} AND ${t.total} >= 0`,
    ),
    check("orders_units_check", sql`${t.panUnits} >= 0 AND ${t.bbqUnits} >= 0`),
    check("orders_note_check", sql`char_length(${t.note}) <= 300`),
  ],
).enableRLS();

export const orderItems = pgTable(
  "order_items",
  {
    id: serial().primaryKey(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text()
      .notNull()
      .references(() => products.id),
    name: text().notNull(),
    unitPrice: integer().notNull(),
    qty: smallint().notNull(),
    lineTotal: integer().notNull(),
    parentItemId: integer().references((): AnyPgColumn => orderItems.id, { onDelete: "cascade" }),
    comboChoices: jsonb().$type<Record<string, string>>(),
    isGift: boolean().notNull().default(false),
  },
  (t) => [
    index("order_items_order_id_idx").on(t.orderId),
    check("order_items_qty_check", sql`${t.qty} > 0`),
    check("order_items_line_total_check", sql`${t.lineTotal} = ${t.unitPrice} * ${t.qty} AND ${t.unitPrice} >= 0`),
  ],
).enableRLS();

export const orderEvents = pgTable(
  "order_events",
  {
    id: serial().primaryKey(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    type: text().$type<"placed" | "status_changed" | "paid" | "cancelled" | "edited" | "refunded">().notNull(),
    data: jsonb(),
    actor: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("order_events_order_id_idx").on(t.orderId)],
).enableRLS();

export const payments = pgTable("payments", {
  id: serial().primaryKey(),
  orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
  /** `refund` = tiền hoàn cho khách (§18.1), `amount` âm. App không tự chuyển tiền — chỉ ghi nhận. */
  provider: text().$type<"sepay" | "manual" | "refund">().notNull(),
  providerTxnId: text().notNull().unique(),
  amount: integer().notNull(),
  memo: text(),
  raw: jsonb(),
  createdAt: createdAt(),
}).enableRLS();

// ── Vận hành ──

export const staff = pgTable("staff", {
  id: serial().primaryKey(),
  name: text().notNull().unique(),
  roles: role().array().$type<Role[]>().notNull(),
  pinHash: text().notNull(),
  isActive: boolean().notNull().default(true),
  telegramUserId: bigint({ mode: "number" }).unique(),
}, (t) => [check("staff_roles_check", sql`cardinality(${t.roles}) > 0`)]).enableRLS();

export const settings = pgTable("settings", {
  key: text().$type<"ordering" | "payment" | "shipping" | "contact" | "ops" | "payroll">().primaryKey(),
  value: jsonb().notNull(),
}).enableRLS();

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text().notNull(),
    windowStart: tstz().notNull(),
    count: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
).enableRLS();

// ── Vận hành nội bộ (§17) ──

/** Ca làm (§17.3). Tối đa một ca đang mở. Doanh thu café nhập từ báo cáo chốt ca Sapo khi đóng ca. */
export const shifts = pgTable(
  "shifts",
  {
    id: serial().primaryKey(),
    serviceDate: isoDate().notNull(),
    status: shiftStatus().notNull().default("open"),
    openedBy: integer().notNull().references(() => staff.id),
    openedAt: tstz().notNull(),
    closedBy: integer().references(() => staff.id),
    closedAt: tstz(),
    cafeCash: integer(),
    cafeTransfer: integer(),
    cafeOther: integer(),
    sapoPhoto: text(),
    note: text(),
  },
  (t) => [
    uniqueIndex("shifts_one_open").on(t.status).where(sql`${t.status} = 'open'`),
    check("shifts_cafe_check", sql`coalesce(${t.cafeCash}, 0) >= 0 AND coalesce(${t.cafeTransfer}, 0) >= 0 AND coalesce(${t.cafeOther}, 0) >= 0`),
    check("shifts_closed_check", sql`(${t.status} = 'open') = (${t.closedAt} IS NULL)`),
  ],
).enableRLS();

/**
 * Sổ két & hộp chi: lần đếm (`open·close·check`, có `counts` theo mệnh giá) và tiền ra/vào
 * (`drop` = nộp tiền két về chủ, `replenish` = nạp bù hộp chi). `expected` = số đáng có lúc đếm (đếm mù).
 */
export const cashEntries = pgTable(
  "cash_entries",
  {
    id: serial().primaryKey(),
    box: cashBox().notNull(),
    kind: cashEntryKind().notNull(),
    shiftId: integer().references(() => shifts.id),
    counts: jsonb().$type<CashCounts>(),
    total: integer().notNull(),
    expected: integer(),
    staffId: integer().notNull().references(() => staff.id),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.box, t.createdAt),
    check("cash_entries_total_check", sql`${t.total} >= 0`),
    check("cash_entries_counts_check", sql`(${t.kind} IN ('open', 'close', 'check')) = (${t.counts} IS NOT NULL)`),
    check("cash_entries_box_check", sql`(${t.kind} <> 'replenish' OR ${t.box} = 'petty') AND (${t.kind} NOT IN ('open', 'close', 'drop') OR ${t.box} = 'register')`),
  ],
).enableRLS();

/** Chi phí (§17.4). Không sửa/xoá — huỷ = `cancelled_at`. Tiền túi: pending → approved → reimbursed (| rejected). */
export const expenses = pgTable(
  "expenses",
  {
    id: serial().primaryKey(),
    spentAt: tstz().notNull(),
    amount: integer().notNull(),
    category: text().$type<ExpenseCategory>().notNull(),
    description: text().notNull(),
    source: expenseSource().notNull(),
    status: expenseStatus().notNull(),
    spentBy: integer().notNull().references(() => staff.id),
    approvedBy: integer().references(() => staff.id),
    reimbursedFrom: expenseSource(),
    reimbursedAt: tstz(),
    replenishId: integer().references(() => cashEntries.id),
    photo: text(),
    telegramFileId: text(),
    telegramChatId: bigint({ mode: "number" }),
    telegramMsgId: integer(),
    cancelledAt: tstz(),
    /** Trả nợ nhà cung cấp (M10) — chi phí này không nhập kho lần nữa. */
    supplierId: integer().references((): AnyPgColumn => suppliers.id),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.spentAt),
    check("expenses_amount_check", sql`${t.amount} > 0`),
    check("expenses_description_check", sql`char_length(${t.description}) BETWEEN 1 AND 200`),
    check("expenses_status_check", sql`(${t.source} = 'pocket') = (${t.status} <> 'recorded')`),
    check("expenses_reimburse_check", sql`(${t.status} = 'reimbursed') = (${t.reimbursedFrom} IS NOT NULL AND ${t.reimbursedFrom} <> 'pocket')`),
    unique("expenses_telegram_msg").on(t.telegramChatId, t.telegramMsgId),
  ],
).enableRLS();

/** Nhật ký kiểm toán vận hành (§17.1). */
export const opsEvents = pgTable(
  "ops_events",
  {
    id: serial().primaryKey(),
    type: text().notNull(),
    actor: text().notNull(),
    data: jsonb(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.createdAt)],
).enableRLS();

/** Chống xử lý trùng update Telegram (Telegram gửi lại khi webhook lỗi/chậm). Cron dọn > 7 ngày. */
export const telegramUpdates = pgTable("telegram_updates", {
  updateId: bigint({ mode: "number" }).primaryKey(),
  createdAt: createdAt(),
}).enableRLS();

/** Ảnh vận hành (báo cáo Sapo, hoá đơn) — lưu ngay trong Postgres, phục vụ qua route có kiểm tra phiên. */
export const opsFiles = pgTable("ops_files", {
  id: uuid().primaryKey().defaultRandom(),
  mime: text().notNull(),
  bytes: bytea().notNull(),
  size: integer().notNull(),
  createdBy: integer().references(() => staff.id),
  createdAt: createdAt(),
}, (t) => [check("ops_files_size_check", sql`${t.size} BETWEEN 1 AND 1048576`)]).enableRLS();

// ── Checklist & sổ tay (§17.5–17.6, M8) ──

/** Mẫu checklist theo vai trò & thời điểm. Không xoá — tắt bằng `is_active`. */
export const checklistTemplates = pgTable(
  "checklist_templates",
  {
    id: serial().primaryKey(),
    title: text().notNull(),
    roles: role().array().$type<Role[]>().notNull(),
    moment: checklistMoment().notNull(),
    items: jsonb().$type<ChecklistItem[]>().notNull(),
    sort: smallint().notNull().default(0),
    isActive: boolean().notNull().default(true),
  },
  (t) => [check("checklist_templates_title_check", sql`char_length(${t.title}) BETWEEN 1 AND 80`)],
).enableRLS();

/** Lượt checklist của một ngày (`weekly` = Thứ Hai đầu tuần). Nhiều người cùng tick một lượt. */
export const checklistRuns = pgTable(
  "checklist_runs",
  {
    id: serial().primaryKey(),
    templateId: integer()
      .notNull()
      .references(() => checklistTemplates.id),
    serviceDate: isoDate().notNull(),
    done: jsonb().$type<ChecklistDone>().notNull().default({}),
    completedAt: tstz(),
  },
  (t) => [unique("checklist_runs_template_date").on(t.templateId, t.serviceDate)],
).enableRLS();

/** Sổ tay: quy trình (`sop`) & công thức (`recipe`, gắn `product_id` → bảng định lượng đọc `recipe_lines`). */
export const handbookPages = pgTable(
  "handbook_pages",
  {
    id: serial().primaryKey(),
    slug: text().notNull().unique(),
    title: text().notNull(),
    kind: handbookKind().notNull(),
    roles: role().array().$type<Role[]>().notNull(),
    body: text().notNull(),
    productId: text().references(() => products.id),
    version: integer().notNull().default(1),
    updatedBy: integer().references(() => staff.id, { onDelete: "set null" }),
    updatedAt: createdAt(),
  },
  (t) => [
    check("handbook_pages_title_check", sql`char_length(${t.title}) BETWEEN 1 AND 80`),
    check("handbook_pages_body_check", sql`char_length(${t.body}) <= 20000`),
  ],
).enableRLS();

// ── Chấm công, bảng công, lương (§17.7, M9) ──

/** Lượt chấm công. Server ghi giờ & IP; tối đa một lượt đang mở mỗi người. Sửa giờ → cờ `edited` + lý do + ops_events. */
export const timeEntries = pgTable(
  "time_entries",
  {
    id: serial().primaryKey(),
    staffId: integer()
      .notNull()
      .references(() => staff.id),
    clockIn: tstz().notNull(),
    clockOut: tstz(),
    inIp: text(),
    outIp: text(),
    flags: text().array().$type<TimeFlag[]>().notNull().default(sql`'{}'::text[]`),
    editReason: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.staffId, t.clockIn),
    uniqueIndex("time_entries_one_open").on(t.staffId).where(sql`${t.clockOut} IS NULL`),
    check("time_entries_order_check", sql`${t.clockOut} IS NULL OR ${t.clockOut} >= ${t.clockIn}`),
  ],
).enableRLS();

/** Lịch ca theo ngày (một ca/người/ngày) — để tính đi muộn/về sớm, `late_out`. */
export const shiftPlans = pgTable(
  "shift_plans",
  {
    id: serial().primaryKey(),
    staffId: integer()
      .notNull()
      .references(() => staff.id),
    date: isoDate().notNull(),
    start: time().notNull(),
    end: time().notNull(),
  },
  (t) => [unique("shift_plans_staff_date").on(t.staffId, t.date), check("shift_plans_time_check", sql`${t.end} > ${t.start}`)],
).enableRLS();

/** Ngày lễ (owner nhập) — hệ số mặc định 3,0. */
export const holidays = pgTable(
  "holidays",
  {
    date: isoDate().primaryKey(),
    name: text().notNull(),
    multiplier: numeric({ precision: 3, scale: 1, mode: "number" }).notNull().default(3),
  },
  (t) => [check("holidays_multiplier_check", sql`${t.multiplier} >= 1 AND ${t.multiplier} <= 5`)],
).enableRLS();

/** Đơn giá giờ có lịch sử — tăng lương không đổi kỳ cũ. Chặn dưới mức tối thiểu ở DAL (mức do owner cập nhật). */
export const payRates = pgTable(
  "pay_rates",
  {
    id: serial().primaryKey(),
    staffId: integer()
      .notNull()
      .references(() => staff.id),
    hourlyRate: integer().notNull(),
    effectiveFrom: isoDate().notNull(),
    createdBy: integer().references(() => staff.id),
    createdAt: createdAt(),
  },
  (t) => [unique("pay_rates_staff_from").on(t.staffId, t.effectiveFrom), check("pay_rates_rate_check", sql`${t.hourlyRate} > 0`)],
).enableRLS();

/**
 * Bảng công tháng. `draft` tính sống từ time_entries; khi gửi chụp `snapshot` + `snapshot_hash` (sha256);
 * nhân viên xác nhận bằng PIN → `acknowledged` (khoá — giờ công trong kỳ không sửa được nữa).
 */
export const timesheets = pgTable(
  "timesheets",
  {
    id: serial().primaryKey(),
    staffId: integer()
      .notNull()
      .references(() => staff.id),
    period: text().notNull(),
    status: timesheetStatus().notNull().default("draft"),
    minutes: integer().notNull().default(0),
    nightMinutes: integer().notNull().default(0),
    overtimeMinutes: integer().notNull().default(0),
    holidayMinutes: integer().notNull().default(0),
    lateCount: integer().notNull().default(0),
    snapshot: jsonb(),
    snapshotHash: text(),
    submittedBy: integer().references(() => staff.id),
    submittedAt: tstz(),
    ackAt: tstz(),
    ackIp: text(),
    ackDevice: text(),
    disputeReason: text(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("timesheets_staff_period").on(t.staffId, t.period),
    check("timesheets_period_check", sql`${t.period} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check("timesheets_snapshot_check", sql`(${t.status} = 'draft') = (${t.snapshot} IS NULL)`),
  ],
).enableRLS();

/** Phiếu lương (chỉ owner tạo/duyệt) — chỉ từ bảng công đã xác nhận. */
export const payslips = pgTable(
  "payslips",
  {
    id: serial().primaryKey(),
    staffId: integer()
      .notNull()
      .references(() => staff.id),
    period: text().notNull(),
    timesheetId: integer()
      .notNull()
      .references(() => timesheets.id),
    lines: jsonb().$type<PayLine[]>().notNull(),
    meta: jsonb(),
    total: integer().notNull(),
    status: payslipStatus().notNull().default("draft"),
    approvedBy: integer().references(() => staff.id),
    approvedAt: tstz(),
    paidAt: tstz(),
    paidMethod: text().$type<"cash" | "bank">(),
    staffAckAt: tstz(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("payslips_staff_period").on(t.staffId, t.period),
    check("payslips_total_check", sql`${t.total} >= 0`),
    check("payslips_paid_check", sql`(${t.status} = 'paid') = (${t.paidAt} IS NOT NULL)`),
  ],
).enableRLS();

// ── Gói "Ngày bán" (§18, M9.5) ──

/** Bàn giao tiền COD của shipper (§18.4). Mỗi đơn chỉ nằm trong một lần bàn giao (kiểm ở DAL, dưới khoá dòng đơn). */
export const cashHandovers = pgTable(
  "cash_handovers",
  {
    id: serial().primaryKey(),
    serviceDate: isoDate().notNull(),
    shipperId: integer()
      .notNull()
      .references(() => staff.id),
    orderIds: uuid().array().notNull(),
    expected: integer().notNull(),
    received: integer().notNull(),
    receivedBy: integer()
      .notNull()
      .references(() => staff.id),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.serviceDate),
    check("cash_handovers_amount_check", sql`${t.expected} >= 0 AND ${t.received} >= 0`),
    check("cash_handovers_orders_check", sql`cardinality(${t.orderIds}) > 0`),
    check("cash_handovers_people_check", sql`${t.shipperId} <> ${t.receivedBy}`),
  ],
).enableRLS();

/** Chấm điểm khẩu vị (§18.5): một bản mỗi đơn; `ratings` = { productId: 1 (chưa hợp) | 2 (được) | 3 (ngon) }. */
export const feedback = pgTable(
  "feedback",
  {
    id: serial().primaryKey(),
    orderId: uuid()
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: "cascade" }),
    ratings: jsonb().$type<Record<string, 1 | 2 | 3>>().notNull(),
    tags: jsonb().$type<Record<string, string[]>>().notNull().default({}),
    comment: text(),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [index().on(t.createdAt), check("feedback_comment_check", sql`char_length(${t.comment}) <= 300`)],
).enableRLS();

// ── Kho 2 mức & công nợ nhà cung cấp (§17.8, M10) ──

/** Công thức sản xuất bán thành phẩm: một mẻ `lines` → `output_qty` đơn vị `output_id` (VD 1 mẻ bột → 6 đế). */
export const productionFormulas = pgTable(
  "production_formulas",
  {
    id: serial().primaryKey(),
    outputId: text()
      .notNull()
      .unique()
      .references(() => ingredients.id),
    outputQty: numeric({ precision: 12, scale: 3, mode: "number" }).notNull(),
    lines: jsonb().$type<FormulaLine[]>().notNull(),
  },
  (t) => [check("production_formulas_qty_check", sql`${t.outputQty} > 0`)],
).enableRLS();

/** Nhà cung cấp (lấy hàng trước, trả sau). */
export const suppliers = pgTable("suppliers", {
  id: serial().primaryKey(),
  name: text().notNull().unique(),
  aliases: text().array().notNull().default(sql`'{}'::text[]`),
  phone: text(),
  isActive: boolean().notNull().default(true),
  createdAt: createdAt(),
}).enableRLS();

/**
 * Phiếu nợ NCC. `amount` null = chưa biết giá (điền khi trả). Trả dần: `paid_amount` cộng dồn, đủ → `paid`.
 * Giá vốn ghi khi nhận hàng (stock_moves ref `bill`); chi phí ghi khi trả (expenses.supplier_id) — không tính hai lần.
 */
export const supplierBills = pgTable(
  "supplier_bills",
  {
    id: serial().primaryKey(),
    supplierId: integer()
      .notNull()
      .references(() => suppliers.id),
    receivedAt: tstz().notNull(),
    items: jsonb().$type<BillLine[]>().notNull(),
    amount: integer(),
    paidAmount: integer().notNull().default(0),
    photo: text(),
    status: billStatus().notNull().default("open"),
    paidExpenseId: integer().references(() => expenses.id),
    createdBy: integer()
      .notNull()
      .references(() => staff.id),
    telegramChatId: bigint({ mode: "number" }),
    telegramMsgId: integer(),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.supplierId, t.status),
    unique("supplier_bills_telegram_msg").on(t.telegramChatId, t.telegramMsgId),
    check("supplier_bills_amount_check", sql`coalesce(${t.amount}, 0) >= 0 AND ${t.paidAmount} >= 0 AND (${t.amount} IS NULL OR ${t.paidAmount} <= ${t.amount})`),
  ],
).enableRLS();

/**
 * Sổ kho — **tồn = Σ qty**. Không sửa/xoá; sai thì thêm dòng `adjust`. `unit_cost` = đ/đơn vị gốc tại thời điểm ghi.
 * Mỗi đơn chỉ trừ kho một lần (`sale`, ref `order`), mỗi chứng từ/phiếu chỉ nhập một lần (`purchase`) — index một phần.
 */
export const stockMoves = pgTable(
  "stock_moves",
  {
    id: serial().primaryKey(),
    ingredientId: text()
      .notNull()
      .references(() => ingredients.id),
    qty: numeric({ precision: 12, scale: 3, mode: "number" }).notNull(),
    kind: stockMoveKind().notNull(),
    unitCost: numeric({ precision: 12, scale: 4, mode: "number" }).notNull().default(0),
    refType: text().$type<"expense" | "bill" | "production" | "order" | "count" | "manual">(),
    refId: text(),
    reason: text().$type<WasteReason>(),
    note: text(),
    expiresAt: tstz(),
    /** Người ghi (staff.id). Không FK — như `order_events.actor`, sổ kho là nhật ký, không chặn xoá nhân viên. */
    createdBy: integer(),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.ingredientId, t.createdAt),
    uniqueIndex("stock_moves_once").on(t.kind, t.refType, t.refId, t.ingredientId).where(sql`${t.kind} IN ('sale', 'purchase')`),
    check("stock_moves_qty_check", sql`${t.qty} <> 0`),
    check("stock_moves_sign_check", sql`(${t.kind} IN ('purchase', 'produce_in')) = (${t.qty} > 0) OR ${t.kind} = 'adjust'`),
  ],
).enableRLS();

/** Lần đếm kho: `weekly` (kiểm kê tuần mọi mục track_stock) · `quick` (kiểm nhanh ABC cuối ca). Đếm mù. */
export const stockCounts = pgTable("stock_counts", {
  id: serial().primaryKey(),
  kind: text().$type<"weekly" | "quick">().notNull(),
  lines: jsonb().$type<CountLine[]>().notNull(),
  staffId: integer()
    .notNull()
    .references(() => staff.id),
  createdAt: createdAt(),
}, (t) => [index().on(t.createdAt)]).enableRLS();

export type Order = typeof orders.$inferSelect;
export type BatchRow = typeof batches.$inferSelect;
