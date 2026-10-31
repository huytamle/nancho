"use client";

import { useState } from "react";
import { advanceOrders, getOrderEvents, markPaid, moveOrder, updateNote } from "@/app/actions/admin";
import { BoxCard, HoldBadge } from "@/components/admin/box-card";
import { ItemsList, StatusPill } from "@/components/admin/order-bits";
import { copyText, mapsHref, telHref, useAdminAction, useKitchen, zaloHref } from "@/components/admin/use-admin";
import { Sheet } from "@/components/ui/sheet";
import { copy } from "@/data/copy";
import { canTransitionAs } from "@/lib/domain/roles";
import { formatPhone } from "@/lib/domain/phone";
import { vnTimeLabel } from "@/lib/domain/time";
import type { OrderStatus } from "@/lib/domain/types";
import { formatPrice } from "@/lib/format";
import type { KitchenOrder, OrderEventView } from "@/lib/server/dal/kitchen";

const t = copy.admin.detail;
const FORWARD: Exclude<OrderStatus, "placed" | "cancelled">[] = ["confirmed", "baking", "ready", "delivering", "completed", "no_show"];

export function OrderDetailSheet({ order, open, onClose }: { order: KitchenOrder | null; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open && order !== null} onClose={onClose} title={order ? t.title(order.seq) : ""} closeLabel={t.close} snap="tall">
      {order ? <Detail key={order.id} order={order} onDone={onClose} /> : null}
    </Sheet>
  );
}

function actionLabel(o: KitchenOrder, to: (typeof FORWARD)[number]) {
  if (o.fulfillment === "pickup" && to === "completed") return t.pickupDone;
  if (o.fulfillment === "pickup" && to === "no_show") return t.pickupNoShow;
  if (to === "completed") return t.delivered;
  return t.actions[to];
}

