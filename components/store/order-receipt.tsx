import { FeedbackForm } from "@/components/store/feedback-form";
import { HoldCountdown } from "@/components/store/hold-countdown";
import { CancelOrder, LiveRefresh, Reorder } from "@/components/store/order-receipt-actions";
import { TransferBox } from "@/components/store/transfer-box";
import { copy } from "@/data/copy";
import { site } from "@/data/site";
import type { CustomerStage } from "@/lib/domain/order-status";
import { formatPrice } from "@/lib/format";
import type { OrderView } from "@/lib/server/dal/orders";

const t = copy.receipt;

const FLOW: Record<"delivery" | "pickup", CustomerStage[]> = {
  delivery: ["received", "baking", "ready", "delivering", "completed"],
  pickup: ["received", "baking", "waiting_pickup", "completed"],
};
const FINAL: CustomerStage[] = ["completed", "cancelled", "no_show"];

/** Biên nhận `/o/[token]`: dòng thời gian (§7.5), chi tiết, thanh toán, huỷ trước giờ chốt, đặt lại. */
export function OrderReceipt({ token, view: v }: { token: string; view: OrderView }) {
  const flow = FLOW[v.fulfillment];
  const at = flow.indexOf(v.stage);
  const ended = v.stage === "cancelled" || v.stage === "no_show";
  const unpaidTransfer = v.payment.method === "transfer" && v.payment.status === "unpaid" && !ended;

  return (
    <article className="space-y-6">
      <LiveRefresh active={!FINAL.includes(v.stage)} />
      <header>
        <p className="text-sm text-secondary tabular-nums">{v.code}</p>
        <h1 className="mt-1 text-[28px] leading-tight font-semibold tracking-tight">{t.title(v.seq)}</h1>
        <p className="mt-1.5 text-[15px] text-secondary">
          {t.batch(v.readyLabel, v.dayLabel)} · {t.oven(v.ovenLabel)}
        </p>
      </header>

      {ended ? (
        <div role="status" className="rounded-field border border-danger/50 px-4 py-3 font-medium">
          <p>
            {v.pausedReason !== null ? t.paused(v.pausedReason) : v.holdExpired ? t.holdExpired : v.stage === "cancelled" ? t.cancelled : t.stages.no_show}
          </p>
          {v.holdExpired ? (
            <div className="mt-3 flex flex-col">
              <Reorder lines={v.reorder} label={t.holdExpiredCta} />
            </div>
          ) : null}
        </div>
      ) : (
        <section aria-label={t.progress}>
          <ol className="flex gap-1.5">
            {flow.map((stage, i) => (
              <li key={stage} aria-current={i === at ? "step" : undefined} className="min-w-0 flex-1">
                <span className={`block h-1.5 rounded-full ${i <= at ? "bg-accent" : "bg-elevated"}`} aria-hidden />
                <span className={`mt-2 block text-xs leading-snug ${i === at ? "font-semibold text-text" : "text-secondary"}`}>
                  {t.stages[stage]}
                </span>
              </li>
            ))}
          </ol>
          {v.status === "placed" ? <p className="mt-3 text-sm text-secondary">{t.unconfirmed}</p> : null}
        </section>
      )}

      <section className="rounded-tile bg-surface p-4 text-[15px]">
        {v.fulfillment === "delivery" ? (
          <>
            <p className="font-medium">🛵 {t.deliverTo(v.zoneName ?? "", v.etaLabel)}</p>
            {v.addressText ? <p className="mt-1 text-sm text-secondary">{v.addressText}</p> : null}
          </>
        ) : (
          <>
            <p className="font-medium">☕ {t.pickupAt(v.pickup?.name ?? site.kitchen.name, v.etaLabel)}</p>
            <p className="mt-1 text-sm text-secondary">
              {v.pickup?.address ?? site.kitchen.address}
              {v.pickup?.mapsUrl ? (
                <>
                  {" · "}
                  <a href={v.pickup.mapsUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                    {t.maps}
                  </a>
                </>
              ) : null}
            </p>
          </>
        )}
        <p className="mt-2 text-sm text-secondary">{v.customerName}</p>
      </section>

      <section>
        <h2 className="mb-2 text-[11px] font-medium tracking-[0.22em] text-secondary uppercase">{t.items}</h2>
        <ul className="divide-y divide-line">
          {v.items.map((i) => (
            <li key={i.id} className={`flex justify-between gap-3 py-2.5 ${i.parentId ? "pl-4 text-sm text-secondary" : ""}`}>
              <span>
                {i.parentId ? "+ " : `${i.qty}× `}
                {i.isGift ? `🎁 ${i.name}` : i.name}
              </span>
              <span className="shrink-0 tabular-nums">{i.isGift ? copy.checkout.gift : formatPrice(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-2 space-y-1 border-t border-line pt-3 text-sm tabular-nums">
          <Row label={t.subtotal} value={formatPrice(v.subtotal)} />
          <Row label={t.ship} value={formatPrice(v.shipFee)} />
          {v.discount > 0 ? <Row label={t.discount} value={`−${formatPrice(v.discount)}`} /> : null}
          <div className="flex justify-between pt-1 text-[17px] font-semibold text-text">
            <dt>{t.total}</dt>
            <dd>{formatPrice(v.total)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-sm text-secondary">
          {v.payment.status === "paid" ? `✓ ${t.paid}` : v.payment.status === "refunded" ? t.refunded : v.payment.method === "cod" ? t.cod : t.transferPending}
        </p>
      </section>

      {v.holdUntil && unpaidTransfer ? <HoldCountdown until={v.holdUntil} /> : null}
      {unpaidTransfer ? <TransferBox info={v.payment.transfer} /> : null}

      {v.feedback ? <FeedbackForm token={token} feedback={v.feedback} /> : null}

      <div className="flex flex-col gap-2">
        {v.stage === "completed" ? <Reorder lines={v.reorder} /> : null}
        {v.stage === "completed" && site.reviewUrl ? (
          <a href={site.reviewUrl} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center justify-center rounded-full bg-elevated font-medium">
            ⭐ {t.review}
          </a>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <a href={site.contact.phoneHref} className="inline-flex h-12 items-center justify-center rounded-full bg-elevated font-medium">
            {t.call}
          </a>
          <a href={site.contact.zaloHref} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center justify-center rounded-full bg-elevated font-medium">
            {t.zalo}
          </a>
        </div>
        {v.canCancel ? <CancelOrder token={token} cutoffLabel={v.cutoffLabel} /> : null}
      </div>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-secondary">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function ReceiptSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="h-4 w-24 animate-pulse rounded-full bg-elevated" />
      <div className="h-8 w-40 animate-pulse rounded-full bg-elevated" />
      <div className="h-24 animate-pulse rounded-tile bg-surface" />
      <div className="h-40 animate-pulse rounded-tile bg-surface" />
    </div>
  );
}
