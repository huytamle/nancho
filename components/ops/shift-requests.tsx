"use client";

import { useState } from "react";
import { cancelShiftRequest, decideShift, requestShift, respondShift } from "@/app/actions/shifts";
import { useAdminAction } from "@/components/admin/use-admin";
import { box, h2, primaryBtn, secondaryBtn } from "@/components/ops/styles";
import { opsCopy } from "@/data/copy-ops";
import { vnWeekday, type ISODate } from "@/lib/domain/time";
import type { ShiftRequestView, ShiftsView } from "@/lib/server/dal/shifts";

const t = opsCopy.shifts;
const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;
const day = (d: ISODate) => `${WD[vnWeekday(d)]} ${d.slice(8)}/${d.slice(5, 7)}`;
const span = (r: ShiftRequestView) => (r.start && r.end ? `${r.start}–${r.end}` : null);

function Line({ r, who = false }: { r: ShiftRequestView; who?: boolean }) {
  return (
    <p className="text-[15px]">
      {who ? <span className="font-semibold">{r.from} · </span> : null}
      {t.line(r.kind, day(r.date), span(r))}
      {r.to ? <span className="text-secondary"> {t.giveTo(r.to)}</span> : null}
      {r.note ? <span className="block text-sm text-secondary">“{r.note}”</span> : null}
    </p>
  );
}

/** Nhân viên: gửi đề nghị, xem đề nghị của mình, nhận ca đồng nghiệp nhường. */
export function ShiftBoard({ shifts, today }: { shifts: ShiftsView; today: ISODate }) {
  const { pending, run } = useAdminAction();
  const [kind, setKind] = useState<"claim" | "give" | "leave">("claim");
  const [date, setDate] = useState<string>(today);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("15:30");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const send = () =>
    run(
      () =>
        requestShift({
          kind,
          date,
          start: kind === "claim" ? start : null,
          end: kind === "claim" ? end : null,
          targetId: kind === "give" && target ? Number(target) : null,
          note,
        }),
      t.sent,
      () => setNote(""),
    );
  return (
    <section className={box} aria-labelledby="shift-board">
      <h2 id="shift-board" className={h2}>
        {t.title}
      </h2>
      <p className="mt-1 text-sm text-secondary">{t.hint}</p>

      {shifts.offers.length ? (
        <div className="mt-3">
          <h3 className="text-sm font-semibold">{t.offers}</h3>
          <ul className="divide-y divide-line">
            {shifts.offers.map((r) => (
              <li key={r.id} className="py-2">
                <Line r={r} who />
                <div className="mt-2 flex gap-2">
                  <button type="button" disabled={pending} onClick={() => run(() => respondShift({ id: r.id, accept: true }), t.sent)} className={primaryBtn}>
                    {t.take}
                  </button>
                  {r.to ? (
                    <button type="button" disabled={pending} onClick={() => run(() => respondShift({ id: r.id, accept: false }))} className={secondaryBtn}>
                      {t.decline}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="col-span-2 text-sm text-secondary">
          {t.kindLabel}
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="input mt-1">
            {(["claim", "give", "leave"] as const).map((k) => (
              <option key={k} value={k}>
                {t.kind[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 min-w-0 text-sm text-secondary">
          {t.date}
          <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className="input mt-1 min-w-0" />
        </label>
        {kind === "claim" ? (
          <>
            <label className="min-w-0 text-sm text-secondary">
              {opsCopy.time.start}
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="input mt-1 min-w-0" />
            </label>
            <label className="min-w-0 text-sm text-secondary">
              {opsCopy.time.end}
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="input mt-1 min-w-0" />
            </label>
          </>
        ) : null}
        {kind === "give" ? (
          <label className="col-span-2 text-sm text-secondary">
            {t.to}
            <select value={target} onChange={(e) => setTarget(e.target.value)} className="input mt-1">
              <option value="">{t.anyone}</option>
              {shifts.colleagues.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="col-span-2 text-sm text-secondary">
          {t.note}
          <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className="input mt-1" />
        </label>
      </div>
      <button type="button" disabled={pending || !date} onClick={send} className={`${primaryBtn} mt-3`}>
        {t.send}
      </button>

      <h3 className="mt-5 text-sm font-semibold">{t.mine}</h3>
      {shifts.mine.length === 0 ? (
        <p className="mt-1 text-sm text-secondary">{t.none}</p>
      ) : (
        <ul className="divide-y divide-line">
          {shifts.mine.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-2">
              <div className="mr-auto">
                <Line r={r} />
                <p className="text-xs text-secondary">{t.status[r.status]}</p>
              </div>
              {r.status === "open" || r.status === "pending" ? (
                <button type="button" disabled={pending} onClick={() => run(() => cancelShiftRequest({ id: r.id }))} className={secondaryBtn}>
                  {t.cancel}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Owner/manager: duyệt đề nghị. */
export function ShiftReview({ shifts }: { shifts: ShiftsView }) {
  const { pending, run } = useAdminAction();
  if (shifts.review.length === 0) return null;
  return (
    <section className={`${box} ring-2 ring-accent`} aria-labelledby="shift-review">
      <h2 id="shift-review" className={h2}>
        {t.review} ({shifts.review.length})
      </h2>
      <ul className="divide-y divide-line">
        {shifts.review.map((r) => (
          <li key={r.id} className="py-2">
            <Line r={r} who />
            <div className="mt-2 flex gap-2">
              <button type="button" disabled={pending} onClick={() => run(() => decideShift({ id: r.id, approve: true }))} className={primaryBtn}>
                {t.approve}
              </button>
              <button type="button" disabled={pending} onClick={() => run(() => decideShift({ id: r.id, approve: false }))} className={secondaryBtn}>
                {t.reject}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
