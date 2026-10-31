"use client";

import { useState } from "react";
import { checkPetty, closeShift, dropCash, openShift, replenishPetty, saveOpsSettings } from "@/app/actions/ops";
import { OvenLock } from "@/components/admin/oven-lock";
import { useAdminAction } from "@/components/admin/use-admin";
import { CashCounter } from "@/components/ops/cash-counter";
import { MoneyInput, PlainMoneyInput } from "@/components/ops/money-input";
import { PhotoInput } from "@/components/ops/photo-input";
import { box, h2, primaryBtn, secondaryBtn } from "@/components/ops/styles";
import { copy } from "@/data/copy";
import { opsCopy } from "@/data/copy-ops";
import type { CashCounts } from "@/lib/domain/cash";
import { vnTimeLabel } from "@/lib/domain/time";
import { formatPrice } from "@/lib/format";
import { varianceText } from "@/lib/ops-text";
import type { WorkView } from "@/lib/server/dal/checklist";
import type { OpsView, ShiftView } from "@/lib/server/dal/ops";
import type { OvenLockView } from "@/lib/server/dal/sale-day";

const t = opsCopy;

type Count = { total: number; expected: number | null; variance: number | null };

/** Kết quả đếm (đếm mù: số đáng có chỉ hiện sau khi gửi). */
function CountResult({ r, tolerance }: { r: Count; tolerance: number }) {
  if (r.expected === null) return <p role="status" className="mt-3 rounded-2xl bg-elevated p-4 text-[15px]">{t.shift.firstOpen}</p>;
  const level = r.variance === 0 ? "text-live" : Math.abs(r.variance!) <= tolerance ? "text-warn" : "text-danger";
  return (
    <p role="status" className="mt-3 rounded-2xl bg-elevated p-4 text-[15px] tabular-nums">
      {t.shift.result(formatPrice(r.total), formatPrice(r.expected))} ·{" "}
      <strong className={level}>{varianceText(r.variance!, tolerance)}</strong>
    </p>
  );
}

export function ShiftPanel({ view, work, lock }: { view: OpsView; work: WorkView; lock: OvenLockView | null }) {
  // Kết quả đếm giữ ở đây: mở/đóng ca xong thì form tương ứng biến mất (refresh), kết quả vẫn phải còn.
  const [result, setResult] = useState<Count | null>(null);
  return (
    <div className="space-y-5">
      {lock ? <OvenLock lock={lock} /> : null}
      {result ? <CountResult r={result} tolerance={view.settings.cashTolerance} /> : null}
      {view.openShift ? (
        <CloseShift
          key={view.openShift.id}
          view={view}
          shift={view.openShift}
          pendingClose={work.runs.filter((r) => r.moment === "close" && !r.complete).map((r) => `${r.title} (${r.done}/${r.total})`)}
          onResult={setResult}
        />
      ) : (
        <OpenShift onResult={setResult} />
      )}
      <PettyBox view={view} />
      {view.recentShifts.length > 0 ? <RecentShifts view={view} /> : null}
      {view.viewer.isOwner ? <OpsSettingsForm key={`${view.settings.cashTolerance}-${view.settings.pettyFloat}`} view={view} /> : null}
    </div>
  );
}

function OpenShift({ onResult }: { onResult: (r: Count) => void }) {
  const { pending, run } = useAdminAction();
  const [counts, setCounts] = useState<CashCounts>({});
  const [note, setNote] = useState("");
  return (
    <section className={box} aria-labelledby="open-shift">
      <h2 id="open-shift" className={h2}>
        {t.shift.openTitle}
      </h2>
      <p className="mt-1 mb-4 text-sm text-secondary">{t.shift.openHint}</p>
      <CashCounter id="open" value={counts} onChange={setCounts} />
      <label htmlFor="open-note" className="mt-4 mb-1 block text-sm text-secondary">
        {t.shift.note}
      </label>
      <input id="open-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className="input" />
      <button type="button" disabled={pending} onClick={() => run(() => openShift({ counts, note }), t.shift.opened, onResult)} className={`${primaryBtn} mt-4`}>
        {t.shift.open}
      </button>
    </section>
  );
}

