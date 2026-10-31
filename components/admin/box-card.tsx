"use client";

import { useNow } from "@/components/admin/use-admin";
import { copy } from "@/data/copy";
import { holdLabel } from "@/lib/domain/hold";
import type { KitchenOrder } from "@/lib/server/dal/kitchen";

const t = copy.admin.box;

/**
 * Thẻ nắp hộp (§18.3): mã chữ rất to, khung đậm, tương phản cao — người đóng gói chép y nguyên bằng bút lông.
 * Dòng phụ (tên, nơi nhận, giờ) không cần chép.
 */
export function BoxCard({ order: o, readyLabel }: { order: KitchenOrder; readyLabel: string }) {
  const where = o.fulfillment === "pickup" ? copy.admin.orders.pickup(o.pickupName ?? "") : (o.zoneName ?? "");
  return (
    <figure
      aria-label={`${t.title} #${o.seq}: ${o.box.code}`}
      className="rounded-2xl border-4 border-text bg-bg px-4 py-3 text-text"
      data-box-code={o.box.code}
    >
      <p className="text-[40px] leading-none font-black tracking-tight tabular-nums" translate="no">
        {o.box.code}
      </p>
      {o.box.labels.length > 0 ? (
        <p className="mt-2 flex flex-wrap gap-1.5" aria-label={`${o.box.boxes} hộp`}>
          {o.box.labels.map((l) => (
            <span key={l} className="rounded-lg border-2 border-text px-2 text-xl font-bold tabular-nums">
              {l}
            </span>
          ))}
        </p>
      ) : null}
      <figcaption className="mt-2 text-sm text-secondary">
        {o.customerName} · {where} · {copy.admin.batch.ready(readyLabel)}
      </figcaption>
    </figure>
  );
}

/** "chờ CK · còn 04:10" cho đơn đang giữ suất (§18.2) — chạy theo đồng hồ máy. */
export function HoldBadge({ until }: { until: string }) {
  const now = useNow(1000);
  if (!now) return null;
  const l = holdLabel(new Date(until), new Date(now));
  return (
    <span className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-semibold tabular-nums ${l.expired ? "bg-danger text-black" : "bg-warn text-black"}`}>
      ⏳ {t.holding(l.remaining)}
    </span>
  );
}
