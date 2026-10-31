// Giữ suất có hạn cho đơn bắt buộc trả trước (BLUEPRINT §18.2). Thuần — không import DB/Next/React.
//
// Chỉ đơn mà `requiresPrepay` buộc chuyển khoản trước mới có hạn; CK tự nguyện và COD không có hạn.
// Hết hạn mà tiền chưa về → huỷ (actor `system`, lý do HOLD_EXPIRED_REASON), trả suất như huỷ thường.

import { formatRemaining, vnTimeLabel } from "@/lib/domain/time";
import type { OrderStatus, PaymentMethod, PaymentStatus } from "@/lib/domain/types";

export const DEFAULT_HOLD_MINUTES = 15;

/** `cancel_reason` của đơn tự huỷ vì hết giờ giữ suất (hiện cho bếp, nhận diện ở trang đơn & webhook SePay). */
export const HOLD_EXPIRED_REASON = "Hết giờ giữ suất (chưa nhận CK)";

/** Đơn này có giữ suất có hạn không: khách tự đặt, CK, và chính sách bắt buộc trả trước. */
export function needsHold(o: { paymentMethod: PaymentMethod; prepayRequired: boolean; byStaff: boolean }): boolean {
  return !o.byStaff && o.paymentMethod === "transfer" && o.prepayRequired;
}

export function holdUntil(createdAt: Date, minutes = DEFAULT_HOLD_MINUTES): Date {
  return new Date(createdAt.getTime() + Math.max(1, Math.round(minutes)) * 60_000);
}

type HoldState = { status: OrderStatus; paymentStatus: PaymentStatus; holdUntil: Date | null };

/** Đơn đang chờ CK trong hạn giữ suất (đã quá hạn vẫn tính là "đang giữ" cho tới khi bị huỷ). */
export const isHeld = (o: HoldState) => o.holdUntil !== null && o.status === "placed" && o.paymentStatus === "unpaid";

/** Quá hạn và vẫn chưa trả → sẽ bị huỷ ở lần `releaseExpiredHolds` kế tiếp. Đúng mốc hạn chưa tính là hết. */
export const isExpired = (o: HoldState, now: Date) => isHeld(o) && now.getTime() > o.holdUntil!.getTime();

/** "Giữ suất đến 17:32 · còn 12 phút" — khách; `short` = "chờ CK · còn 04:10" — bếp. */
export function holdLabel(until: Date, now: Date): { until: string; remaining: string; short: string; expired: boolean } {
  const ms = until.getTime() - now.getTime();
  const remaining = ms > 0 ? formatRemaining(ms) : "hết giờ";
  return { until: vnTimeLabel(until), remaining, short: `chờ CK · ${remaining}`, expired: ms <= 0 };
}