function CloseShift({ view, shift, pendingClose, onResult }: { view: OpsView; shift: ShiftView; pendingClose: string[]; onResult: (r: Count) => void }) {
  const { pending, run } = useAdminAction();
  const [cafeCash, setCafeCash] = useState(0);
  const [cafeTransfer, setCafeTransfer] = useState(0);
  const [cafeOther, setCafeOther] = useState(0);
  const [photo, setPhoto] = useState<string | null>(null);
  const [counts, setCounts] = useState<CashCounts>({});
  const [dropText, setDropText] = useState("");
  const [drop, setDrop] = useState<number | null>(null);
  const [note, setNote] = useState("");
  // Checklist Đóng ca chưa xong → hỏi lại một lần, không chặn cứng (§17.5).
  const [asked, setAsked] = useState(false);
  const needsPhoto = cafeCash + cafeTransfer + cafeOther > 0 && !photo;
  const confirmFirst = pendingClose.length > 0 && !asked;

  return (
    <>
      <section className={box} aria-labelledby="cur-shift">
        <h2 id="cur-shift" className={h2}>
          {t.shift.current(vnTimeLabel(new Date(shift.openedAt)), shift.openedBy)}
        </h2>
        <p className="mt-2 text-[15px] tabular-nums">
          {t.shift.opening}: <strong>{formatPrice(shift.opening)}</strong>
          {shift.drop ? ` · ${t.shift.midDrop.toLowerCase()} ${formatPrice(shift.drop)}` : ""}
        </p>
        {view.viewer.canSpend ? <MidDrop /> : null}
      </section>

      <section className={box} aria-labelledby="close-shift">
        <h2 id="close-shift" className={h2}>
          {t.shift.closeTitle}
        </h2>
        <h3 className="mt-4 mb-2 font-semibold">1 · {t.shift.sapoTitle}</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <PlainMoneyInput id="cafe-cash" label={t.shift.cafeCash} value={cafeCash} onChange={setCafeCash} />
          <PlainMoneyInput id="cafe-transfer" label={t.shift.cafeTransfer} value={cafeTransfer} onChange={setCafeTransfer} />
          <PlainMoneyInput id="cafe-other" label={t.shift.cafeOther} value={cafeOther} onChange={setCafeOther} />
        </div>
        <div className="mt-3">
          <PhotoInput id="sapo-photo" label={t.shift.sapoPhoto} value={photo} onChange={setPhoto} />
        </div>

        <h3 className="mt-6 mb-2 font-semibold">2 · {t.shift.countTitle}</h3>
        <CashCounter id="close" value={counts} onChange={setCounts} />

        <h3 className="mt-6 mb-1 font-semibold">3 · {t.shift.dropTitle}</h3>
        <p className="mb-2 text-sm text-secondary">{t.shift.dropHint}</p>
        <MoneyInput id="close-drop" label={opsCopy.expense.amount} text={dropText} onText={(s, v) => (setDropText(s), setDrop(v))} />

        <label htmlFor="close-note" className="mt-2 mb-1 block text-sm text-secondary">
          {t.shift.note}
        </label>
        <input id="close-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className="input" />

        {needsPhoto ? (
          <p className="mt-3 text-sm text-warn" role="status">
            {copy.admin.errors.photo_required}
          </p>
        ) : null}
        {asked && pendingClose.length > 0 ? (
          <p className="mt-3 rounded-2xl bg-elevated p-4 text-[15px] text-warn" role="alert">
            {t.work.closePending(pendingClose.join(", "))}
          </p>
        ) : null}
        <button
          type="button"
          disabled={pending || needsPhoto || (dropText.trim() !== "" && drop === null)}
          onClick={() =>
            confirmFirst
              ? setAsked(true)
              : run(
                  () => closeShift({ shiftId: shift.id, counts, cafeCash, cafeTransfer, cafeOther, sapoPhoto: photo, drop: drop ?? 0, note }),
                  t.shift.closed,
                  onResult,
                )
          }
          className={`${primaryBtn} mt-4`}
        >
          {asked && pendingClose.length > 0 ? t.work.closeAnyway : t.shift.close}
        </button>
      </section>
    </>
  );
}

function MidDrop() {
  const { pending, run } = useAdminAction();
  const [text, setText] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  return (
    <details className="mt-3">
      <summary className="min-h-11 cursor-pointer py-2 text-[15px] font-semibold text-secondary">{t.shift.midDrop}</summary>
      <MoneyInput id="mid-drop" label={opsCopy.expense.amount} text={text} onText={(s, v) => (setText(s), setAmount(v))} />
      <button
        type="button"
        disabled={pending || amount === null}
        onClick={() => run(() => dropCash({ amount: amount! }), copy.admin.saved, () => (setText(""), setAmount(null)))}
        className={secondaryBtn}
      >
        {t.shift.midDropBtn}
      </button>
    </details>
  );
}

