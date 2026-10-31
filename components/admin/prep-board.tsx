"use client";

import { useSyncExternalStore } from "react";
import { sendPrepTelegram } from "@/app/actions/admin";
import { copyText, useAdminAction, useKitchen } from "@/components/admin/use-admin";
import { copy } from "@/data/copy";
import { formatRemaining, vnTimeLabel } from "@/lib/domain/time";
import { opsCopy } from "@/data/copy-ops";
import { batchMains, ingredientDetail, ingredientQty, prepSummaryText, warningText } from "@/lib/kitchen-text";
import { qtyText } from "@/lib/stock-text";

const t = copy.admin.prep;

// Tick "đã lấy" là tiện ích cá nhân theo ngày (§10.2) → localStorage, không cần DB.
const pullKey = (date: string) => `th_pull_${date}`;
const pullSubs = new Set<() => void>();
const subscribePull = (l: () => void) => {
  pullSubs.add(l);
  window.addEventListener("storage", l);
  return () => {
    pullSubs.delete(l);
    window.removeEventListener("storage", l);
  };
};
function readPull(date: string): string {
  try {
    return localStorage.getItem(pullKey(date)) ?? "";
  } catch {
    return "";
  }
}
function togglePull(date: string, id: string) {
  const set = new Set(readPull(date).split(",").filter(Boolean));
  if (set.has(id)) set.delete(id);
  else set.add(id);
  try {
    localStorage.setItem(pullKey(date), [...set].join(","));
  } catch {}
  pullSubs.forEach((l) => l());
}

export function PrepBoard() {
  const { day, goTo } = useKitchen();
  const { prep } = day;
  const pulledRaw = useSyncExternalStore(subscribePull, () => readPull(day.date), () => "");
  const pulled = new Set(pulledRaw.split(",").filter(Boolean));
  const { pending, run } = useAdminAction();

  const lastCutoff = day.batches.reduce((m, b) => (b.cutoffAt > m ? b.cutoffAt : m), "");
  const cutoffLabel = lastCutoff ? vnTimeLabel(new Date(lastCutoff)) : null;

  if (day.batches.length === 0) return <p className="py-10 text-center text-secondary">{copy.admin.noDay}</p>;

  return (
    <div className="space-y-5">
      <section aria-labelledby="prep-title" className="rounded-tile bg-surface p-5">
        <p className={`text-sm font-semibold ${prep.isFinal ? "text-live" : "text-warn"}`}>
          {prep.isFinal && cutoffLabel
            ? t.final(cutoffLabel, prep.orderCount)
            : t.draft(formatRemaining(Date.parse(lastCutoff) - Date.parse(day.serverNow)), prep.orderCount)}
        </p>
        <h2 id="prep-title" className="mt-3 text-sm font-semibold tracking-[0.12em] text-secondary uppercase">
          {t.title} {day.dayLabel.toLocaleLowerCase("vi")}
        </h2>
        <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums" data-testid="prep-mains">
          {t.mains(prep.totals.mains.pizza, prep.totals.mains.bbq)}
        </p>
      </section>

      {prep.orderCount === 0 ? (
        <p className="py-6 text-center text-secondary">{t.empty}</p>
      ) : (
        <>
          <section aria-labelledby="pull-title" className="rounded-tile bg-surface p-5">
            <h2 id="pull-title" className="text-sm font-semibold tracking-[0.12em] text-secondary uppercase">
              {t.pull} <span className="font-normal tracking-normal normal-case">({t.pullHint})</span>
            </h2>
            <ul className="mt-3 divide-y divide-line">
              {prep.totals.ingredients.map((i) => {
                const done = pulled.has(i.ingredientId);
                const detail = ingredientDetail(i);
                const st = day.stock[i.ingredientId];
                const short = st ? Math.max(0, Math.round((st.need - st.onHand) * 1000) / 1000) : 0;
                return (
                  <li key={i.ingredientId}>
                    <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => togglePull(day.date, i.ingredientId)}
                        className="size-6 shrink-0 accent-[var(--live)]"
                      />
                      <span className={`min-w-0 flex-1 ${done ? "text-secondary line-through" : ""}`}>
                        <span className="block text-[17px] font-medium">{i.label}</span>
                        {detail ? <span className="block text-sm text-secondary">{detail}</span> : null}
                        {st ? (
                          <span className={`block text-sm font-medium ${short > 0 ? "text-warn" : "text-live"}`} data-testid={`stock-${i.ingredientId}`}>
                            {opsCopy.stock.prepLine(qtyText(st.onHand, i.unit), short > 0 ? qtyText(short, i.unit) : null)}
                          </span>
                        ) : null}
                      </span>
                      <span className={`shrink-0 text-right text-lg font-semibold tabular-nums ${done ? "text-secondary" : ""}`} data-testid={`ing-${i.ingredientId}`}>
                        {ingredientQty(i)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="batches-title" className="rounded-tile bg-surface p-5">
            <h2 id="batches-title" className="text-sm font-semibold tracking-[0.12em] text-secondary uppercase">
              {t.byBatch}
            </h2>
            <ul className="mt-3 space-y-2">
              {prep.batches.map((b) => (
                <li key={b.batchId}>
                  <button
                    type="button"
                    onClick={() => goTo("me", { batchId: b.batchId })}
                    className="w-full rounded-2xl bg-elevated px-4 py-3 text-left active:scale-[0.99]"
                  >
                    <span className="block text-[17px] font-semibold tabular-nums">▸ {t.batchLine(b.ovenLabel, b.readyLabel, batchMains(b))}</span>
                    {b.routes.map((r) => (
                      <span key={r.routeId} className="mt-1 block text-sm text-secondary">
                        🛵 {r.routeName}: {r.stops.map((s) => s.name).join(" · ")}
                      </span>
                    ))}
                    {b.pickups.map((p) => (
                      <span key={p.pointName} className="mt-1 block text-sm text-secondary">
                        ☕ {p.pointName}: {p.orders.map((o) => o.name).join(" · ")}
                      </span>
                    ))}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {prep.warnings.length > 0 ? (
            <section aria-labelledby="warn-title" className="rounded-tile border border-warn/40 bg-surface p-5">
              <h2 id="warn-title" className="text-sm font-semibold tracking-[0.12em] text-warn uppercase">
                {t.warnings}
              </h2>
              <ul className="mt-2 space-y-1.5">
                {prep.warnings.map((w) => (
                  <li key={`${w.kind}-${w.orderCode}`} className="text-[15px]">
                    ⚠ {warningText(w)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <div className="grid grid-cols-3 gap-2">
        <a
          href={`/admin/kitchen/in?ngay=${day.date}`}
          className="flex min-h-14 items-center justify-center rounded-full bg-elevated text-[15px] font-semibold"
        >
          🖨 {t.print}
        </a>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => sendPrepTelegram({ date: day.date }), t.sent)}
          className="min-h-14 rounded-full bg-elevated text-[15px] font-semibold disabled:opacity-50"
        >
          📤 {t.telegram}
        </button>
        <button
          type="button"
          onClick={() => copyText(prepSummaryText(prep, { date: day.date, cutoffLabel }))}
          className="min-h-14 rounded-full bg-elevated text-[15px] font-semibold"
        >
          📋 {copy.admin.copy}
        </button>
      </div>
    </div>
  );
}
