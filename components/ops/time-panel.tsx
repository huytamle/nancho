"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ackPayslip,
  ackTimesheet,
  clockIn,
  clockOut,
  copyLastWeek,
  disputeTimesheet,
  markStoreIp,
  reviewTimeEntry,
  savePlan,
  saveTimeEntry,
  submitTimesheet,
} from "@/app/actions/time";
import { useAdminAction, useNow } from "@/components/admin/use-admin";
import { ShiftBoard, ShiftReview } from "@/components/ops/shift-requests";
import { box, h2, primaryBtn, secondaryBtn } from "@/components/ops/styles";
import { opsCopy } from "@/data/copy-ops";
import type { PayLine } from "@/lib/domain/payroll";
import { addDays, toVnLocal, vnDateOf, vnTimeLabel, vnWeekday, type ISODate } from "@/lib/domain/time";
import { formatMinutes, nextPeriod, periodLabel, prevPeriod, type Period, type WorkTotals } from "@/lib/domain/worktime";
import { formatPrice } from "@/lib/format";
import type { MyPayslip, MyTimesheet, PlanView, TimeEntryView, TimesheetRow, TimeView } from "@/lib/server/dal/payroll";

const t = opsCopy.time;
const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;

export const dm = (d: ISODate) => `${d.slice(8)}/${d.slice(5, 7)}`;
export const dayLabel = (d: ISODate) => `${WD[vnWeekday(d)]} ${dm(d)}`;
const hm = (iso: string) => vnTimeLabel(new Date(iso));
const whenLabel = (iso: string) => `${hm(iso)} ${dm(vnDateOf(new Date(iso)))}`;
const chip = "inline-flex items-center rounded-full bg-elevated px-2.5 py-0.5 text-xs font-semibold";

// Tab "Công" (§17.7): vào/ra ca một chạm, lịch ca, giờ công tháng, xác nhận bảng công bằng PIN, phiếu lương của mình.
// Owner/manager thêm: lượt cần xem lại, xếp lịch tuần, gửi bảng công, Wi-Fi quán. Không có số tiền của người khác.
export function TimePanel({ time }: { time: TimeView }) {
  const { me, manage } = time;
  return (
    <div className="space-y-5">
      {me.onPayroll ? <ClockCard time={time} /> : <p className={`${box} text-[15px] text-secondary`}>{t.ownerNote}</p>}
      {me.timesheets
        .filter((s) => s.status === "submitted")
        .map((s) => (
          <MySheet key={s.period} sheet={s} />
        ))}
      {me.payslips.map((p) => (
        <MySlip key={p.id} slip={p} />
      ))}
      {me.onPayroll ? <MyWeek plans={me.week} /> : null}
      {me.onPayroll ? <ShiftBoard shifts={time.shifts} today={time.today} /> : null}
      <ShiftReview shifts={time.shifts} />
      {me.onPayroll ? <MyMonth time={time} /> : null}
      {me.timesheets
        .filter((s) => s.status === "acknowledged")
        .map((s) => (
          <MySheet key={s.period} sheet={s} />
        ))}
      {manage ? (
        <>
          <Review entries={manage.review} />
          <Sheets manage={manage} />
          <Planner manage={manage} today={time.today} />
          <Wifi ip={time.ip} ips={manage.storeIps} />
        </>
      ) : null}
    </div>
  );
}

