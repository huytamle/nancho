"use client";

import Link from "next/link";
import { chip } from "@/components/ops/stock-ui";
import { box, h2 } from "@/components/ops/styles";
import { opsCopy } from "@/data/copy-ops";
import { vnDateOf, vnTimeLabel } from "@/lib/domain/time";
import { periodLabel } from "@/lib/domain/worktime";
import { formatPrice } from "@/lib/format";
import { dayText, pctOrDash, SEGMENT_LABEL } from "@/lib/metrics-text";
import { CATEGORY_LABEL, signed } from "@/lib/ops-text";
import type { MetricsView } from "@/lib/server/dal/metrics";

const t = opsCopy.metrics;
const money = formatPrice;
const signedPct = (p: number | null) => (p === null ? "" : `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toLocaleString("vi-VN")}%`);

function Stat({ label, value, sub, testId }: { label: string; value: string; sub?: string; testId?: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-elevated px-3 py-3">
      <p className="text-sm text-secondary">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums" data-testid={testId}>
        {value}
      </p>
      {sub ? <p className="text-xs text-secondary tabular-nums">{sub}</p> : null}
    </div>
  );
}

function Row({ k, v, strong, testId }: { k: string; v: string; strong?: boolean; testId?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${strong ? "font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-secondary"}>{k}</dt>
      <dd className="tabular-nums" data-testid={testId}>
        {v}
      </dd>
    </div>
  );
}

