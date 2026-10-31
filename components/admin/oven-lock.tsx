"use client";

import { useState } from "react";
import { cancelWithRefund, pauseOven, resumeOven } from "@/app/actions/sale-day";
import { telHref, useAdminAction } from "@/components/admin/use-admin";
import { MoneyInput } from "@/components/ops/money-input";
import { copy } from "@/data/copy";
import { PAUSE_PRESETS } from "@/lib/domain/oven-lock";
import { formatPhone } from "@/lib/domain/phone";
import { formatPrice } from "@/lib/format";
import type { AffectedView, OvenLockView } from "@/lib/server/dal/sale-day";

const t = copy.admin.lock;
const btn = "min-h-12 rounded-full px-4 text-[15px] font-semibold disabled:opacity-50";

/**
 * Khoá lò khẩn cấp (§18.1) — đầu màn Bếp và tab Ca & két. Một chạm "Khoá lò" → chọn lý do → xác nhận.
 * Khi đang khoá: danh sách đơn bị ảnh hưởng (gọi · huỷ · ghi hoàn tiền). Đơn đã huỷ mà khách đã trả → "Cần hoàn tiền".
 */
export function OvenLock({ lock, className = "" }: { lock: OvenLockView; className?: string }) {
  const paused = lock.status === "paused";
  if (lock.status === null && lock.refunds.length === 0) return null;
  return (
    <div className={`space-y-3 ${className}`}>
      {paused ? <Locked lock={lock} /> : lock.status !== null ? <LockForm key={lock.status} lock={lock} /> : null}
      {lock.refunds.length > 0 ? (
        <section aria-labelledby="can-hoan" className="rounded-tile border-2 border-warn/60 bg-surface p-4">
          <h2 id="can-hoan" className="font-semibold text-warn">
            💸 {t.refunds(lock.refunds.length)}
          </h2>
          <p className="text-xs text-secondary">{t.appNote}</p>
          <ul className="mt-2 divide-y divide-line">
            {lock.refunds.map((o) => (
              <AffectedRow key={o.id} o={o} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function LockForm({ lock }: { lock: OvenLockView }) {
  const { pending, run } = useAdminAction();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<string>(PAUSE_PRESETS[0]);
  const [other, setOther] = useState("");
  const [tomorrow, setTomorrow] = useState(false);
  const reason = choice === "other" ? other.trim() : choice;

  if (!open) {
    return (
      <div className="flex items-center gap-3 rounded-tile bg-surface p-3 pl-4">
        <p className="min-w-0 flex-1 text-sm text-secondary">{t.hint}</p>
        <button type="button" onClick={() => setOpen(true)} className={`${btn} shrink-0 border-2 border-danger text-danger`}>
          ⛔ {t.lockButton}
        </button>
      </div>
    );
  }
  return (
    <section aria-labelledby="khoa-lo" className="rounded-tile border-2 border-danger bg-surface p-4">
      <h2 id="khoa-lo" className="text-lg font-semibold">
        ⛔ {t.title}
      </h2>
      <fieldset className="mt-3">
        <legend className="mb-2 text-sm text-secondary">{t.reasonLabel}</legend>
        <div className="flex flex-wrap gap-2">
          {[...PAUSE_PRESETS, "other"].map((r) => (
            <label key={r} className={`chip inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-sm font-semibold ${choice === r ? "bg-invert text-on-invert" : "bg-elevated text-secondary"}`}>
              <input type="radio" name="pause-reason" value={r} checked={choice === r} onChange={() => setChoice(r)} className="sr-only" />
              {r === "other" ? t.other : r}
            </label>
          ))}
        </div>
      </fieldset>
      {choice === "other" ? (
        <>
          <label htmlFor="pause-other" className="sr-only">
            {t.otherPlaceholder}
          </label>
          <input id="pause-other" value={other} maxLength={80} onChange={(e) => setOther(e.target.value)} placeholder={t.otherPlaceholder} className="input mt-3" />
        </>
      ) : null}
      {lock.tomorrowOpen ? (
        <label className="mt-3 flex min-h-11 items-center gap-3 text-[15px]">
          <input type="checkbox" checked={tomorrow} onChange={(e) => setTomorrow(e.target.checked)} className="size-5 accent-[var(--accent)]" />
          {t.tomorrow}
        </label>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setOpen(false)} disabled={pending} className={`${btn} bg-elevated`}>
          {t.back}
        </button>
        <button
          type="button"
          disabled={pending || (choice === "other" && !reason)}
          onClick={() => run(() => pauseOven({ reason, tomorrow }), (r) => t.lockedToast(r.affected))}
          className={`${btn} bg-danger text-black`}
        >
          {t.confirm}
        </button>
      </div>
    </section>
  );
}

function Locked({ lock }: { lock: OvenLockView }) {
  const { pending, run } = useAdminAction();
  return (
    <section aria-labelledby="lo-khoa" className="rounded-tile border-2 border-danger bg-danger/10 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="lo-khoa" role="status" className="min-w-0 flex-1 text-lg font-semibold">
          {t.locked(lock.reason)}
        </h2>
        <button type="button" disabled={pending} onClick={() => run(() => resumeOven(), t.unlocked)} className={`${btn} shrink-0 bg-live text-black`}>
          {t.unlock}
        </button>
      </div>
      {lock.tomorrowPaused ? <p className="mt-1 text-sm text-secondary">{t.lockedTomorrow}</p> : null}
      <h3 className="mt-4 text-sm font-semibold text-secondary">{t.affected(lock.affected.length)}</h3>
      {lock.affected.length === 0 ? (
        <p className="mt-1 text-[15px]">{t.noAffected}</p>
      ) : (
        <ul className="mt-1 divide-y divide-line">
          {lock.affected.map((o) => (
            <AffectedRow key={o.id} o={o} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Một đơn: gọi khách · huỷ (đơn đã trả → kèm ghi hoàn tiền). Đơn đã huỷ → chỉ ghi hoàn. */
function AffectedRow({ o }: { o: AffectedView }) {
  const { pending, run } = useAdminAction();
  const [refunding, setRefunding] = useState(false);
  const [text, setText] = useState(new Intl.NumberFormat("vi-VN").format(o.paid));
  const [amount, setAmount] = useState<number | null>(o.paid);
  const [method, setMethod] = useState<"transfer" | "cash">("transfer");
  const [note, setNote] = useState("");
  const cancelled = o.status === "cancelled";
  const paid = o.paymentStatus === "paid";
  const id = `refund-${o.id}`;

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <span className="w-12 shrink-0 text-2xl font-bold tabular-nums">#{o.seq}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {o.name} <span className="text-sm font-normal text-secondary tabular-nums">{formatPhone(o.phone)}</span>
          </p>
          <p className="text-sm text-secondary">
            {copy.admin.orders.batchOption(o.readyLabel)}
            {o.dayLabel ? ` · ${o.dayLabel}` : ""} ·{" "}
            <span className={paid ? "font-semibold text-warn" : ""}>{paid ? t.paid(formatPrice(o.paid)) : t.cod}</span>
          </p>
        </div>
        <a href={telHref(o.phone)} className={`${btn} flex shrink-0 items-center bg-elevated`}>
          📞<span className="sr-only">{formatPhone(o.phone)}</span>
        </a>
      </div>

      {refunding ? (
        <div className="mt-3 space-y-3 rounded-2xl bg-elevated p-3">
          <MoneyInput id={id} label={t.refundAmount} text={text} onText={(v, n) => (setText(v), setAmount(n))} />
          <fieldset>
            <legend className="mb-1 text-sm text-secondary">{t.refundMethod}</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["transfer", "cash"] as const).map((m) => (
                <label key={m} className={`chip flex min-h-11 cursor-pointer items-center justify-center rounded-full text-sm font-semibold ${method === m ? "bg-invert text-on-invert" : "bg-surface text-secondary"}`}>
                  <input type="radio" name={`${id}-m`} value={m} checked={method === m} onChange={() => setMethod(m)} className="sr-only" />
                  {m === "transfer" ? t.refundTransfer : t.refundCash}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor={`${id}-note`} className="mb-1 block text-sm text-secondary">
              {t.refundNote}
            </label>
            <input id={`${id}-note`} value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={pending} onClick={() => setRefunding(false)} className={`${btn} bg-surface`}>
              {t.back}
            </button>
            <button
              type="button"
              disabled={pending || amount === null || amount <= 0}
              onClick={() => run(() => cancelWithRefund({ orderId: o.id, refund: { amount: amount!, method, note: note || undefined } }), t.refunded)}
              className={`${btn} bg-invert text-on-invert`}
            >
              {cancelled ? t.refundOnly : t.refundSave}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => (paid ? setRefunding(true) : run(() => cancelWithRefund({ orderId: o.id, refund: null }), t.cancelled))}
          className={`${btn} mt-2 w-full border border-danger/60 text-danger`}
        >
          {cancelled ? t.refund : t.cancel}
        </button>
      )}
    </li>
  );
}