function PettyBox({ view }: { view: OpsView }) {
  const { pending, run } = useAdminAction();
  const [counts, setCounts] = useState<CashCounts>({});
  const [result, setResult] = useState<Count | null>(null);
  return (
    <section className={box} aria-labelledby="petty">
      <h2 id="petty" className={h2}>
        {t.petty.title}
      </h2>
      <p className="mt-2 text-[15px] tabular-nums" data-testid="petty-state">
        {t.petty.state(formatPrice(view.petty.float), formatPrice(view.petty.unreplenished))}
      </p>
      {view.viewer.isOwner && view.petty.unreplenished > 0 ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => replenishPetty(), (r) => (r.amount ? t.petty.replenished(formatPrice(r.amount), r.count) : t.petty.nothing))}
          className={`${secondaryBtn} mt-3`}
        >
          {t.petty.replenish(formatPrice(view.petty.unreplenished))}
        </button>
      ) : null}
      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer py-2 text-[15px] font-semibold text-secondary">{t.petty.check}</summary>
        <CashCounter id="petty" value={counts} onChange={setCounts} />
        <button type="button" disabled={pending} onClick={() => run(() => checkPetty({ counts }), copy.admin.saved, setResult)} className={`${primaryBtn} mt-3`}>
          {t.petty.checkBtn}
        </button>
        {result ? <CountResult r={result} tolerance={view.settings.cashTolerance} /> : null}
      </details>
    </section>
  );
}

function RecentShifts({ view }: { view: OpsView }) {
  return (
    <section className={box} aria-labelledby="recent-shifts">
      <h2 id="recent-shifts" className={h2}>
        {t.shift.recent}
      </h2>
      <ul className="mt-2 divide-y divide-line">
        {view.recentShifts.map((s) => {
          const variance = s.counted !== null && s.expected !== null ? s.counted - s.expected : null;
          return (
            <li key={s.id} className="py-3 text-[15px] tabular-nums">
              <p className="font-semibold">
                {s.serviceDate.slice(8)}/{s.serviceDate.slice(5, 7)} · {vnTimeLabel(new Date(s.openedAt))}–{s.closedAt ? vnTimeLabel(new Date(s.closedAt)) : ""} · {s.closedBy}
              </p>
              <p className="text-secondary">
                {opsCopy.shift.countTitle}: {formatPrice(s.counted ?? 0)}
                {variance !== null ? ` · ${varianceText(variance, view.settings.cashTolerance)}` : ""}
                {s.drop ? ` · ${t.shift.left} ${formatPrice((s.counted ?? 0) - s.drop)}` : ""}
              </p>
              <p className="text-secondary">
                Café: {formatPrice(s.cafeCash ?? 0)} TM · {formatPrice(s.cafeTransfer ?? 0)} CK/MoMo
                {s.cafeOther ? ` · ${formatPrice(s.cafeOther)} khác` : ""}
                {s.sapoPhoto ? (
                  <>
                    {" · "}
                    <a href={`/api/ops/files/${s.sapoPhoto}`} target="_blank" rel="noreferrer" className="underline">
                      Sapo
                    </a>
                  </>
                ) : null}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function OpsSettingsForm({ view }: { view: OpsView }) {
  const { pending, run } = useAdminAction();
  const [tolerance, setTolerance] = useState(view.settings.cashTolerance);
  const [float, setFloat] = useState(view.settings.pettyFloat);
  return (
    <section className={box} aria-labelledby="ops-settings">
      <h2 id="ops-settings" className={h2}>
        {t.settings.title}
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <PlainMoneyInput id="set-tolerance" label={t.settings.tolerance} value={tolerance} onChange={setTolerance} />
        <PlainMoneyInput id="set-float" label={t.settings.pettyFloat} value={float} onChange={setFloat} />
      </div>
      <button
        type="button"
        disabled={pending || (tolerance === view.settings.cashTolerance && float === view.settings.pettyFloat)}
        onClick={() => run(() => saveOpsSettings({ cashTolerance: tolerance, pettyFloat: float }), copy.admin.saved)}
        className={`${secondaryBtn} mt-3`}
      >
        {t.settings.save}
      </button>
    </section>
  );
}
