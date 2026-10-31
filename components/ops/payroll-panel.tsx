"use client";

import Link from "next/link";
import { useState } from "react";
import { advancePayslip, buildPayslips, editPayslip, saveHoliday, savePayRate, savePayrollSettings } from "@/app/actions/time";
import { useAdminAction } from "@/components/admin/use-admin";
import { PlainMoneyInput } from "@/components/ops/money-input";
import { box, h2, primaryBtn, secondaryBtn } from "@/components/ops/styles";
import { dm, printCard, SlipLines } from "@/components/ops/time-panel";
import { copy } from "@/data/copy";
import { opsCopy } from "@/data/copy-ops";
import type { PayrollSettings } from "@/lib/domain/payroll";
import type { ISODate } from "@/lib/domain/time";
import { nextPeriod, periodLabel, prevPeriod } from "@/lib/domain/worktime";
import { formatPrice } from "@/lib/format";
import type { PayrollView, PayslipView } from "@/lib/server/dal/payroll";

const t = opsCopy.pay;

// Tab "Lương" (§17.7) — chỉ chủ quán (server trả null cho người khác). Phiếu chỉ tạo từ bảng công đã xác nhận.
export function PayrollPanel({ view }: { view: PayrollView }) {
  const { pending, run } = useAdminAction();
  const p = view.period;
  const nav = (k: string) => `/admin/van-hanh?tab=luong&ky=${k}`;
  const noSlip = view.staff.filter((s) => s.timesheet !== null && !view.payslips.some((x) => x.staffId === s.id));
  return (
    <div className="space-y-5">
      <section className={box} aria-labelledby="pay-head">
        <div className="flex items-center gap-2">
          <h2 id="pay-head" className="mr-auto text-lg font-semibold">
            {t.title(periodLabel(p))}
          </h2>
          <Link href={nav(prevPeriod(p))} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-secondary hover:text-text">
            ‹ <span className="sr-only">{opsCopy.time.prevMonth}</span>
          </Link>
          <Link href={nav(nextPeriod(p))} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-secondary hover:text-text">
            › <span className="sr-only">{opsCopy.time.nextMonth}</span>
          </Link>
        </div>
        <dl className="mt-3 space-y-1 text-[15px] tabular-nums">
          <Row k={t.pizza} v={formatPrice(view.revenue.pizza)} />
          <Row k={t.cafe} v={formatPrice(view.revenue.cafe)} />
          <Row k={t.revenue} v={formatPrice(view.revenue.total)} strong />
          <Row k={t.pool(view.settings.revenueBonusPct)} v={formatPrice(view.revenue.pool)} strong />
        </dl>
        {view.canBuild ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => buildPayslips({ period: p }), (r) => t.built(r.count, r.waiting))}
            className={`${primaryBtn} mt-4`}
          >
            {view.payslips.length ? t.rebuild : t.build}
          </button>
        ) : (
          <p className="mt-3 text-sm text-secondary">{t.periodOpen}</p>
        )}
      </section>

      {view.payslips.map((s) => (
        <SlipCard key={`${s.id}-${s.status}-${s.total}`} slip={s} bonus={view.settings.complianceBonus} />
      ))}
      {noSlip.length ? (
        <section className={box} aria-labelledby="no-slip">
          <h2 id="no-slip" className={h2}>
            {t.noSlip}
          </h2>
          <ul className="mt-2 divide-y divide-line">
            {noSlip.map((s) => (
              <li key={s.id} className="flex justify-between py-2 text-[15px]">
                <span>{s.name}</span>
                <span className="text-secondary">{t.sheet[s.timesheet ?? "none"]}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Rates view={view} />
      <Holidays view={view} />
      <SettingsForm key={JSON.stringify(view.settings)} settings={view.settings} />
    </div>
  );
}

function Row({ k, v, strong = false }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-secondary"}>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function SlipCard({ slip, bonus }: { slip: PayslipView; bonus: number }) {
  const { pending, run } = useAdminAction();
  const adj = slip.lines.find((l) => l.kind === "adjustment")?.amount ?? 0;
  const [compliance, setCompliance] = useState<"auto" | "on" | "off">(slip.meta.complianceOverride === null ? "auto" : slip.meta.complianceOverride ? "on" : "off");
  const [sign, setSign] = useState<1 | -1>(adj < 0 ? -1 : 1);
  const [amount, setAmount] = useState(Math.abs(adj));
  const [note, setNote] = useState(slip.meta.adjustmentNote ?? "");
  const id = `pay-${slip.id}`;
  const st = slip.meta.stats;
  const why = slip.meta.misses.map((m) => t.misses[m]).join(", ");
  return (
    <section id={id} className={box} aria-labelledby={`${id}-h`}>
      <div className="flex items-baseline gap-2">
        <h2 id={`${id}-h`} className="mr-auto text-lg font-semibold">
          {slip.name}
        </h2>
        <span className={`text-sm font-semibold ${slip.status === "paid" ? "text-live" : slip.status === "approved" ? "text-accent" : "text-secondary"}`}>
          {t.status[slip.status]}
          {slip.received ? ` · ${opsCopy.time.receivedTag}` : ""}
        </span>
      </div>
      <p className="mt-1 text-sm text-secondary tabular-nums">
        {t.stats(st.late, st.checklistPct === null ? "—" : `${String(st.checklistPct).replace(".", ",")}%`, st.maxCashVariance === null ? "—" : formatPrice(st.maxCashVariance))}
      </p>
      <SlipLines lines={slip.lines} total={slip.total} />

      {slip.status === "draft" ? (
        <div className="mt-4 space-y-3 print:hidden">
          <div>
            <label htmlFor={`${id}-c`} className="mb-1 block text-sm text-secondary">
              {t.compliance} ({formatPrice(bonus)})
            </label>
            <select id={`${id}-c`} value={compliance} onChange={(e) => setCompliance(e.target.value as typeof compliance)} className="input">
              <option value="auto">{t.complianceAuto(slip.meta.misses.length === 0, why)}</option>
              <option value="on">{t.complianceOn}</option>
              <option value="off">{t.complianceOff}</option>
            </select>
          </div>
          <fieldset>
            <legend className="mb-1 text-sm text-secondary">{t.adjustment}</legend>
            <div className="flex gap-2">
              <select aria-label={t.adjustment} value={sign} onChange={(e) => setSign(Number(e.target.value) as 1 | -1)} className="input !w-auto !pr-9">
                <option value={1}>{t.plus}</option>
                <option value={-1}>{t.minus}</option>
              </select>
              <div className="flex-1">
                <PlainMoneyInput id={`${id}-a`} label={t.adjustment} value={amount} onChange={setAmount} />
              </div>
            </div>
          </fieldset>
          {amount ? (
            <div>
              <label htmlFor={`${id}-n`} className="mb-1 block text-sm text-secondary">
                {t.adjustmentNote}
              </label>
              <input id={`${id}-n`} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className="input" />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || (amount > 0 && !note.trim())}
              onClick={() =>
                run(
                  () => editPayslip({ id: slip.id, compliance: compliance === "auto" ? null : compliance === "on", adjustment: sign * amount, adjustmentNote: note }),
                  copy.admin.saved,
                )
              }
              className={secondaryBtn}
            >
              {t.save}
            </button>
            <button type="button" disabled={pending} onClick={() => run(() => advancePayslip({ id: slip.id, to: "approved" }), t.status.approved)} className={`${primaryBtn} !w-auto flex-1 px-6`}>
              {t.approve}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2 print:hidden">
          {slip.status === "approved" ? (
            <>
              <button type="button" disabled={pending} onClick={() => run(() => advancePayslip({ id: slip.id, to: "paid", method: "bank" }), t.status.paid)} className={secondaryBtn}>
                {t.paidBank}
              </button>
              <button type="button" disabled={pending} onClick={() => run(() => advancePayslip({ id: slip.id, to: "paid", method: "cash" }), t.status.paid)} className={secondaryBtn}>
                {t.paidCash}
              </button>
            </>
          ) : null}
          <button type="button" onClick={() => printCard(id)} className={secondaryBtn}>
            {opsCopy.time.print}
          </button>
        </div>
      )}
    </section>
  );
}

function RateRow({ s, min, today }: { s: PayrollView["staff"][number]; min: number; today: ISODate }) {
  const { pending, run } = useAdminAction();
  const [rate, setRate] = useState(s.current ?? 0);
  const [from, setFrom] = useState<string>(today);
  const id = `rate-${s.id}`;
  return (
    <li className="py-3">
      <p className="flex justify-between text-[15px]">
        <span className="font-semibold">{s.name}</span>
        <span className="tabular-nums">{s.current ? `${formatPrice(s.current)}/giờ` : t.rateNone}</span>
      </p>
      {s.rates.length > 1 ? (
        <p className="mt-0.5 text-xs text-secondary tabular-nums">{t.rateHistory(s.rates.map((r) => `${formatPrice(r.hourlyRate)} từ ${dm(r.effectiveFrom)}/${r.effectiveFrom.slice(0, 4)}`).join(" · "))}</p>
      ) : null}
      <div className="mt-2 grid grid-cols-2 gap-2 [&_input]:min-w-0">
        <PlainMoneyInput id={`${id}-v`} label={t.rate} value={rate} onChange={setRate} />
        <div>
          <label htmlFor={`${id}-d`} className="mb-1 block text-sm text-secondary">
            {t.rateFrom}
          </label>
          <input id={`${id}-d`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input tabular-nums" />
        </div>
      </div>
      {rate !== (s.current ?? 0) || from !== today ? (
        <button
          type="button"
          disabled={pending || rate < min || !from}
          onClick={() => run(() => savePayRate({ staffId: s.id, hourlyRate: rate, effectiveFrom: from }), copy.admin.saved)}
          className={`${secondaryBtn} mt-2`}
        >
          {t.save}
        </button>
      ) : null}
    </li>
  );
}

function Rates({ view }: { view: PayrollView }) {
  const today = view.today;
  return (
    <section className={box} aria-labelledby="rates">
      <h2 id="rates" className={h2}>
        {t.rates}
      </h2>
      <p className="mt-1 text-sm text-secondary">{t.rateMin(formatPrice(view.settings.minHourly))}</p>
      <ul className="mt-1 divide-y divide-line">
        {view.staff.map((s) => (
          <RateRow key={`${s.id}-${s.current}`} s={s} min={view.settings.minHourly} today={today} />
        ))}
      </ul>
    </section>
  );
}

function Holidays({ view }: { view: PayrollView }) {
  const { pending, run } = useAdminAction();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [mult, setMult] = useState("3");
  const m = Number(mult.replace(",", "."));
  return (
    <section className={box} aria-labelledby="holidays">
      <h2 id="holidays" className={h2}>
        {t.holidays}
      </h2>
      <p className="mt-1 text-sm text-secondary">{t.holidayHint}</p>
      <ul className="mt-2 divide-y divide-line">
        {view.holidays.map((h) => (
          <li key={h.date} className="flex items-center gap-2 py-2 text-[15px] tabular-nums">
            <span className="mr-auto">
              {dm(h.date)}/{h.date.slice(0, 4)} · {h.name} · ×{String(h.multiplier).replace(".", ",")}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => saveHoliday({ date: h.date, name: h.name, multiplier: h.multiplier, remove: true }), copy.admin.saved)}
              className={`${secondaryBtn} !min-h-11 !px-4`}
              aria-label={t.holidayRemove(h.name)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_4.5rem] gap-2">
        <label className="text-sm text-secondary">
          {t.holidayDate}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input mt-1 min-w-0 tabular-nums" />
        </label>
        <label className="text-sm text-secondary">
          {t.holidayMult}
          <input inputMode="decimal" value={mult} onChange={(e) => setMult(e.target.value)} className="input mt-1 min-w-0 tabular-nums" />
        </label>
        <label className="col-span-2 text-sm text-secondary">
          {t.holidayName}
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className="input mt-1" />
        </label>
      </div>
      <button
        type="button"
        disabled={pending || !date || !name.trim() || !(m >= 1 && m <= 5)}
        onClick={() =>
          run(() => saveHoliday({ date, name, multiplier: m }), copy.admin.saved, () => {
            setDate("");
            setName("");
          })
        }
        className={`${secondaryBtn} mt-3`}
      >
        {t.holidayAdd}
      </button>
    </section>
  );
}

function SettingsForm({ settings }: { settings: PayrollSettings }) {
  const { pending, run } = useAdminAction();
  const [v, setV] = useState(settings);
  const num = (k: keyof PayrollSettings, label: string) => (
    <label key={k} className="text-sm text-secondary">
      {label}
      <input
        inputMode="decimal"
        value={String(v[k])}
        onChange={(e) => setV({ ...v, [k]: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })}
        className="input mt-1 tabular-nums"
      />
    </label>
  );
  return (
    <section className={box} aria-labelledby="pay-settings">
      <h2 id="pay-settings" className={h2}>
        {t.settings}
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {num("minHourly", t.minHourly)}
        {num("payDay", t.payDay)}
        {num("revenueBonusPct", t.revenueBonusPct)}
        {num("complianceBonus", t.complianceBonus)}
        {num("maxLate", t.maxLate)}
        {num("minChecklistPct", t.minChecklistPct)}
        {num("maxCashVariance", t.maxCashVariance)}
      </div>
      <button type="button" disabled={pending} onClick={() => run(() => savePayrollSettings(v), copy.admin.saved)} className={`${secondaryBtn} mt-4`}>
        {t.save}
      </button>
    </section>
  );
}
