// Hợp đồng `placeOrder` dùng chung client/server (§8.1). Chỉ kiểu + kiểm tra nhẹ — không kéo zod lên trình duyệt.

import type { CheckoutErrorKey } from "@/data/copy";
import type { SlotView } from "@/lib/domain/oven-status";
import type { PromoError } from "@/lib/domain/promo";
import { normalizePhone } from "@/lib/domain/phone";
import type { TransferInfo } from "@/lib/payments";

export type PlaceOrderInput = {
  idempotencyKey: string;
  batchId: number;
  lines: {
    productId: string;
    qty: number;
    comboChoices?: Record<string, string>;
    addons?: { productId: string; qty: number }[];
  }[];
  customer: { phone: string; name: string; remember: boolean };
  fulfillment:
    | { type: "delivery"; zoneId: number; addressText?: string; savedAddressToken?: string; lat?: number; lng?: number }
    | { type: "pickup"; pickupPointId: number };
  paymentMethod: "cod" | "transfer";
  note?: string;
  /** Mã ưu đãi hoặc mã giới thiệu (M12). */
  promoCode?: string;
  website?: string;
  startedAt: number;
};

export type FieldKey = "phone" | "name" | "zone" | "address" | "note";
export type FieldErrors = Partial<Record<FieldKey, CheckoutErrorKey>>;

export type PlaceOrderResult =
  | {
      ok: true;
      code: string;
      seq: number;
      trackingPath: string;
      readyLabel: string;
      dayLabel: string;
      /** "khoảng 18:00–18:20" (giao) · "18:00 tại Cà phê Rêu" (nhận tại quầy). */
      etaLabel: string;
      cutoffLabel: string;
      total: number;
      discount: number;
      /** Điểm sẽ cộng khi đơn hoàn tất (khách đăng nhập); null = khách vãng lai. */
      points: number | null;
      status: "placed" | "confirmed";
      /** Đơn bắt buộc trả trước: giữ suất tới lúc này (ISO, §18.2); null = không có hạn. */
      holdUntil: string | null;
      payment: { method: "cod" } | ({ method: "transfer" } & TransferInfo);
    }
  | { ok: false; reason: "invalid"; fieldErrors: FieldErrors }
  | { ok: false; reason: "slot_full" | "cutoff_passed"; alternatives: SlotView[] }
  | { ok: false; reason: "unavailable"; productIds: string[] }
  | { ok: false; reason: "prepay_required" }
  | { ok: false; reason: "promo"; promo: PromoError; minSubtotal?: number }
  | { ok: false; reason: "rate_limited" | "paused" | "contact_us" | "server_error" };

export const LIMITS = { nameMin: 2, nameMax: 40, addressMin: 8, addressMax: 200, noteMax: 300 } as const;

/** Kiểm tra phía client (gợi ý sớm). Server kiểm tra lại bằng zod với cùng giới hạn & cùng mã lỗi. */
export function checkFields(f: {
  phone: string;
  name: string;
  fulfillment: "delivery" | "pickup";
  zoneId: number | null;
  addressText: string;
  note: string;
  /** Khách chọn "Dùng địa chỉ này" (savedAddressToken) → không cần gõ mô tả nhà. */
  savedAddress?: boolean;
}): FieldErrors {
  const e: FieldErrors = {};
  const name = f.name.trim();
  if (!normalizePhone(f.phone)) e.phone = "phoneInvalid";
  if (name.length < LIMITS.nameMin) e.name = "nameShort";
  else if (name.length > LIMITS.nameMax) e.name = "nameLong";
  if (f.fulfillment === "delivery") {
    const addr = f.addressText.trim();
    if (f.zoneId === null) e.zone = "zoneRequired";
    if (!f.savedAddress) {
      if (addr.length < LIMITS.addressMin) e.address = "addressShort";
      else if (addr.length > LIMITS.addressMax) e.address = "addressLong";
    }
  }
  if (f.note.trim().length > LIMITS.noteMax) e.note = "noteLong";
  return e;
}

/** Kết quả `lookupCustomer` (§7.7). Thiết bị lạ chỉ thấy tên gọi + tên khu vực — không bao giờ thấy mô tả nhà. */
export type LookupResult =
  | { status: "new" }
  | {
      status: "known";
      greetingName: string;
      zoneId: number | null;
      zoneName: string | null;
      savedAddressToken: string | null;
      requiresPrepay: boolean;
    }
  | {
      status: "self";
      name: string;
      zoneId: number | null;
      addressText: string | null;
      lat: number | null;
      lng: number | null;
      requiresPrepay: boolean;
    };

/** `checkPromo` (M12): xem trước mã ở bước chốt đơn — server tính lại khi đặt. */
export type PromoPreview =
  | { ok: true; amount: number; code: string }
  | { ok: false; reason: PromoError | "rate_limited"; minSubtotal?: number };

export type CancelResult = { ok: true } | { ok: false; reason: "too_late" | "not_found" | "rate_limited" };
