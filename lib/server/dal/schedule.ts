import "server-only";
import { and, asc, between, eq } from "drizzle-orm";
import { computeOvenStatus, upcomingSlots, type OvenSnapshot, type OvenStatus } from "@/lib/domain/oven-status";
import { addDays, vnDateOf, vnDayLabel, vnInstant, vnWeekday, type ISODate } from "@/lib/domain/time";
import type { Segment, ServiceDay } from "@/lib/domain/types";
import { getDb, type Db, type Executor } from "@/lib/server/db/client";
import { batches, serviceDays, slotTemplates } from "@/lib/server/db/schema";
import { releaseExpiredHolds } from "@/lib/server/dal/holds";
import { loadSettings } from "@/lib/server/dal/settings";

// Lịch lò (§3.1, §7.2). Mẻ được sinh từ slot_templates; giờ luôn đổi qua vnInstant (giờ VN).

/** `time` của Postgres trả "17:00:00" → "17:00". */
const hhmm = (t: string) => t.slice(0, 5);

/**
 * Tạo service_days + batches cho `days` ngày bắt đầu từ `from`. Idempotent: chỉ sinh mẻ cho ngày
 * **chưa có** service_day, nên mẻ chủ quán đã sửa/xoá/đóng tay không bị tạo lại. Ngày không có
 * template (lò nghỉ) không được tạo → Oven Bar hiện `day_off`.
 */
export async function ensureBatches(from: ISODate, days: number, db: Db = getDb()) {
  const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
  return db.transaction(async (tx) => {
    const templates = await tx.select().from(slotTemplates).where(eq(slotTemplates.isActive, true));
    const forDay = (date: ISODate) => templates.filter((t) => t.weekday === vnWeekday(date));

    const wanted = dates.filter((d) => forDay(d).length > 0);
    if (wanted.length === 0) return { days: 0, batches: 0 };

    const created = await tx
      .insert(serviceDays)
      .values(wanted.map((date) => ({ date })))
      .onConflictDoNothing()
      .returning({ date: serviceDays.date });
    const isNew = new Set(created.map((c) => c.date));

    // Khung cà phê (M12) thêm cả cho ngày đã có từ trước (DB cũ chỉ có mẻ pizza) — ngày nào chưa có khung nào.
    const withCafe = new Set(
      (
        await tx
          .selectDistinct({ date: batches.serviceDate })
          .from(batches)
          .where(and(between(batches.serviceDate, dates[0], dates.at(-1)!), eq(batches.segment, "cafe")))
      ).map((r) => r.date),
    );

    const rows = wanted.flatMap((date) =>
      forDay(date)
        .filter((t) => isNew.has(date) || (t.segment === "cafe" && !withCafe.has(date)))
        .map((t) => {
          const readyAt = vnInstant(date, hhmm(t.readyTime));
          return {
            serviceDate: date,
            readyAt,
            ovenAt: new Date(readyAt.getTime() - t.ovenLeadMin * 60_000),
            cutoffAt: vnInstant(date, hhmm(t.cutoffTime)),
            capPan: t.capPan,
            capBbq: t.capBbq,
            segment: t.segment,
          };
        }),
    );
    const inserted = rows.length > 0 ? await tx.insert(batches).values(rows).onConflictDoNothing().returning({ id: batches.id }) : [];
    return { days: created.length, batches: inserted.length };
  });
}

/** Các ngày phục vụ trong [from, to] (gồm cả hai đầu), mẻ của `segment` sắp theo giờ sẵn sàng. */
export async function loadServiceDays(from: ISODate, to: ISODate, db: Executor = getDb(), segment: Segment = "pizza"): Promise<ServiceDay[]> {
  const [dayRows, batchRows] = await Promise.all([
    db.select().from(serviceDays).where(between(serviceDays.date, from, to)).orderBy(asc(serviceDays.date)),
    db
      .select()
      .from(batches)
      .where(and(between(batches.serviceDate, from, to), eq(batches.segment, segment)))
      .orderBy(asc(batches.readyAt)),
  ]);
  return dayRows.map((d) => ({
    date: d.date,
    status: d.status,
    pauseMessage: d.pauseMessage,
    batches: batchRows.filter((b) => b.serviceDate === d.date),
  }));
}

/** Trạng thái Oven Bar cho hôm nay + `daysAhead` ngày tới. Động — không cache (§5.3). */
export async function getOvenStatus(now: Date, db: Executor = getDb()): Promise<OvenStatus> {
  return (await getOvenSnapshot(now, db)).status;
}

/** Dữ liệu cho Oven Bar + chọn mẻ phía client (`GET /api/oven`, §8.2). Trả suất của đơn hết giờ giữ trước (§18.2). */
export async function getOvenSnapshot(now: Date, db: Executor = getDb()): Promise<OvenSnapshot> {
  await releaseExpiredHolds(now, db);
  const { ordering, shipping } = await loadSettings(db);
  const today = vnDateOf(now);
  const to = addDays(today, ordering.daysAhead);
  const [days, cafeDays] = await Promise.all([loadServiceDays(today, to, db), loadServiceDays(today, addDays(today, 1), db, "cafe")]);
  return {
    serverNow: now.toISOString(),
    status: computeOvenStatus({ now, days, settings: ordering }),
    days: upcomingSlots({ now, days, settings: ordering }),
    // Cà phê: hôm nay + ngày mai là đủ (đồ uống không đặt trước nhiều ngày).
    cafe: upcomingSlots({ now, days: cafeDays, settings: ordering }).map((d) => ({ ...d, label: vnDayLabel(d.date, today, true) })),
    rules: {
      maxQtyPerLine: ordering.maxQtyPerLine,
      freeShipFrom: shipping.freeShipFrom,
      deliveryWindowMin: ordering.deliveryWindowMin,
    },
  };
}