function Detail({ order: o, onDone }: { order: KitchenOrder; onDone: () => void }) {
  const { day, role, orderRoles } = useKitchen();
  const { pending, run } = useAdminAction();
  const [note, setNote] = useState(o.note ?? "");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [events, setEvents] = useState<OrderEventView[] | null>(null);
  const batch = day.batches.find((b) => b.id === o.batchId);
  const ctx = {
    fulfillment: o.fulfillment,
    now: new Date(day.serverNow),
    cutoffAt: new Date(batch?.cutoffAt ?? 0),
    reason: "x",
  };
  const next = FORWARD.filter((to) => canTransitionAs(orderRoles, o.status, to, ctx).ok);
  const canCancel = canTransitionAs(orderRoles, o.status, "cancelled", ctx).ok;
  const kitchen = role === "owner" || role === "kitchen";
  const movable = kitchen && (o.status === "placed" || o.status === "confirmed");
  const targets = day.batches.filter(
    (b) =>
      b.id !== o.batchId &&
      b.segment === batch?.segment &&
      (b.status === "open" || b.status === "closed") &&
      b.capPan - b.usedPan >= o.panUnits &&
      b.capBbq - b.usedBbq >= o.bbqUnits,
  );
  const box = "rounded-2xl bg-elevated p-4";
  const btn = "min-h-14 rounded-full px-4 text-[15px] font-semibold disabled:opacity-50";

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-secondary">
        <StatusPill status={o.status} />
        <span className="tabular-nums">{o.code}</span>
        <span>· {copy.admin.orders.batchOption(batch?.readyLabel ?? "")}</span>
        <span>· {copy.admin.channel[o.channel]}</span>
        {o.holdUntil ? <HoldBadge until={o.holdUntil} /> : null}
      </div>

      {next.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {next.map((to) => (
            <button
              key={to}
              type="button"
              disabled={pending}
              onClick={() => run(() => advanceOrders({ orderIds: [o.id], to }), copy.admin.saved)}
              className={`${btn} ${to === "no_show" ? "border border-danger/60 text-danger" : "bg-invert text-on-invert"} ${next.length === 1 ? "col-span-2" : ""}`}
            >
              {actionLabel(o, to)}
            </button>
          ))}
        </div>
      ) : null}

      <section className={box} aria-label={o.customerName}>
        <p className="text-lg font-semibold">{o.customerName}</p>
        <p className="text-secondary tabular-nums">{formatPhone(o.customerPhone)}</p>
        {o.fulfillment === "delivery" ? (
          <p className="mt-2">
            <span className="font-medium">{o.zoneName}</span>
            {o.addressText ? <span className="block text-secondary">{o.addressText}</span> : null}
          </p>
        ) : (
          <p className="mt-2 font-medium">{copy.admin.orders.pickup(o.pickupName ?? "")}</p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={telHref(o.customerPhone)} className={`${btn} flex items-center justify-center bg-surface`}>
            📞 {t.call}
          </a>
          <a href={zaloHref(o.customerPhone)} target="_blank" rel="noreferrer" className={`${btn} flex items-center justify-center bg-surface`}>
            💬 {t.zalo}
          </a>
          {o.addressText ? (
            <button type="button" onClick={() => copyText(`${o.zoneName ?? ""} — ${o.addressText}`)} className={`${btn} bg-surface`}>
              {t.copyAddress}
            </button>
          ) : null}
          {o.lat !== null && o.lng !== null ? (
            <a href={mapsHref(o.lat, o.lng)} target="_blank" rel="noreferrer" className={`${btn} flex items-center justify-center bg-surface`}>
              📍 {t.maps}
            </a>
          ) : null}
        </div>
      </section>

      {o.status !== "cancelled" ? <BoxCard order={o} readyLabel={batch?.readyLabel ?? ""} /> : null}

      <section className={box} aria-labelledby="d-items">
        <h3 id="d-items" className="mb-2 text-sm font-semibold text-secondary">
          {t.items}
        </h3>
        <ItemsList items={o.items} large />
        <p className="mt-3 flex justify-between border-t border-line pt-3 font-semibold tabular-nums">
          <span>{t.total}</span>
          <span>{formatPrice(o.total)}</span>
        </p>
        <p className="mt-1 text-sm text-secondary">
          {t.payment}: {o.paymentMethod === "cod" ? t.cod : t.transfer} ·{" "}
          {o.paymentStatus === "paid"
            ? copy.admin.orders.paid
            : o.paymentStatus === "refunded"
              ? copy.admin.lock.refunded
              : copy.admin.orders.collect(formatPrice(o.collect))}
        </p>
        {role === "owner" && o.paymentStatus === "unpaid" && o.status !== "cancelled" ? (
          <div className="mt-3">
            <p className="mb-2 text-sm font-semibold">{t.markPaid}</p>
            <div className="grid grid-cols-2 gap-2">
              {(["cod", "transfer"] as const).map((m) => (
                <button key={m} type="button" disabled={pending} onClick={() => run(() => markPaid({ orderId: o.id, method: m }), copy.admin.saved)} className={`${btn} bg-surface`}>
                  {m === "cod" ? t.cod : t.transfer}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {movable && targets.length > 0 ? (
        <section className={box} aria-labelledby="d-move">
          <h3 id="d-move" className="mb-2 text-sm font-semibold text-secondary">
            {t.move}
          </h3>
          <div className="flex flex-wrap gap-2">
            {targets.map((b) => (
              <button
                key={b.id}
                type="button"
                disabled={pending}
                onClick={() => run(() => moveOrder({ orderId: o.id, batchId: b.id }), copy.admin.saved)}
                className="min-h-11 rounded-full border border-line px-4 font-semibold tabular-nums"
              >
                {t.moveTo(b.readyLabel, b.capPan - b.usedPan)}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {kitchen ? (
        <section className={box}>
          <label htmlFor="d-note" className="mb-2 block text-sm font-semibold text-secondary">
            {t.note}
          </label>
          <textarea id="d-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={t.notePlaceholder} className="input min-h-20 resize-none bg-surface py-3" />
          {note !== (o.note ?? "") ? (
            <button type="button" disabled={pending} onClick={() => run(() => updateNote({ orderId: o.id, note }), copy.admin.saved)} className={`${btn} mt-2 w-full bg-invert text-on-invert`}>
              {t.saveNote}
            </button>
          ) : null}
        </section>
      ) : o.note ? (
        <p className={box}>📝 {o.note}</p>
      ) : null}

      {canCancel ? (
        cancelling ? (
          <section className={`${box} border border-danger/40`}>
            <label htmlFor="d-reason" className="mb-2 block text-sm font-semibold">
              {t.cancelReason}
            </label>
            <input id="d-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} className="input bg-surface" />
            <button
              type="button"
              disabled={pending || !reason.trim()}
              onClick={() => run(() => advanceOrders({ orderIds: [o.id], to: "cancelled", reason }), copy.admin.saved, onDone)}
              className={`${btn} mt-2 w-full bg-danger text-black`}
            >
              {t.cancelConfirm}
            </button>
          </section>
        ) : (
          <button type="button" onClick={() => setCancelling(true)} className={`${btn} w-full border border-danger/50 text-danger`}>
            {t.cancel}
          </button>
        )
      ) : null}

      {kitchen ? (
        <section aria-labelledby="d-history">
          <h3 id="d-history" className="text-sm font-semibold text-secondary">
            {t.history}
          </h3>
          {events ? (
            <ol className="mt-2 space-y-1 text-sm">
              {events.map((e, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 text-secondary tabular-nums">{vnTimeLabel(new Date(e.at))}</span>
                  <span>
                    {t.events[e.type as keyof typeof t.events] ?? e.type}
                    {typeof e.data?.to === "string" ? ` → ${copy.admin.status[e.data.to as OrderStatus]}` : ""}
                    {typeof e.data?.reason === "string" ? ` (${e.data.reason})` : ""}
                    <span className="text-secondary"> · {e.actor === "customer" ? "khách" : e.actor === "system" ? "tự động" : e.actor}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => getOrderEvents({ orderId: o.id }), undefined, (r) => setEvents(r.events))}
              className="mt-1 min-h-11 text-sm text-secondary underline"
            >
              {t.showHistory}
            </button>
          )}
        </section>
      ) : null}
    </div>
  );
}
