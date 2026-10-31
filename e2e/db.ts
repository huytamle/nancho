import postgres from "postgres";

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
  await s`DELETE FROM orders`;
  await s`DELETE FROM customers`;
  await s`DELETE FROM rate_limits`;
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

export async function closeDb() {
  await sql?.end();
  sql = null;
}
