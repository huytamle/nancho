"use client";

import { advanceOrders } from "@/app/actions/admin";
import { NoteLine, StatusPill } from "@/components/admin/order-bits";
import { copyText, telHref, useAdminAction, useKitchen } from "@/components/admin/use-admin";
import { copy } from "@/data/copy";
import { site } from "@/data/site";
import { canTransitionAs } from "@/lib/domain/roles";
import { formatPhone } from "@/lib/domain/phone";
import type { OrderStatus } from "@/lib/domain/types";
import { formatPrice } from "@/lib/format";
import { pickupText, routeMapsUrl, shipperText } from "@/lib/kitchen-text";
import type { KitchenOrder } from "@/lib/server/dal/kitchen";

const t = copy.admin.delivery;

// Tab "Giao" (§10.5): theo mẻ → tuyến; tổng COD, copy gửi shipper, bắt đầu giao, kết thúc từng điểm; quầy Rêu.
export function DeliveryBoard() {
  const { day, orderRoles, openOrder } = useKitchen();
  const { pending, run } = useAdminAction();
  const byCode = new Map(day.orders.map((o) => [o.code, o]));
  const now = new Date(day.serverNow);
  const can = (o: KitchenOrder, to: OrderStatus) =>
    canTransitionAs(orderRoles, o.status, to, {
      fulfillment: o.fulfillment,
      now,
      cutoffAt: new Date(day.batches.find((b) => b.id === o.batchId)?.cutoffAt ?? 0),
    }).ok;
  const act = (ids: string[], to: "delivering" | "completed" | "no_show", ok: string = copy.admin.saved) =>
    run(() => advanceOrders({ orderIds: ids, to }), ok);

  const groups = day.prep.batches.filter((b) => b.routes.length > 0 || b.pickups.length > 0);
  if (groups.length === 0) return <p className="py-10 text-center text-secondary">{t.empty}</p>;

  const btn = "min-h-14 rounded-full px-4 text-[15px] font-semibold disabled:opacity-40";

  return (
    <div className="space-y-6">
      {groups.map((b) => (
        <section key={b.batchId} aria-labelledby={`giao-${b.batchId}`} className="space-y-3">
          <h2 id={`giao-${b.batchId}`} className="text-2xl font-bold tabular-nums">
            {copy.admin.batch.ready(b.readyLabel)}
          </h2>

          {b.routes.map((r) => {
            const stops = r.stops.map((s) => ({ stop: s, order: byCode.get(s.code) })).filter((x) => x.order);
            const collect = r.stops.reduce((sum, s) => sum + s.collect, 0);
            const startable = stops.filter((x) => can(x.order!, "delivering")).map((x) => x.order!.id);
            const maps = routeMapsUrl(
              stops.map((x) => x.order!),
              site.kitchen.coords,
            );
            return (
              <article key={r.routeId} aria-label={r.routeName} className="rounded-tile bg-surface p-5">
                <h3 className="text-lg font-semibold">🛵 {r.routeName}</h3>
                <p className="text-secondary tabular-nums">{t.routeHead(r.stops.length, formatPrice(collect))}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => copyText(shipperText({ readyLabel: b.readyLabel, routeName: r.routeName, stops: r.stops }))} className={`${btn} bg-elevated`}>
                    📋 {t.copy}
                  </button>
                  <button type="button" disabled={pending || startable.length === 0} onClick={() => act(startable, "delivering", t.started)} className={`${btn} bg-invert text-on-invert`}>
                    {t.start}
                  </button>
                  {maps ? (
                    <a href={maps} target="_blank" rel="noreferrer" className={`${btn} col-span-2 flex items-center justify-center bg-elevated`}>
                      🗺 {t.route}
                    </a>
                  ) : null}
                </div>
                <ol className="mt-4 divide-y divide-line">
                  {stops.map(({ stop: s, order: o }, i) => (
                    <li key={s.code} className="py-3">
                      <div className="flex items-start gap-3">
                        <span className="w-8 shrink-0 text-xl font-bold tabular-nums">{i + 1}</span>
                        <button type="button" onClick={() => openOrder(o!.id)} className="min-w-0 flex-1 text-left">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">
                              #{s.seq} {s.name}
                            </span>
                            <StatusPill status={o!.status} />
                          </span>
                          <span className="block text-sm text-secondary">
                            {s.zone} — {s.address}
                          </span>
                        </button>
                        <span className={`shrink-0 text-right font-semibold tabular-nums ${s.collect > 0 ? "" : "text-live"}`}>
                          {s.collect > 0 ? formatPrice(s.collect) : copy.admin.orders.paid}
                        </span>
                      </div>
                      <NoteLine note={s.note ?? null} />
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <a href={telHref(s.phone)} className={`${btn} flex items-center justify-center bg-elevated`}>
                          📞<span className="sr-only">{formatPhone(s.phone)}</span>
                        </a>
                        <button type="button" disabled={pending || !can(o!, "completed")} onClick={() => act([o!.id], "completed")} className={`${btn} bg-live text-black`}>
                          {t.delivered}
                        </button>
                        <button type="button" disabled={pending || !can(o!, "no_show")} onClick={() => act([o!.id], "no_show")} className={`${btn} border border-danger/60 text-danger`}>
                          {t.noShow}
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              </article>
            );
          })}

          {b.pickups.map((p) => (
            <article key={p.pointName} aria-label={`${t.counter} · ${p.pointName}`} className="rounded-tile bg-surface p-5">
              <h3 className="text-lg font-semibold">
                ☕ {t.counter} · {p.pointName}
              </h3>
              <button type="button" onClick={() => copyText(pickupText({ readyLabel: b.readyLabel, pointName: p.pointName, orders: p.orders }))} className={`${btn} mt-3 w-full bg-elevated`}>
                📋 {copy.admin.copy}
              </button>
              <ul className="mt-3 divide-y divide-line">
                {p.orders.map((x) => {
                  const o = byCode.get(x.code);
                  if (!o) return null;
                  return (
                    <li key={x.code} className="flex items-center gap-3 py-3">
                      <span className="w-12 shrink-0 text-xl font-bold tabular-nums">#{x.seq}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{x.name}</span>
                        <span className="block text-sm text-secondary tabular-nums">{x.collect > 0 ? copy.admin.orders.collect(formatPrice(x.collect)) : copy.admin.orders.paid}</span>
                      </span>
                      {can(o, "completed") ? (
                        <button type="button" disabled={pending} onClick={() => act([o.id], "completed")} className={`${btn} bg-live text-black`}>
                          {t.handed}
                        </button>
                      ) : (
                        <StatusPill status={o.status} />
                      )}
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
