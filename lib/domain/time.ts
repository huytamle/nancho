// Giờ Việt Nam (UTC+7, không có giờ mùa hè). Mọi tính toán ngày/giờ phía server
// đi qua file này — không dùng Date#getHours()/getDate() hay parse chuỗi thiếu offset.
// Hàm nào cần "bây giờ" thì nhận `now` làm tham số để test được.

export const VN_TZ = "Asia/Ho_Chi_Minh";
export type ISODate = `${number}-${number}-${number}`;

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const WEEKDAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Đồng hồ "giờ VN" biểu diễn bằng các trường UTC của một Date đã dịch +7h. */
function shifted(instant: Date) {
  return new Date(instant.getTime() + VN_OFFSET_MS);
}

export function isISODate(value: string): value is ISODate {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(d.getTime()) &&
    d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() + 1 === Number(m[2]) &&
    d.getUTCDate() === Number(m[3])
  );
}

export function isHHmm(value: string) {
  return TIME_RE.test(value);
}

/** "2026-11-06" + "18:00" → thời điểm 18:00 giờ VN. */
export function vnInstant(date: ISODate, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00+07:00`);
}

/** Đọc giá trị `<input type="datetime-local">` ("YYYY-MM-DDTHH:mm") theo giờ VN. */
export function parseVnLocal(value: string): Date | null {
  const [date, time] = value.split("T");
  if (!date || !time || !isISODate(date) || !isHHmm(time)) return null;
  return vnInstant(date, time);
}

/** Thời điểm → "YYYY-MM-DDTHH:mm" theo giờ VN (dùng cho `min` của datetime-local). */
export function toVnLocal(instant: Date): string {
  return `${vnDateOf(instant)}T${vnTimeLabel(instant)}`;
}

export function vnDateOf(instant: Date): ISODate {
  return shifted(instant).toISOString().slice(0, 10) as ISODate;
}

export function vnTimeLabel(instant: Date): string {
  const d = shifted(instant);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** 0 = Chủ nhật … 6 = Thứ Bảy. */
export function vnWeekday(date: ISODate): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  return new Date(`${date}T00:00:00Z`).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export function addDays(date: ISODate, n: number): ISODate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10) as ISODate;
}

/** "Tối nay" | "Mai" | "T7 07/11". */
export function vnDayLabel(date: ISODate, today: ISODate): string {
  if (date === today) return "Tối nay";
  if (date === addDays(today, 1)) return "Mai";
  const [, month, day] = date.split("-");
  return `${WEEKDAY_SHORT[vnWeekday(date)]} ${day}/${month}`;
}

/**
 * > 60 phút: "còn 2 giờ 15 phút" · 10–60 phút: "còn 18 phút"
 * < 10 phút: "còn 09:42" · ≤ 0: "đã chốt". Làm tròn lên để không báo thiếu thời gian.
 */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "đã chốt";
  if (ms < 10 * 60_000) {
    const s = Math.ceil(ms / 1000);
    return `còn ${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  }
  const min = Math.ceil(ms / 60_000);
  if (min <= 60) return `còn ${min} phút`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `còn ${h} giờ` : `còn ${h} giờ ${m} phút`;
}
