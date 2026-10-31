// Hợp đồng action của Kitchen Dashboard (§8.2) — chỉ kiểu, dùng chung client/server.

import type { Channel } from "@/lib/domain/types";
import type { PlaceOrderInput, PlaceOrderResult } from "@/lib/order-contract";

export type AdminError =
  | "forbidden"
  | "invalid"
  | "not_found"
  | "slot_full"
  | "below_used"
  | "too_late"
  | "reason_required"
  // Vận hành (§17)
  | "shift_open"
  | "no_shift"
  | "photo_required"
  | "locked"
  | "self_review"
  // Checklist & sổ tay (§17.5–17.6)
  | "value_required"
  | "photo_needed"
  | "duplicate"
  // Chấm công & lương (§17.7)
  | "clocked_in"
  | "not_clocked_in"
  | "wrong_pin"
  | "rate_limited"
  | "unresolved"
  | "period_open"
  | "missing_rate"
  | "below_min"
  // Ngày bán (§18)
  | "refund_required"
  // Kho & công nợ (§17.8)
  | "no_debt"
  | "server_error";

export type AdminResult<T = object> = ({ ok: true } & T) | { ok: false; reason: AdminError };

export type QuickOrderInput = Omit<PlaceOrderInput, "website" | "startedAt"> & {
  channel: Extract<Channel, "phone" | "zalo" | "walkin">;
  overrideCutoff: boolean;
};

export type QuickOrderResult = PlaceOrderResult | { ok: false; reason: "forbidden" };

export type LoginResult = { ok: false; reason: "invalid" | "wrong_pin" | "rate_limited" | "server_error" };
