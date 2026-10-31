// Kiểu dữ liệu domain dùng chung (BLUEPRINT §6, §7). Thuần — không import DB/Next/React.
// Tiền luôn là số nguyên VND. Thời điểm là Date (UTC), ngày phục vụ là ISODate theo giờ VN.

import type { ISODate } from "@/lib/domain/time";

export type { ISODate };

export type Kind = "pizza" | "bbq" | "combo" | "addon";

export type ComboGroup = { key: string; label: string; options: string[] };

export type Product = {
  id: string;
  kind: Kind;
  name: string;
  short: string;
  price: number;
  image: string;
  badge: string | null;
  usesPan: number;
  usesBbq: number;
  comboConfig: ComboGroup[] | null;
  upsellIds: string[];
  supplier: "reu" | null;
  isActive: boolean;
  isAvailable: boolean;
  sort: number;
};

export type Ingredient = {
  id: string;
  label: string;
  unit: string;
  unitWeightG: number | null;
  storage: string;
  sort: number;
};

export type RecipeLine = { productId: string; ingredientId: string; qty: number };

export type Route = { id: number; name: string; sort: number };

export type Zone = {
  id: number;
  name: string;
  routeId: number;
  shipFee: number;
  sort: number;
  isActive: boolean;
};

export type PickupPoint = {
  id: number;
  name: string;
  address: string;
  mapsUrl: string | null;
  giftProductId: string | null;
  isActive: boolean;
};

export type DayStatus = "open" | "closed" | "paused";
export type BatchStatus = "open" | "closed" | "baking" | "done";

export type Batch = {
  id: number;
  serviceDate: ISODate;
  readyAt: Date;
  ovenAt: Date;
  cutoffAt: Date;
  capPan: number;
  capBbq: number;
  usedPan: number;
  usedBbq: number;
  status: BatchStatus;
};

export type ServiceDay = {
  date: ISODate;
  status: DayStatus;
  pauseMessage?: string | null;
  batches: Batch[];
};

export type Channel = "web" | "phone" | "zalo" | "walkin" | "grab" | "shopee";
export type Fulfillment = "delivery" | "pickup";
export type PaymentMethod = "cod" | "transfer";
export type PaymentStatus = "unpaid" | "paid" | "refunded";
export type OrderStatus =
  | "placed"
  | "confirmed"
  | "baking"
  | "ready"
  | "delivering"
  | "completed"
  | "cancelled"
  | "no_show";

export type OrderItem = {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
  lineTotal: number;
  comboChoices: Record<string, string> | null;
  isGift: boolean;
};

export type OrderWithItems = {
  id: string;
  code: string;
  seq: number;
  serviceDate: ISODate;
  batchId: number;
  customerName: string;
  customerPhone: string;
  fulfillment: Fulfillment;
  zoneId: number | null;
  pickupPointId: number | null;
  addressText: string | null;
  lat: number | null;
  lng: number | null;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  note: string | null;
  items: OrderItem[];
};

// Bảng settings (§6.2) — key cố định, giá trị jsonb.
export type OrderingSettings = {
  daysAhead: number;
  closingSoonMin: number;
  fewThreshold: number;
  deliveryWindowMin: number;
  maxQtyPerLine: number;
};
export type PaymentSettings = { prepayPolicy: "risk_based" | "never" | "always"; prepayOverTotal: number };
export type ShippingSettings = { freeShipFrom: number | null };
export type ContactSettings = { hotline: string; zaloPhone: string };
/** Vận hành (§17.3): ngưỡng lệch két, định mức hộp chi — VND. */
export type OpsSettings = { cashTolerance: number; pettyFloat: number };

export const DEFAULT_SETTINGS = {
  ordering: { daysAhead: 4, closingSoonMin: 45, fewThreshold: 2, deliveryWindowMin: 20, maxQtyPerLine: 10 },
  payment: { prepayPolicy: "risk_based", prepayOverTotal: 1_000_000 },
  shipping: { freeShipFrom: null },
  ops: { cashTolerance: 20_000, pettyFloat: 1_000_000 },
} as const satisfies {
  ordering: OrderingSettings;
  payment: PaymentSettings;
  shipping: ShippingSettings;
  ops: OpsSettings;
};
