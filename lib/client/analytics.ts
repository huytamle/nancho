// Sự kiện analytics (§13.4) qua Vercel Web Analytics — không cookie quảng cáo. Mọi sự kiện kèm `src` (kênh marketing).
// Không gửi dữ liệu cá nhân (SĐT, tên, địa chỉ). Lỗi analytics không bao giờ được làm hỏng luồng đặt món.

import { track as vercelTrack } from "@vercel/analytics";
import { SRC_COOKIE } from "@/lib/source";

export type AnalyticsEvent =
  | "view_item"
  | "add_to_cart"
  | "begin_checkout"
  | "lookup_known"
  | "place_order"
  | "slot_full"
  | "cancel_order";

type Props = Record<string, string | number | boolean | null>;

function currentSource(): string | null {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${SRC_COOKIE}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

export function track(event: AnalyticsEvent, props: Props = {}) {
  try {
    vercelTrack(event, { ...props, src: currentSource() });
  } catch {}
}

/** Che token theo dõi đơn trong URL gửi đi (`/o/<token>` là "chìa khoá" xem đơn). */
export function redactUrl(url: string): string {
  return url.replace(/\/o\/[\w-]+/, "/o/[token]");
}
