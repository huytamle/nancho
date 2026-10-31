"use client";

import { useState } from "react";
import { setDayStatus, toggleProduct, updateBatch } from "@/app/actions/admin";
import { copyText, useAdminAction, useKitchen } from "@/components/admin/use-admin";
import { Stepper } from "@/components/ui/stepper";
import { copy } from "@/data/copy";
import { site } from "@/data/site";
import type { DayStatus } from "@/lib/domain/types";
import { promoPostText } from "@/lib/kitchen-text";
import type { KitchenBatch } from "@/lib/server/dal/kitchen";

const t = copy.admin.settings;
const box = "rounded-tile bg-surface p-5";
const h2 = "text-sm font-semibold tracking-[0.12em] text-secondary uppercase";

// Tab "Cài đặt" — chỉ owner (§10.6). Mẫu khung giờ/khu vực/nhân viên sửa ngoài app (ghi chú cuối tab).
export function SettingsPanel() {
  const { day } = useKitchen();
  const nowMs = Date.parse(day.serverNow);
  const slots = day.batches
    .filter((b) => b.status === "open" && Date.parse(b.cutoffAt) > nowMs)
    .map((b) => ({ readyLabel: b.readyLabel, remaining: Math.max(0, b.capPan - b.usedPan) }));
  const post = promoPostText({
    dayWord: day.dayLabel,
    slots,
    url: `${site.url.replace(/^https:\/\//, "")}/?src=fb-post`,
  });

  return (
    <div className="space-y-5">
      <DayStatusForm key={`${day.date}-${day.status}-${day.pauseMessage}`} />

      {day.batches.length > 0 ? (
        <section className={box} aria-labelledby="set-batches">
          <h2 id="set-batches" className={h2}>
            {t.batches}
          </h2>
          <ul className="mt-3 divide-y divide-line">
            {day.batches.map((b) => (
              <BatchRow key={`${b.id}-${b.capPan}-${b.capBbq}-${b.status}`} batch={b} />
            ))}
          </ul>
        </section>
      ) : null}

      <ProductToggles />

      <section className={box} aria-labelledby="set-post">
        <h2 id="set-post" className={h2}>
          {t.post}
        </h2>
        <p className="mt-1 text-sm text-secondary">{t.postHint}</p>
        <p className="mt-3 rounded-2xl bg-elevated p-4 text-[15px] whitespace-pre-line">{post}</p>
        <button type="button" onClick={() => copyText(post)} className="mt-3 min-h-14 w-full rounded-full bg-invert font-semibold text-on-invert">
          📋 {copy.admin.copy}
        </button>
      </section>

      <p className="text-sm text-secondary">{t.more}</p>
    </div>
  );
}

function DayStatusForm() {
  const { day } = useKitchen();
  const { pending, run } = useAdminAction();
  const [status, setStatus] = useState<DayStatus>(day.status ?? "open");
  const [message, setMessage] = useState(day.pauseMessage ?? "");
  if (day.status === null) return <p className={`${box} text-secondary`}>{copy.admin.noDay}</p>;
  const dirty = status !== day.status || (status === "paused" && message !== (day.pauseMessage ?? ""));

  return (
    <section className={box} aria-labelledby="set-day">
      <h2 id="set-day" className={h2}>
        {t.day} · {day.dayLabel}
      </h2>
      <div role="radiogroup" aria-labelledby="set-day" className="mt-3 grid grid-cols-3 gap-2">
        {(Object.keys(t.dayStatus) as DayStatus[]).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={status === s}
            onClick={() => setStatus(s)}
            className={`min-h-14 rounded-full text-[15px] font-semibold ${
              status === s ? (s === "open" ? "bg-live text-black" : s === "paused" ? "bg-warn text-black" : "bg-danger text-black") : "bg-elevated text-secondary"
            }`}
          >
            {t.dayStatus[s]}
          </button>
        ))}
      </div>
      {status === "paused" ? (
        <div className="mt-3">
          <label htmlFor="pause-msg" className="mb-1 block text-sm text-secondary">
            {t.pauseMessage}
          </label>
          <input id="pause-msg" value={message} maxLength={160} onChange={(e) => setMessage(e.target.value)} placeholder={t.pausePlaceholder} className="input" />
        </div>
      ) : null}
      {dirty ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setDayStatus({ date: day.date, status, pauseMessage: message }), copy.admin.saved)}
          className="mt-3 min-h-14 w-full rounded-full bg-invert font-semibold text-on-invert disabled:opacity-50"
        >
          {t.save}
        </button>
      ) : null}
    </section>
  );
}

function BatchRow({ batch: b }: { batch: KitchenBatch }) {
  const { pending, run } = useAdminAction();
  const [capPan, setCapPan] = useState(b.capPan);
  const [capBbq, setCapBbq] = useState(b.capBbq);
  const editable = b.status === "open" || b.status === "closed";
  const dirty = capPan !== b.capPan || capBbq !== b.capBbq;

  return (
    <li className="py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xl font-bold tabular-nums">{b.readyLabel}</p>
        {editable ? (
          <button
            type="button"
            disabled={pending}
            aria-pressed={b.status === "open"}
            onClick={() => run(() => updateBatch({ batchId: b.id, status: b.status === "open" ? "closed" : "open" }), copy.admin.saved)}
            className={`min-h-11 rounded-full px-4 text-sm font-semibold ${b.status === "open" ? "bg-live text-black" : "bg-elevated text-secondary"}`}
          >
            {b.status === "open" ? t.batchOpen : t.batchClosed}
          </button>
        ) : (
          <span className="text-sm text-secondary">{copy.admin.batch.statuses[b.status]}</span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {(
          [
            [t.pan, capPan, setCapPan, b.usedPan],
            [t.bbq, capBbq, setCapBbq, b.usedBbq],
          ] as const
        ).map(([label, value, set, used]) => (
          <div key={label}>
            <p className="text-sm">
              {label} <span className="text-secondary">({t.used(used)})</span>
            </p>
            <div className="mt-1">
              <Stepper value={value} min={used} max={50} onChange={set} label={`${label} ${b.readyLabel}`} />
            </div>
          </div>
        ))}
      </div>
      {dirty ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => updateBatch({ batchId: b.id, capPan, capBbq }), copy.admin.saved)}
          className="mt-3 min-h-14 w-full rounded-full bg-invert font-semibold text-on-invert disabled:opacity-50"
        >
          {t.save}
        </button>
      ) : null}
    </li>
  );
}

function ProductToggles() {
  const { day } = useKitchen();
  const { pending, run } = useAdminAction();
  return (
    <section className={box} aria-labelledby="set-products">
      <h2 id="set-products" className={h2}>
        {t.products}
      </h2>
      <ul className="mt-3 divide-y divide-line">
        {day.products.map((p) => (
          <li key={p.id} className="flex min-h-14 items-center justify-between gap-3 py-2">
            <span className="min-w-0">{p.name}</span>
            <button
              type="button"
              role="switch"
              aria-checked={p.isAvailable}
              aria-label={`${p.name}: ${p.isAvailable ? t.available : t.soldOut}`}
              disabled={pending}
              onClick={() => run(() => toggleProduct({ productId: p.id, isAvailable: !p.isAvailable }), copy.admin.saved)}
              className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${p.isAvailable ? "bg-elevated text-text" : "bg-danger text-black"}`}
            >
              {p.isAvailable ? t.available : t.soldOut}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
