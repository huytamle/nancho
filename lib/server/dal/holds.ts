import "server-only";
import { sql } from "drizzle-orm";
import { HOLD_EXPIRED_REASON } from "@/lib/domain/hold";
import { releasesCapacity } from "@/lib/domain/order-status";
import { getDb, type Executor } from "@/lib/server/db/client";

// Hết giờ giữ suất (§18.2). Không cần cron: gọi ở đầu transaction placeOrder, khi dựng Oven Bar, trang đơn
// và màn bếp — suất trả về ngay khi có người xem/đặt.

// Chỉ đơn `placed` bị huỷ ở đây → luôn trả suất (cùng quy tắc với huỷ thường).
const RELEASES = releasesCapacity("placed", "cancelled");

export type ExpiredHold = { id: string; seq: number; batchId: number };

/**
 * Một câu SQL (CTE ghi dữ liệu) = một thao tác nguyên tử: huỷ đơn quá hạn → trả suất theo mẻ → ghi order_events.
 * Hai request song song: request sau chờ khoá dòng đơn, Postgres xét lại `status = 'placed'` trên bản đã commit
 * → đơn đã huỷ không lọt vào lần thứ hai → suất được trả **đúng một lần**.
 */
export async function releaseExpiredHolds(now: Date, db: Executor = getDb()): Promise<ExpiredHold[]> {
  const at = now.toISOString();
  const rows = await db.execute<{ id: string; seq: number; batch_id: number }>(sql`
    WITH expired AS (
      UPDATE orders
         SET status = 'cancelled', cancel_reason = ${HOLD_EXPIRED_REASON}, updated_at = ${at}::timestamptz
       WHERE status = 'placed' AND payment_status = 'unpaid'
         AND hold_until IS NOT NULL AND hold_until < ${at}::timestamptz
      RETURNING id, seq, batch_id, pan_units, bbq_units
    ),
    released AS (
      UPDATE batches b
         SET used_pan = b.used_pan - s.pan, used_bbq = b.used_bbq - s.bbq
        FROM (SELECT batch_id, sum(pan_units)::int AS pan, sum(bbq_units)::int AS bbq FROM expired GROUP BY batch_id) s
       WHERE b.id = s.batch_id AND ${RELEASES}
      RETURNING b.id
    ),
    logged AS (
      INSERT INTO order_events (order_id, type, actor, data, created_at)
      SELECT id, 'cancelled', 'system', jsonb_build_object('from', 'placed', 'reason', 'hold_expired'), ${at}::timestamptz
        FROM expired
      RETURNING order_id
    )
    SELECT id, seq, batch_id FROM expired
  `);
  return rows.map((r) => ({ id: r.id, seq: Number(r.seq), batchId: Number(r.batch_id) }));
}
