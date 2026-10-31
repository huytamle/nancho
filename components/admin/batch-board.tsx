"use client";

import { useState } from "react";
import { advanceBatch, advanceOrders } from "@/app/actions/admin";
import { BoxCard, HoldBadge } from "@/components/admin/box-card";
import { ItemsList, NoteLine, StatusPill } from "@/components/admin/order-bits";
import { telHref, useAdminAction, useKitchen } from "@/components/admin/use-admin";
import { copy } from "@/data/copy";
import { formatPhone } from "@/lib/domain/phone";
import { formatRemaining } from "@/lib/domain/time";
import { batchMains } from "@/lib/kitchen-text";

const t = copy.admin.batch;

// Tab "Mẻ nướng" (§10.3): thẻ từng mẻ theo giờ, đếm ngược tới giờ đút lò, nút hàng loạt [Đút lò] / [Ra lò].
export function BatchBoard() {
  const { day, openOrder } = useKitchen();
  const { pending, run } = useAdminAction();
  const nowMs = Date.parse(day.serverNow);
  // Thẻ nắp hộp (§18.3): mặc định hiện cho mẻ đang trong lò / đã ra lò (đang đóng gói); mẻ khác bấm để xem.
  const [boxes, setBoxes] = useState<Record<number, boolean>>({});

  const batches = day.batches.filter((b) => b.segment === "pizza"); // khung cà phê không vào lò
  if (batches.length === 0) return <p className="py-10 text-center text-secondary">{copy.admin.noDay}</p>;

  return (
    <div className="space-y-5">
      {batches.map((b) => {
        const orders = day.orders.filter((o) => o.batchId === b.id && o.status !== "cancelled");
        const prep = day.prep.batches.find((p) => p.batchId === b.id);
        const confirmed = orders.filter((o) => o.status === "confirmed").length;
        const baking = orders.filter((o) => o.status === "baking").length;
        const ovenMs = Date.parse(b.ovenAt) - nowMs;
        const showBoxes = boxes[b.id] ?? (b.status === "baking" || b.status === "done");
        return (
          <section key={b.id} id={`me-${b.id}`} aria-labelledby={`me-h-${b.id}`} className="scroll-mt-28 rounded-tile bg-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`me-h-${b.id}`} className="text-2xl font-bold tabular-nums">
                {t.ready(b.readyLabel)}
              </h2>
              <span className="text-sm font-semibold text-secondary">{t.statuses[b.status]}</span>
            </div>
            <p className={`mt-1 text-[17px] font-semibold tabular-nums ${ovenMs > 0 && ovenMs < 15 * 60_000 ? "text-warn" : ""}`}>
              {ovenMs > 0 ? t.ovenIn(formatRemaining(ovenMs).replace("còn", "sau")) : t.ovenAt(b.ovenLabel)}
            </p>
            <p className="mt-1 text-sm text-secondary tabular-nums">
              {prep ? batchMains(prep) : null} · {t.load(b.usedPan, b.capPan, b.usedBbq, b.capBbq)}
            </p>

            {orders.length > 0 ? (
              <button
                type="button"
                aria-pressed={showBoxes}
                onClick={() => setBoxes((m) => ({ ...m, [b.id]: !showBoxes }))}
                className="mt-3 min-h-11 rounded-full bg-elevated px-4 text-sm font-semibold"
              >
                ✍️ {showBoxes ? copy.admin.box.hide : copy.admin.box.show}
              </button>
            ) : null}
            {showBoxes && orders.length > 0 ? <p className="mt-2 text-xs text-secondary">{copy.admin.box.legend}</p> : null}

            {orders.length === 0 ? (
              <p className="mt-4 text-secondary">{t.empty}</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {orders.map((o) => (
                  <li key={o.id} className={`rounded-2xl bg-elevated p-3 ${o.status === "placed" ? "ring-2 ring-accent" : ""}`}>
                    <button type="button" onClick={() => openOrder(o.id)} className="flex w-full items-start gap-3 text-left">
                      <span className="w-14 shrink-0 text-3xl font-bold tabular-nums">#{o.seq}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{o.customerName}</span>
                          <StatusPill status={o.status} />
                          {o.holdUntil ? <HoldBadge until={o.holdUntil} /> : null}
                        </span>
                        <span className="mt-1 block">
                          <ItemsList items={o.items} />
                        </span>
                      </span>
                    </button>
                    <NoteLine note={o.note} />
                    {showBoxes ? (
                      <div className="mt-2">
                        <BoxCard order={o} readyLabel={b.readyLabel} />
                      </div>
                    ) : null}
                    {o.status === "placed" ? (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <a href={telHref(o.customerPhone)} className="flex min-h-14 items-center justify-center rounded-full bg-accent font-semibold text-on-accent">
                          📞 {t.confirmCall}
                          <span className="sr-only"> {formatPhone(o.customerPhone)}</span>
                        </a>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => advanceOrders({ orderIds: [o.id], to: "confirmed" }), copy.admin.saved)}
                          className="min-h-14 rounded-full bg-invert font-semibold text-on-invert disabled:opacity-50"
                        >
                          {t.confirm}
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {confirmed > 0 || baking > 0 ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={pending || confirmed === 0}
                  onClick={() =>
                    run(
                      () => advanceBatch({ batchId: b.id, to: "baking" }),
                      (r) => [t.advanced(r.updated), r.unconfirmed ? t.unconfirmed(r.unconfirmed) : ""].filter(Boolean).join(" · "),
                    )
                  }
                  className="min-h-14 rounded-full bg-warn text-[17px] font-semibold text-black disabled:opacity-40"
                >
                  🔥 {t.toOven} {confirmed > 0 ? `(${confirmed})` : ""}
                </button>
                <button
                  type="button"
                  disabled={pending || baking === 0}
                  onClick={() => run(() => advanceBatch({ batchId: b.id, to: "ready" }), (r) => t.advanced(r.updated))}
                  className="min-h-14 rounded-full bg-live text-[17px] font-semibold text-black disabled:opacity-40"
                >
                  ✅ {t.outOfOven} {baking > 0 ? `(${baking})` : ""}
                </button>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
