import { hash } from "@node-rs/argon2";
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { seedProducts } from "../data/seed";
import { orders as appendixB } from "../lib/domain/__tests__/fixtures";

// Trạng thái DB cho e2e: placeOrder ghi thật vào DB đã seed (TEST_NOW = Thứ Sáu 06/11/2026 10:00).
// Các test ghi DB chạy tuần tự (workers: 1) và dọn sạch đơn/khách/rate-limit trước mỗi test.

let sql: postgres.Sql | null = null;
const db = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("e2e cần DATABASE_URL (DB đã migrate + seed với TEST_NOW)");
  return (sql ??= postgres(url, { max: 1, onnotice: () => {} }));
};

export async function resetOrders() {
  const s = db();
  await s`DELETE FROM payments`;
  await s`DELETE FROM orders`;
  await s`DELETE FROM customers`;
  await s`DELETE FROM rate_limits`;
  await s`DELETE FROM expenses`;
  await s`DELETE FROM cash_entries`;
  await s`DELETE FROM shifts`;
  await s`DELETE FROM ops_files`;
  await s`DELETE FROM ops_events`;
  await s`DELETE FROM telegram_updates`;
  await s`DELETE FROM settings WHERE key = 'ops'`;
  await s`DELETE FROM checklist_runs`;
  // Trang sổ tay do e2e tạo/sửa (seed có updated_by = NULL); chạy lại `db:seed` nếu lỡ sửa trang seed.
  await s`DELETE FROM handbook_pages WHERE updated_by IS NOT NULL`;
  await s`DELETE FROM staff`;
  await s`UPDATE batches SET used_pan = 0, used_bbq = 0, status = 'open'`;
  await s`UPDATE service_days SET order_seq = 0, status = 'open'`;
}

/** Đặt số khay đã dùng của mẻ `hhmm` hôm 06/11 (giờ VN). */
export async function setUsedPan(hhmm: string, usedPan: number) {
  await db()`UPDATE batches SET used_pan = ${usedPan} WHERE ready_at = ${`2026-11-06T${hhmm}:00+07:00`}::timestamptz`;
}

export async function orderStatus(code: string) {
  const [row] = await db()<{ status: string }[]>`SELECT status FROM orders WHERE code = ${code}`;
  return row?.status ?? null;
}

export async function orderRow(code: string) {
  const [row] = await db()<{ status: string; payment_status: string; source: string | null; total: number; seq: number }[]>`
    SELECT status, payment_status, source, total, seq FROM orders WHERE code = ${code}`;
  return row ?? null;
}

export async function closeDb() {
  await sql?.end();
  sql = null;
}

/** Nhân viên cho e2e bếp: PIN của mọi người = 123456. */
export const STAFF = { owner: "Chủ quán", kitchen: "Bếp Tâm", shipper: "Ship Long", manager: "Quản lý Mai", barista: "Pha chế Vy" } as const;
const ROLES_OF: Record<keyof typeof STAFF, string> = {
  owner: "{owner}",
  kitchen: "{kitchen}",
  shipper: "{shipper}",
  manager: "{manager,barista}",
  barista: "{barista,server}",
};
export const PIN = "123456";

export async function seedStaff() {
  const pinHash = await hash(PIN);
  for (const [role, name] of Object.entries(STAFF)) {
    await db()`INSERT INTO staff (name, roles, pin_hash) VALUES (${name}, ${ROLES_OF[role as keyof typeof STAFF]}::role[], ${pinHash})
      ON CONFLICT (name) DO UPDATE SET roles = EXCLUDED.roles, pin_hash = EXCLUDED.pin_hash, is_active = true, telegram_user_id = NULL`;
  }
}

/** 12 đơn Phụ lục B (fixture domain) vào ngày 06/11 — mẻ 17/18/19h theo giờ VN. */
export async function seedAppendixB() {
  const s = db();
  const usesOf = new Map(seedProducts.map((p) => [p.id, p]));
  const batchIds = new Map<number, number>();
  for (const [fixtureId, hhmm] of [[1, "17:00"], [2, "18:00"], [3, "19:00"]] as const) {
    const [b] = await s<{ id: number }[]>`SELECT id FROM batches WHERE ready_at = ${`2026-11-06T${hhmm}:00+07:00`}::timestamptz`;
    batchIds.set(fixtureId, b.id);
  }
  for (const o of appendixB) {
    const mains = o.items.filter((i) => !i.isGift && usesOf.get(i.productId)?.kind !== "addon");
    const pan = mains.reduce((n, i) => n + (usesOf.get(i.productId)?.usesPan ?? 0) * i.qty, 0);
    const bbq = mains.reduce((n, i) => n + (usesOf.get(i.productId)?.usesBbq ?? 0) * i.qty, 0);
    const [c] = await s<{ id: string }[]>`INSERT INTO customers (phone, name, order_count) VALUES (${o.customerPhone}, ${o.customerName}, 1) RETURNING id`;
    const subtotal = o.items.reduce((n, i) => n + i.lineTotal, 0);
    const [row] = await s<{ id: string }[]>`
      INSERT INTO orders (code, seq, service_date, batch_id, customer_id, customer_name, customer_phone, fulfillment,
        zone_id, pickup_point_id, address_text, pan_units, bbq_units, subtotal, ship_fee, total, payment_method,
        payment_status, status, note, tracking_token, idempotency_key)
      VALUES (${o.code}, ${o.seq}, ${o.serviceDate}, ${batchIds.get(o.batchId)!}, ${c.id}, ${o.customerName}, ${o.customerPhone},
        ${o.fulfillment}, ${o.zoneId}, ${o.pickupPointId}, ${o.addressText}, ${pan}, ${bbq}, ${subtotal}, ${o.total - subtotal},
        ${o.total}, ${o.paymentMethod}, ${o.paymentStatus}, ${o.status}, ${o.note}, ${randomBytes(16).toString("base64url")}, ${randomUUID()})
      RETURNING id`;
    for (const i of o.items) {
      await s`INSERT INTO order_items (order_id, product_id, name, unit_price, qty, line_total, combo_choices, is_gift)
        VALUES (${row.id}, ${i.productId}, ${i.name}, ${i.unitPrice}, ${i.qty}, ${i.lineTotal}, ${i.comboChoices ? s.json(i.comboChoices) : null}, ${i.isGift})`;
    }
    await s`UPDATE batches SET used_pan = used_pan + ${pan}, used_bbq = used_bbq + ${bbq} WHERE id = ${batchIds.get(o.batchId)!}`;
  }
  await s`UPDATE service_days SET order_seq = ${appendixB.length} WHERE date = '2026-11-06'`;
}

/** Gắn tài khoản Telegram cho nhân viên (bot vận hành §17.4). */
export async function linkTelegram(name: string, telegramUserId: number) {
  await db()`UPDATE staff SET telegram_user_id = ${telegramUserId} WHERE name = ${name}`;
}

export async function expenseRows() {
  return db()<{ amount: number; description: string; source: string; status: string; category: string }[]>`
    SELECT amount, description, source, status, category FROM expenses ORDER BY id`;
}