// Tab "Chỉ số" (§17.10): owner/manager. Số tiền nhân sự chỉ có trong DTO của owner.
export function MetricsPanel({ view }: { view: MetricsView }) {
  const total = (r: { pizza: number; cafe: number }) => r.pizza + r.cafe;
  const p = view.pnl;
  const maxDay = Math.max(1, ...view.daily.map(total));
  return (
    <div className="space-y-5">
      <nav aria-label={t.period} className="flex gap-2 overflow-x-auto pb-1">
        {view.periods.map((k) => (
          <Link key={k} href={`/admin/van-hanh?tab=chi-so&ky=${k}`} aria-current={k === view.period ? "page" : undefined} className={`${chip(k === view.period)} inline-flex shrink-0 items-center`}>
            {periodLabel(k)}
          </Link>
        ))}
      </nav>

      <section className={box} aria-labelledby="m-revenue">
        <h2 id="m-revenue" className={h2}>
          {t.revenueTitle}
        </h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label={t.today} value={money(total(view.revenue.today))} sub={`☕ ${money(view.revenue.today.cafe)}`} />
          <Stat label={t.week} value={money(total(view.revenue.week))} sub={`🍕 ${money(view.revenue.week.pizza)}`} />
          <Stat
            label={`${t.month} ${periodLabel(view.period)}`}
            value={money(total(view.revenue.month))}
            sub={view.revenue.monthChangePct !== null ? t.vsPrev(signedPct(view.revenue.monthChangePct)) : undefined}
            testId="m-month-revenue"
          />
        </div>
        <dl className="mt-3 text-[15px]">
          <Row k={`🍕 ${SEGMENT_LABEL.pizza}`} v={money(view.revenue.month.pizza)} testId="m-rev-pizza" />
          <Row k={`☕ ${SEGMENT_LABEL.cafe}`} v={money(view.revenue.month.cafe)} testId="m-rev-cafe" />
        </dl>
        {view.daily.length ? (
          <>
            <h3 className="mt-4 text-[15px] font-semibold">{t.dailyTitle}</h3>
            <ul className="mt-2 space-y-1.5">
              {view.daily.map((d) => (
                <li key={d.date} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-sm">
                  <span className="text-secondary">{dayText(d.date)}</span>
                  <span className="flex h-3 overflow-hidden rounded-full bg-elevated" aria-hidden>
                    <span className="bg-accent" style={{ width: `${(d.pizza / maxDay) * 100}%` }} />
                    <span className="bg-live" style={{ width: `${(d.cafe / maxDay) * 100}%` }} />
                  </span>
                  <span className="tabular-nums">{money(total(d))}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className={box} aria-labelledby="m-pnl">
        <h2 id="m-pnl" className={h2}>
          {t.pnlTitle}
        </h2>
        <p className="mt-1 text-sm text-secondary">{t.pnlHint}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {p.segments.map((s) => (
            <dl key={s.segment} className="rounded-2xl bg-elevated px-4 py-3 text-[15px]">
              <p className="font-semibold">{SEGMENT_LABEL[s.segment]}</p>
              <Row k={t.revenue} v={money(s.revenue)} />
              <Row k={t.cogs} v={money(s.cogs)} testId={`m-cogs-${s.segment}`} />
              <Row k={t.foodCost} v={pctOrDash(s.foodCostPct)} testId={`m-fc-${s.segment}`} />
              {s.shrink ? <Row k={t.shrink} v={money(s.shrink)} /> : null}
              <Row k={t.gross} v={money(s.gross)} strong />
            </dl>
          ))}
        </div>
        <dl className="mt-3 divide-y divide-line text-[15px]">
          {p.sharedCogs ? <Row k={t.shared} v={money(p.sharedCogs)} /> : null}
          <Row k={`${t.gross} (${pctOrDash(p.grossPct)})`} v={money(p.gross)} strong />
          {p.opex.map((o) => (
            <Row key={o.category} k={CATEGORY_LABEL[o.category]} v={money(o.amount)} />
          ))}
          <Row k={t.beforeLabor} v={money(p.beforeLabor)} strong testId="m-before-labor" />
          {p.labor !== undefined && p.labor !== null ? (
            <>
              <Row k={`${t.labor} (${pctOrDash(p.laborPct ?? null)})`} v={money(p.labor)} testId="m-labor" />
              {view.laborNote?.estimated ? (
                <p className="py-1 text-xs text-secondary">
                  {t.laborEstimated}
                  {view.laborNote.missingRate ? ` · ${t.missingRate(view.laborNote.missingRate)}` : ""}
                </p>
              ) : null}
              <Row k={t.prime} v={`${money(p.prime ?? 0)} (${pctOrDash(p.primePct ?? null)})`} />
              <Row k={t.net} v={money(p.net ?? 0)} strong testId="m-net" />
            </>
          ) : null}
        </dl>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label={t.perHour} value={view.revenuePerHour !== null ? money(view.revenuePerHour) : "—"} sub={t.hours((view.laborMinutes / 60).toLocaleString("vi-VN", { maximumFractionDigits: 1 }))} testId="m-per-hour" />
          <Stat label={t.foodCost} value={pctOrDash(p.foodCostPct)} />
        </div>
      </section>

      <section className={box} aria-labelledby="m-ops">
        <h2 id="m-ops" className={h2}>
          {t.opsTitle}
        </h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label={t.checklist} value={pctOrDash(view.ops.checklistPct)} />
          <Stat label={t.late} value={String(view.ops.late)} />
          <Stat label={t.fill} value={pctOrDash(view.ops.fillRate)} />
        </div>
      </section>

      <section className={box} aria-labelledby="m-cash">
        <h2 id="m-cash" className={h2}>
          {t.cashTitle}
        </h2>
        {view.cash.length === 0 ? (
          <p className="mt-2 text-secondary">{t.noCash}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line text-[15px]">
            {view.cash.map((c, i) => (
              <li key={i} className="flex items-baseline gap-3 py-2">
                <span className="min-w-0 flex-1">
                  {c.box === "register" ? t.register : t.petty} · {c.by}
                  <span className="block text-sm text-secondary">
                    {dayText(vnDateOf(new Date(c.at)))} {vnTimeLabel(new Date(c.at))}
                  </span>
                </span>
                <span className={`shrink-0 font-semibold tabular-nums ${c.variance === 0 ? "text-live" : Math.abs(c.variance) > view.cashTolerance ? "text-danger" : "text-warn"}`}>
                  {c.variance === 0 ? "✓" : signed(c.variance)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={box} aria-labelledby="m-exp">
        <h2 id="m-exp" className={h2}>
          {t.expensesTitle}
        </h2>
        {view.expenses.length === 0 ? (
          <p className="mt-2 text-secondary">{t.noExpenses}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line text-[15px]">
            {view.expenses.map((e) => (
              <li key={e.category} className="flex items-baseline gap-3 py-2">
                <span className="min-w-0 flex-1">
                  {CATEGORY_LABEL[e.category]}
                  <span className="block text-sm text-secondary">{t.prevLine(money(e.prev), signedPct(e.changePct))}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{money(e.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
