// Khoá lò khẩn cấp (BLUEPRINT §18.1). Thuần — dùng chung client/server.
// Khoá = `service_days.status = paused` + `pause_message` (Oven Bar & placeOrder đã xử lý `paused`).

import type { OrderStatus } from "@/lib/domain/types";

export const PAUSE_PRESETS = ["Mất điện", "Lò gặp sự cố", "Mưa bão, không giao được"] as const;

/** Lời nhắn khách thấy trên Oven Bar. */
export function pauseMessage(reason: string): string {
  const r = reason.trim().replace(/[.!]+$/, "");
  return r ? `Quán tạm ngưng nhận đơn — ${r}. Xin lỗi bạn!` : "Quán tạm ngưng nhận đơn. Xin lỗi bạn!";
}

/** Lý do huỷ ghi trên đơn bị huỷ vì khoá lò — trang đơn nhận ra bằng tiền tố này. */
export const PAUSE_CANCEL_PREFIX = "Quán tạm ngưng";
export const pauseCancelReason = (reason: string) => (reason.trim() ? `${PAUSE_CANCEL_PREFIX}: ${reason.trim()}` : PAUSE_CANCEL_PREFIX);

/** Đơn huỷ vì khoá lò → lý do (có thể rỗng); đơn khác → null. */
export function pauseCancelOf(cancelReason: string | null): string | null {
  if (!cancelReason?.startsWith(PAUSE_CANCEL_PREFIX)) return null;
  return cancelReason.slice(PAUSE_CANCEL_PREFIX.length).replace(/^:\s*/, "");
}

const FINISHED: OrderStatus[] = ["completed", "cancelled", "no_show"];

/** Đơn còn dở dang khi khoá lò → cần gọi khách / huỷ / hoàn tiền. */
export const isAffected = (status: OrderStatus) => !FINISHED.includes(status);

/** Ngược của `pauseMessage` (lời nhắn do owner tự gõ ở Cài đặt → trả nguyên văn). */
export function pauseReasonOf(message: string | null): string {
  const m = message?.match(/^Quán tạm ngưng nhận đơn(?: — (.*))?\. Xin lỗi bạn!$/);
  return m ? (m[1] ?? "") : (message ?? "").trim();
}
