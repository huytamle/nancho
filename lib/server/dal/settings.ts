import "server-only";
import { site } from "@/data/site";
import { normalizePhone } from "@/lib/domain/phone";
import {
  DEFAULT_SETTINGS,
  type ContactSettings,
  type OrderingSettings,
  type PaymentSettings,
  type ShippingSettings,
} from "@/lib/domain/types";
import { getDb, type Executor } from "@/lib/server/db/client";
import { settings } from "@/lib/server/db/schema";

// Bảng settings (§6.2): key cố định, jsonb. Thiếu key/thiếu trường → rơi về mặc định,
// để quán chạy được ngay cả khi chủ quán chưa vào tab Cài đặt.

export type AppSettings = {
  ordering: OrderingSettings;
  payment: PaymentSettings;
  shipping: ShippingSettings;
  contact: ContactSettings;
};

const sitePhone = normalizePhone(site.contact.phoneDisplay) ?? "";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  ...DEFAULT_SETTINGS,
  contact: { hotline: sitePhone, zaloPhone: sitePhone },
};

export async function loadSettings(db: Executor = getDb()): Promise<AppSettings> {
  const rows = await db.select().from(settings);
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Partial<Record<keyof AppSettings, object>>;
  return {
    ordering: { ...DEFAULT_APP_SETTINGS.ordering, ...stored.ordering },
    payment: { ...DEFAULT_APP_SETTINGS.payment, ...stored.payment },
    shipping: { ...DEFAULT_APP_SETTINGS.shipping, ...stored.shipping },
    contact: { ...DEFAULT_APP_SETTINGS.contact, ...stored.contact },
  };
}