function ClockCard({ time }: { time: TimeView }) {
  const { pending, run } = useAdminAction();
  const now = useNow(30_000);
  const open = time.me.open;
  const plan = time.me.week.find((p) => p.date === time.today);
  const elapsed = open && now ? Math.max(0, Math.floor((now - new Date(open.clockIn).getTime()) / 60_000)) : null;
  return (
    <section className={box} aria-labelledby="clock">
      <h2 id="clock" className="text-2xl font-semibold" aria-live="polite">
        {open ? t.in(hm(open.clockIn)) : t.notIn}
      </h2>
      <p className="mt-1 text-[15px] text-secondary">
        {open && elapsed !== null ? t.elapsed(formatMinutes(elapsed)) : plan ? t.planToday(`${plan.start}–${plan.end}`) : t.noPlanToday}
      </p>
      {time.atStore === null ? null : (
        <p className={`mt-2 text-sm ${time.atStore ? "text-live" : "text-warn"}`}>{time.atStore ? t.atStore : t.offSite}</p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          open
            ? run(clockOut, (r) => (r.forgot ? t.forgot : r.lateOut ? t.lateOut : t.clockedOut(formatMinutes(r.minutes))))
            : run(clockIn, (r) => (r.closedForgotten ? t.forgot : t.clockedIn(hm(r.at))))
        }
        className={`${primaryBtn} mt-4 ${open ? "!bg-elevated !text-text" : ""}`}
      >
        {open ? t.clockOut : t.clockIn}
      </button>
    </section>
  );
}

function MyWeek({ plans }: { plans: PlanView[] }) {
  return (
    <section className={box} aria-labelledby="my-week">
      <h2 id="my-week" className={h2}>
        {t.week}
      </h2>
      {plans.length === 0 ? (
        <p className="mt-2 text-[15px] text-secondary">{t.noWeek}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {plans.map((p) => (
            <li key={p.date} className="flex justify-between py-2 text-[15px] tabular-nums">
              <span>{dayLabel(p.date)}</span>
              <span className="font-semibold">
                {p.start}–{p.end}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Tổng phút: giờ công · đêm · làm thêm · lễ · ngày · đi muộn. */
export function TotalsGrid({ totals }: { totals: WorkTotals }) {
  const cells: [string, string][] = [
    [t.minutes, formatMinutes(totals.minutes)],
    [t.days, String(totals.days)],
    [t.night, formatMinutes(totals.night)],
    [t.overtime, formatMinutes(totals.overtime)],
    [t.holiday, formatMinutes(totals.holiday)],
    [t.late, t.times(totals.late)],
  ];
  return (
    <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {cells.map(([k, v]) => (
        <div key={k} className="rounded-2xl bg-elevated px-3 py-2">
          <dt className="text-xs text-secondary">{k}</dt>
          <dd className="text-[15px] font-semibold tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Flags({ e }: { e: Pick<TimeEntryView, "flags" | "clockOut"> }) {
  return (
    <>
      {e.clockOut === null ? <span className={`${chip} text-live`}>{t.open}</span> : null}
      {e.flags.map((f) => (
        <span key={f} className={`${chip} ${f === "edited" ? "text-secondary" : "text-warn"}`}>
          {t.flags[f]}
        </span>
      ))}
    </>
  );
}

function EntryLine({ e, showName = false }: { e: TimeEntryView; showName?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] tabular-nums">
      {showName ? <span className="font-semibold">{e.name}</span> : null}
      <span>{dayLabel(vnDateOf(new Date(e.clockIn)))}</span>
      <span className="text-secondary">
        {hm(e.clockIn)}–{e.clockOut ? hm(e.clockOut) : "…"}
      </span>
      {e.clockOut ? <span className="text-secondary">· {formatMinutes(e.minutes)}</span> : null}
      <Flags e={e} />
      {e.editReason ? <span className="w-full text-sm text-secondary">“{e.editReason}”</span> : null}
    </div>
  );
}

function MyMonth({ time }: { time: TimeView }) {
  const { month, entries } = time.me;
  return (
    <section className={box} aria-labelledby="my-month">
      <h2 id="my-month" className={h2}>
        {t.month(periodLabel(month.period))}
      </h2>
      <TotalsGrid totals={month.totals} />
      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer py-2 text-[15px] font-semibold">
          {t.entries} ({entries.length})
        </summary>
        {entries.length === 0 ? <p className="text-sm text-secondary">{t.noEntries}</p> : null}
        <ul className="divide-y divide-line">
          {entries.map((e) => (
            <li key={e.id} className="py-2">
              <EntryLine e={e} />
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function DaysTable({ sheet }: { sheet: MyTimesheet }) {
  const days = sheet.days.filter((d) => d.minutes > 0 || d.planned);
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead className="text-left text-secondary">
          <tr>
            <th className="py-1 pr-2 font-normal">{t.day}</th>
            <th className="py-1 pr-2 text-right font-normal">{t.minutes}</th>
            <th className="py-1 pr-2 text-right font-normal">{t.night}</th>
            <th className="py-1 text-right font-normal">{t.holiday}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {days.map((d) => (
            <tr key={d.date}>
              <td className="py-1.5 pr-2">
                {dayLabel(d.date)}
                {d.late ? <span className="ml-1 text-warn">· {t.late.toLowerCase()}</span> : null}
              </td>
              <td className="py-1.5 pr-2 text-right">{formatMinutes(d.minutes)}</td>
              <td className="py-1.5 pr-2 text-right">{d.night ? formatMinutes(d.night) : "—"}</td>
              <td className="py-1.5 text-right">{d.holiday ? formatMinutes(d.holiday) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MySheet({ sheet }: { sheet: MyTimesheet }) {
  const { pending, run } = useAdminAction();
  const [pin, setPin] = useState("");
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const id = `sheet-${sheet.period}`;
  const submitted = sheet.status === "submitted";
  return (
    <section className={`${box} ${submitted ? "ring-2 ring-accent" : ""}`} aria-labelledby={id}>
      <h2 id={id} className="text-lg font-semibold">
        {t.sheetTitle(periodLabel(sheet.period))}
      </h2>
      <p className="mt-1 text-sm text-secondary">
        {submitted ? t.sheetSubmitted : t.sheetAcked(whenLabel(sheet.ackAt!), sheet.hash.slice(0, 8))}
      </p>
      <TotalsGrid totals={sheet.totals} />
      {submitted ? <DaysTable sheet={sheet} /> : null}
      {submitted ? (
        <div className="mt-4">
          <label htmlFor={`${id}-pin`} className="mb-1 block text-sm text-secondary">
            {t.pin}
          </label>
          <input
            id={`${id}-pin`}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="input tabular-nums tracking-[0.4em]"
          />
          <button
            type="button"
            disabled={pending || pin.length !== 6}
            onClick={() => run(() => ackTimesheet({ period: sheet.period, pin }), t.acked, () => setPin(""))}
            className={`${primaryBtn} mt-3`}
          >
            {t.ack}
          </button>
          <p className="mt-2 text-xs text-secondary">{t.legal}</p>
          {disputing ? (
            <div className="mt-3">
              <label htmlFor={`${id}-why`} className="mb-1 block text-sm text-secondary">
                {t.disputeReason}
              </label>
              <input id={`${id}-why`} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} className="input" />
              <button
                type="button"
                disabled={pending || reason.trim().length < 3}
                onClick={() => run(() => disputeTimesheet({ period: sheet.period, reason }), t.disputed)}
                className={`${secondaryBtn} mt-2`}
              >
                {t.disputeSend}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setDisputing(true)} className={`${secondaryBtn} mt-3`}>
              {t.dispute}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}

/** Dòng phiếu lương (bảng kê trả lương — BLLĐ 2019 Đ.95). Dùng chung với tab Lương. */
export function SlipLines({ lines, total }: { lines: PayLine[]; total: number }) {
  return (
    <table className="mt-3 w-full text-[15px] tabular-nums">
      <tbody className="divide-y divide-line">
        {lines.map((l, i) => (
          <tr key={i}>
            <td className="py-1.5 pr-2">
              {l.label}
              {l.minutes !== undefined && l.rate !== undefined ? (
                <span className="block text-xs text-secondary">{t.lineDetail(formatMinutes(l.minutes), formatPrice(l.rate))}</span>
              ) : l.minutes !== undefined ? (
                <span className="block text-xs text-secondary">{formatMinutes(l.minutes)}</span>
              ) : null}
            </td>
            <td className={`py-1.5 text-right ${l.amount < 0 ? "text-danger" : ""}`}>{l.amount < 0 ? `−${formatPrice(-l.amount)}` : formatPrice(l.amount)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-line font-semibold">
          <td className="pt-2">{t.slipTotal}</td>
          <td className="pt-2 text-right text-lg">{formatPrice(total)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

/** In riêng một thẻ: gắn lớp `print-target` rồi gọi window.print() (CSS @media print ở globals.css). */
export function printCard(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("print-target");
  document.body.dataset.print = "1";
  const done = () => {
    el.classList.remove("print-target");
    delete document.body.dataset.print;
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}

function MySlip({ slip }: { slip: MyPayslip }) {
  const { pending, run } = useAdminAction();
  const id = `slip-${slip.id}`;
  return (
    <section id={id} className={box} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="text-lg font-semibold">
        {t.slipTitle(periodLabel(slip.period))}
      </h2>
      <p className="mt-1 text-sm text-secondary">
        {slip.status === "paid" ? t.slipPaid(whenLabel(slip.paidAt!), t.paidMethod[slip.paidMethod ?? "bank"]) : t.slipApproved}
        {slip.received ? ` · ${t.receivedTag}` : ""}
      </p>
      <SlipLines lines={slip.lines} total={slip.total} />
      <div className="mt-4 flex flex-wrap gap-2 print:hidden">
        {slip.status === "paid" && !slip.received ? (
          <button type="button" disabled={pending} onClick={() => run(() => ackPayslip({ id: slip.id }), t.receivedTag)} className={`${primaryBtn} !w-auto px-6`}>
            {t.received}
          </button>
        ) : null}
        <button type="button" onClick={() => printCard(id)} className={secondaryBtn}>
          {t.print}
        </button>
      </div>
    </section>
  );
}

// ── Quản lý ──

function EntryEditor({ staffId, entry, onDone }: { staffId: number; entry?: TimeEntryView; onDone: () => void }) {
  const { pending, run } = useAdminAction();
  const base = entry ? new Date(entry.clockIn) : new Date();
  const [from, setFrom] = useState(entry ? toVnLocal(new Date(entry.clockIn)) : `${vnDateOf(base)}T16:00`);
  const [to, setTo] = useState(entry?.clockOut && entry.clockOut !== entry.clockIn ? toVnLocal(new Date(entry.clockOut)) : `${vnDateOf(base)}T22:00`);
  const [reason, setReason] = useState("");
  const key = entry ? `e${entry.id}` : `new${staffId}`;
  return (
    <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2 rounded-2xl bg-elevated p-3 sm:grid-cols-2">
      <label className="text-sm text-secondary">
        {t.from}
        <input id={`${key}-in`} type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="input mt-1 min-w-0 tabular-nums" />
      </label>
      <label className="text-sm text-secondary">
        {t.to}
        <input id={`${key}-out`} type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="input mt-1 min-w-0 tabular-nums" />
      </label>
      <label className="text-sm text-secondary sm:col-span-2">
        {t.reason}
        <input id={`${key}-why`} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} className="input mt-1" />
      </label>
      <button
        type="button"
        disabled={pending || reason.trim().length < 3}
        onClick={() => run(() => saveTimeEntry({ id: entry?.id, staffId, clockIn: from, clockOut: to, reason }), opsCopy.time.save, onDone)}
        className={`${secondaryBtn} sm:col-span-2`}
      >
        {t.save}
      </button>
    </div>
  );
}

function ReviewRow({ e }: { e: TimeEntryView }) {
  const { pending, run } = useAdminAction();
  const [editing, setEditing] = useState(false);
  const forgot = e.flags.includes("forgot_out");
  return (
    <li className="py-3">
      <EntryLine e={e} showName />
      <div className="mt-2 flex gap-2">
        {forgot ? null : (
          <button type="button" disabled={pending} onClick={() => run(() => reviewTimeEntry({ id: e.id }), opsCopy.time.save)} className={secondaryBtn}>
            {t.confirm}
          </button>
        )}
        <button type="button" onClick={() => setEditing(!editing)} aria-expanded={editing} className={secondaryBtn}>
          {t.edit}
        </button>
      </div>
      {editing ? <EntryEditor staffId={e.staffId} entry={e} onDone={() => setEditing(false)} /> : null}
    </li>
  );
}

function Review({ entries }: { entries: TimeEntryView[] }) {
  return (
    <section className={box} aria-labelledby="review">
      <h2 id="review" className={h2}>
        {t.review} {entries.length ? `(${entries.length})` : ""}
      </h2>
      <p className="mt-1 text-sm text-secondary">{entries.length ? t.reviewHint : t.reviewEmpty}</p>
      <ul className="divide-y divide-line">
        {entries.map((e) => (
          <ReviewRow key={`${e.id}-${e.flags.join()}`} e={e} />
        ))}
      </ul>
    </section>
  );
}

function SheetRow({ row, entries, period }: { row: TimesheetRow; entries: TimeEntryView[]; period: Period }) {
  const { pending, run } = useAdminAction();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto font-semibold">{row.name}</span>
        <span className={`${chip} ${row.status === "acknowledged" ? "text-live" : row.status === "submitted" ? "text-accent" : "text-secondary"}`}>{t.status[row.status]}</span>
        {row.flagged ? <span className={`${chip} text-warn`}>{t.flagged(row.flagged)}</span> : null}
      </div>
      {row.disputeReason ? <p className="mt-1 text-sm text-warn">{t.disputeFrom(row.disputeReason)}</p> : null}
      <TotalsGrid totals={row.totals} />
      {row.canSubmit ? (
        <button type="button" disabled={pending} onClick={() => run(() => submitTimesheet({ staffId: row.staffId, period }), t.submitted)} className={`${primaryBtn} mt-3`}>
          {t.submit}
        </button>
      ) : null}
      {row.status === "draft" ? (
        <details className="mt-2">
          <summary className="min-h-11 cursor-pointer py-2 text-[15px] font-semibold">
            {t.entries} ({entries.length})
          </summary>
          <ul className="divide-y divide-line">
            {entries.map((e) => (
              <li key={e.id} className="py-2">
                <div className="flex items-start gap-2">
                  <div className="mr-auto">
                    <EntryLine e={e} />
                  </div>
                  <button type="button" onClick={() => setEditing(editing === e.id ? null : e.id)} aria-expanded={editing === e.id} className={`${secondaryBtn} !min-h-11 !px-4`}>
                    {t.edit}
                  </button>
                </div>
                {editing === e.id ? <EntryEditor staffId={row.staffId} entry={e} onDone={() => setEditing(null)} /> : null}
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setEditing(editing === "new" ? null : "new")} aria-expanded={editing === "new"} className={`${secondaryBtn} mt-2`}>
            {t.addEntry}
          </button>
          {editing === "new" ? <EntryEditor staffId={row.staffId} onDone={() => setEditing(null)} /> : null}
        </details>
      ) : null}
    </li>
  );
}

function Sheets({ manage }: { manage: NonNullable<TimeView["manage"]> }) {
  const p = manage.period;
  const nav = (k: Period) => `/admin/van-hanh?tab=cong&ky=${k}&tuan=${manage.week}`;
  return (
    <section className={box} aria-labelledby="sheets">
      <div className="flex items-center gap-2">
        <h2 id="sheets" className={`${h2} mr-auto`}>
          {t.sheetsTitle(periodLabel(p))}
        </h2>
        <Link href={nav(prevPeriod(p))} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-secondary hover:text-text">
          ‹ <span className="sr-only">{t.prevMonth}</span>
        </Link>
        <Link href={nav(nextPeriod(p))} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-secondary hover:text-text">
          › <span className="sr-only">{t.nextMonth}</span>
        </Link>
      </div>
      {manage.timesheets.length === 0 ? <p className="mt-2 text-[15px] text-secondary">{t.noSheets}</p> : null}
      <ul className="divide-y divide-line">
        {manage.timesheets.map((r) => (
          <SheetRow key={`${r.staffId}-${r.status}`} row={r} entries={manage.entries.filter((e) => e.staffId === r.staffId)} period={p} />
        ))}
      </ul>
    </section>
  );
}

function PlanCell({ staffId, name, date, plan }: { staffId: number; name: string; date: ISODate; plan: PlanView | undefined }) {
  const { pending, run } = useAdminAction();
  const [start, setStart] = useState(plan?.start ?? "");
  const [end, setEnd] = useState(plan?.end ?? "");
  const dirty = start !== (plan?.start ?? "") || end !== (plan?.end ?? "");
  const id = `plan-${staffId}-${date}`;
  // Ô giờ có bề rộng nội tại lớn trên Chromium mobile → minmax(0,1fr) + min-w-0 để không tràn ngang ở 390 px.
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
      <span className="truncate text-sm text-secondary">{name}</span>
      <input id={`${id}-s`} type="time" aria-label={`${t.start} · ${name} · ${dayLabel(date)}`} value={start} onChange={(e) => setStart(e.target.value)} className="input !min-h-11 min-w-0 !px-2 tabular-nums" />
      <input id={`${id}-e`} type="time" aria-label={`${t.end} · ${name} · ${dayLabel(date)}`} value={end} onChange={(e) => setEnd(e.target.value)} className="input !min-h-11 min-w-0 !px-2 tabular-nums" />
      {dirty ? (
        <button
          type="button"
          disabled={pending || !!start !== !!end}
          onClick={() => run(() => savePlan({ staffId, date, start: start || null, end: end || null }), start ? t.save : t.off)}
          className={`${secondaryBtn} col-start-2 col-end-4 !min-h-11`}
        >
          {start ? t.save : t.off}
        </button>
      ) : null}
    </div>
  );
}

function Planner({ manage, today }: { manage: NonNullable<TimeView["manage"]>; today: ISODate }) {
  const { pending, run } = useAdminAction();
  const days = Array.from({ length: 7 }, (_, i) => addDays(manage.week, i));
  const nav = (w: ISODate) => `/admin/van-hanh?tab=cong&ky=${manage.period}&tuan=${w}`;
  return (
    <section className={box} aria-labelledby="planner">
      <div className="flex items-center gap-2">
        <h2 id="planner" className={`${h2} mr-auto`}>
          {t.planTitle} {t.weekLabel(dm(days[0]), dm(days[6]))}
        </h2>
        <Link href={nav(addDays(manage.week, -7))} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-secondary hover:text-text">
          ‹ <span className="sr-only">{t.prevWeek}</span>
        </Link>
        <Link href={nav(addDays(manage.week, 7))} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-secondary hover:text-text">
          › <span className="sr-only">{t.nextWeek}</span>
        </Link>
      </div>
      <button type="button" disabled={pending} onClick={() => run(() => copyLastWeek({ week: manage.week }), (r) => t.copied(r.count))} className={`${secondaryBtn} mt-2`}>
        {t.copyWeek}
      </button>
      <ul className="mt-2 divide-y divide-line">
        {days.map((d) => (
          <li key={d} className="py-3">
            <p className={`mb-2 text-[15px] font-semibold ${d === today ? "text-accent" : ""}`}>{dayLabel(d)}</p>
            <ul className="space-y-2">
              {manage.staff.map((s) => {
                const plan = manage.plans.find((p) => p.staffId === s.id && p.date === d);
                return (
                  <li key={s.id}>
                    <PlanCell key={`${plan?.start}-${plan?.end}`} staffId={s.id} name={s.name} date={d} plan={plan} />
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Wifi({ ip, ips }: { ip: string; ips: string[] }) {
  const { pending, run } = useAdminAction();
  return (
    <section className={box} aria-labelledby="wifi">
      <h2 id="wifi" className={h2}>
        {t.wifiTitle}
      </h2>
      <p className="mt-1 text-sm text-secondary">{t.wifiHint}</p>
      <p className="mt-2 text-[15px] tabular-nums">{t.wifiNow(ip)}</p>
      <p className="mt-1 text-sm text-secondary tabular-nums">{ips.length ? t.wifiList(ips.join(", ")) : t.wifiNone}</p>
      <button type="button" disabled={pending || ips[0] === ip} onClick={() => run(markStoreIp, opsCopy.time.save)} className={`${secondaryBtn} mt-3`}>
        {t.wifiMark}
      </button>
    </section>
  );
}
