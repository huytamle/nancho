"use client";

import { useState } from "react";
import { ItemsList, StatusPill } from "@/components/admin/order-bits";
import { useKitchen } from "@/components/admin/use-admin";
import { copy } from "@/data/copy";
import { formatPhone } from "@/lib/domain/phone";
import type { OrderStatus } from "@/lib/domain/types";
import { formatPrice } from "@/lib/format";
import type { KitchenOrder } from "@/lib/server/dal/kitchen";

const t = copy.admin.orders;
type Filter = keyof typeof t.filters;

const MATCH: Record<Filter, (o: KitchenOrder) => boolean> = {
  all: (o) => o.status !== "cancelled",
  placed: (o) => o.status === "placed",
  active: (o) => (["confirmed", "baking", "ready", "delivering"] as OrderStatus[]).includes(o.status),
  unpaid: (o) => o.paymentStatus === "unpaid" && o.status !== "cancelled",
  done: (o) => o.status === "completed" || o.status === "no_show",
  cancelled: (o) => o.status === "cancelled",
};

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();

// Tab "Đơn" (§10.4): lọc theo trạng thái/mẻ/thanh toán, tìm theo SĐT/tên/mã; chạm → sheet chi tiết.
export function OrderList() {
  const { day, role, openOrder, openQuickOrder } = useKitchen();
  const [filter, setFilter] = useState<Filter>("all");
  const [batchId, setBatchId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const readyOf = new Map(day.batches.map((b) => [b.id, b.readyLabel]));

  const needle = fold(q.trim()).replace(/\s/g, "");
  const shown = day.orders.filter(
    (o) =>
      MATCH[filter](o) &&
      (batchId === null || o.batchId === batchId) &&
      (!needle || fold(`${o.customerName}${o.customerPhone}${o.code}#${o.seq}`).replace(/\s/g, "").includes(needle)),
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <label htmlFor="order-q" className="sr-only">
          {t.search}
        </label>
        <input id="order-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} className="input min-w-0 flex-1" />
        <label htmlFor="order-batch" className="sr-only">
          {t.allBatches}
        </label>
        <select
          id="order-batch"
          value={batchId ?? ""}
          onChange={(e) => setBatchId(e.target.value ? Number(e.target.value) : null)}
          className="input !w-auto shrink-0 appearance-none bg-[length:12px] bg-[right_0.75rem_center] bg-no-repeat !pr-9"
        >
          <option value="">{t.allBatches}</option>
          {day.batches.map((b) => (
            <option key={b.id} value={b.id}>
              {t.batchOption(b.readyLabel)}
            </option>
          ))}
        </select>
      </div>

      <div role="radiogroup" aria-label={copy.admin.tabs.don} className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
        {(Object.keys(t.filters) as Filter[]).map((f) => {
          const n = day.orders.filter(MATCH[f]).length;
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filter === f}
              onClick={() => setFilter(f)}
              className={`chip min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold tabular-nums ${
                filter === f ? "bg-invert text-on-invert" : "bg-elevated text-secondary"
              }`}
            >
              {t.filters[f]} {n}
            </button>
          );
        })}
      </div>

      <p className="text-sm text-secondary" aria-live="polite">
        {t.count(shown.length)}
      </p>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-secondary">{t.empty}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => openOrder(o.id)}
                className={`flex w-full items-start gap-3 rounded-2xl bg-surface p-4 text-left active:scale-[0.99] ${o.status === "placed" ? "ring-2 ring-accent" : ""}`}
              >
                <span className="w-12 shrink-0 text-2xl font-bold tabular-nums">#{o.seq}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{o.customerName}</span>
                    <span className="text-sm text-secondary tabular-nums">{formatPhone(o.customerPhone)}</span>
                    <StatusPill status={o.status} />
                  </span>
                  <span className="mt-0.5 block text-sm text-secondary">
                    {t.batchOption(readyOf.get(o.batchId) ?? "")} · {o.fulfillment === "pickup" ? t.pickup(o.pickupName ?? "") : o.zoneName}
                    {o.channel !== "web" ? ` · ${copy.admin.channel[o.channel]}` : ""}
                  </span>
                  <span className="mt-1.5 block">
                    <ItemsList items={o.items} />
                  </span>
                </span>
                <span className="shrink-0 text-right text-sm tabular-nums">
                  <span className="block font-semibold">{formatPrice(o.total)}</span>
                  <span className={`block ${o.collect > 0 && o.paymentMethod === "transfer" ? "text-warn" : "text-secondary"}`}>
                    {o.collect === 0 ? t.paid : o.paymentMethod === "transfer" ? t.transferUnpaid : "COD"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {role !== "shipper" ? (
        <button
          type="button"
          onClick={openQuickOrder}
          className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 min-h-14 rounded-full bg-accent px-5 text-[17px] font-semibold text-on-accent shadow-lg shadow-black/50 lg:bottom-6"
        >
          + {t.quickAdd}
        </button>
      ) : null}
    </div>
  );
}
