"use client";

import { useState } from "react";
import { countStock, produceStock, wasteStock } from "@/app/actions/stock";
import { useAdminAction } from "@/components/admin/use-admin";
import { CafePanel } from "@/components/ops/cafe-panel";
import { DebtSection, MarginSection, ReceiveSection } from "@/components/ops/stock-manage";
import { chip, label, parseQty } from "@/components/ops/stock-ui";
import { box, h2, primaryBtn } from "@/components/ops/styles";
import { opsCopy } from "@/data/copy-ops";
import { WASTE_REASONS, type WasteReason } from "@/lib/domain/stock";
import { vnDateOf, vnTimeLabel } from "@/lib/domain/time";
import { formatPrice } from "@/lib/format";
import { signed } from "@/lib/ops-text";
import type { CafeView } from "@/lib/server/dal/cafe";
import type { CountResultLine, StockView } from "@/lib/server/dal/stock";
import { FLAG_LABEL, LEVEL_LABEL, MOVE_LABEL, pctText, qtyText, REASON_LABEL } from "@/lib/stock-text";

const t = opsCopy.stock;
type Section = keyof typeof t.sections;

const dm = (iso: string) => {
  const d = vnDateOf(new Date(iso));
  return `${d.slice(8)}/${d.slice(5, 7)}`;
};

// Tab "Kho" (§17.8): tồn · làm & huỷ · nhập · công nợ · kiểm kê · biên lãi. Quyền theo DTO (canManage = owner/manager).
export function StockPanel({ stock, cafe }: { stock: StockView; cafe: CafeView | null }) {
  const sections: Section[] = stock.canManage ? ["ton", "nhap", "no", "lam", "kiem", "cafe", "lai"] : cafe ? ["ton", "lam", "kiem", "cafe"] : ["ton", "lam", "kiem"];
  const [section, setSection] = useState<Section>("ton");
  return (
    <div className="space-y-5">
      <div role="tablist" aria-label={t.sectionsLabel} className="flex flex-wrap gap-2">
        {sections.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={section === s} onClick={() => setSection(s)} className={chip(section === s)}>
            {t.sections[s]}
          </button>
        ))}
      </div>
      {section === "ton" ? (
        <OnHand stock={stock} />
      ) : section === "lam" ? (
        <>
          <Produce stock={stock} />
          <Waste stock={stock} />
        </>
      ) : section === "nhap" ? (
        <ReceiveSection stock={stock} />
      ) : section === "no" ? (
        <DebtSection stock={stock} />
      ) : section === "kiem" ? (
        <CountForm
          kind="weekly"
          title={t.countTitle}
          hint={t.countHint}
          items={stock.items.filter((i) => i.trackStock).map((i) => ({ id: i.id, label: i.label, unit: i.unit }))}
        />
      ) : section === "cafe" && cafe ? (
        <CafePanel cafe={cafe} />
      ) : (
        <MarginSection stock={stock} />
      )}
    </div>
  );
}

export function StockAlerts({ stock }: { stock: StockView }) {
  if (stock.alerts.length === 0) return null;
  return (
    <section className={`${box} border border-warn/40`} aria-labelledby="stock-alerts">
      <h2 id="stock-alerts" className={`${h2} !text-warn`}>
        {t.alerts}
      </h2>
      <p className="mt-1 text-sm text-secondary">{t.alertsHint}</p>
      <ul className="mt-2 space-y-1.5">
        {stock.alerts.map((a) => (
          <li key={a.label} className="text-[15px]">
            ⚠ <strong>{a.label}</strong>: {qtyText(a.onHand, a.unit)} — {a.flags.map((f) => FLAG_LABEL[f]).join(", ")}
          </li>
        ))}
      </ul>
    </section>
  );
}

function OnHand({ stock }: { stock: StockView }) {
  const tracked = stock.items.filter((i) => i.trackStock);
  const levels = (["raw", "prep", "goods"] as const).filter((l) => tracked.some((i) => i.level === l));
  const total = tracked.reduce((s, i) => s + (i.value ?? 0), 0);
  return (
    <>
      <StockAlerts stock={stock} />
      <section className={box} aria-labelledby="on-hand">
        <h2 id="on-hand" className={h2}>
          {t.onHandTitle}
        </h2>
        {stock.canManage ? <p className="mt-1 text-sm text-secondary tabular-nums">{t.totalValue(formatPrice(Math.max(0, total)))}</p> : null}
        {levels.map((l) => (
          <div key={l} className="mt-4">
            <h3 className="text-[15px] font-semibold">{LEVEL_LABEL[l]}</h3>
            <ul className="mt-1 divide-y divide-line">
              {tracked
                .filter((i) => i.level === l)
                .map((i) => (
                  <li key={i.id} className="flex items-start gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[17px] font-medium">{i.label}</p>
                      <p className="text-sm text-secondary">
                        {[
                          i.storage,
                          i.parLevel !== null ? t.par(qtyText(i.parLevel, i.unit)) : null,
                          i.nextExpiry ? t.expires(`${vnTimeLabel(new Date(i.nextExpiry))} ${dm(i.nextExpiry)}`) : null,
                          i.avgCost !== undefined && i.avgCost > 0 ? t.avgCost(formatPrice(Math.round(i.avgCost * 100) / 100), i.unit) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {i.flags.length ? <p className="text-sm font-semibold text-warn">{i.flags.map((f) => FLAG_LABEL[f]).join(" · ")}</p> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-lg font-semibold tabular-nums ${i.flags.length ? "text-warn" : ""}`} data-testid={`onhand-${i.id}`}>
                        {qtyText(i.onHand, i.unit)}
                      </p>
                      {i.value !== undefined && i.value > 0 ? <p className="text-sm text-secondary tabular-nums">{t.value(formatPrice(i.value))}</p> : null}
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </section>
      {stock.month ? (
        <section className={box} aria-labelledby="stock-month">
          <h2 id="stock-month" className={h2}>
            {t.monthTitle(stock.month.label)}
          </h2>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
            {(
              [
                [t.monthPurchases, formatPrice(stock.month.purchases)],
                [t.monthWaste, formatPrice(-stock.month.waste)],
                [t.monthAdjust, signed(stock.month.adjust)],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-elevated px-2 py-3">
                <dt className="text-sm text-secondary">{k}</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      <section className={box} aria-labelledby="stock-recent">
        <h2 id="stock-recent" className={h2}>
          {t.recent}
        </h2>
        {stock.recent.length === 0 ? (
          <p className="mt-2 text-secondary">{t.noMoves}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {stock.recent.map((m, i) => (
              <li key={i} className="flex items-baseline gap-3 py-2 text-[15px]">
                <span className="min-w-0 flex-1">
                  {MOVE_LABEL[m.kind]}
                  {m.reason ? ` (${REASON_LABEL[m.reason]})` : ""} · {m.label}
                  <span className="block text-sm text-secondary">
                    {vnTimeLabel(new Date(m.at))} {dm(m.at)}
                    {m.by ? ` · ${m.by}` : ""}
                  </span>
                </span>
                <span className={`shrink-0 font-semibold tabular-nums ${m.qty < 0 ? "text-secondary" : "text-live"}`}>
                  {m.qty > 0 ? "+" : "−"}
                  {qtyText(Math.abs(m.qty), m.unit)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Produce({ stock }: { stock: StockView }) {
  const { pending, run } = useAdminAction();
  const [outputId, setOutputId] = useState(stock.formulas[0]?.outputId ?? "");
  const [runs, setRuns] = useState(1);
  const f = stock.formulas.find((x) => x.outputId === outputId);
  if (!f) return null;
  return (
    <section className={box} aria-labelledby="produce">
      <h2 id="produce" className={h2}>
        {t.produceTitle}
      </h2>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t.item}>
          {stock.formulas.map((x) => (
            <button key={x.outputId} type="button" role="radio" aria-checked={x.outputId === outputId} onClick={() => setOutputId(x.outputId)} className={chip(x.outputId === outputId)}>
              {x.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-secondary">{t.produceHint(f.lines.map((l) => `${qtyText(l.qty, l.unit)} ${l.label}`).join(" + ") + ` → ${qtyText(f.outputQty, f.unit)}`)}</p>
        <div className="flex items-center gap-3">
          <span className="text-[15px]">{t.runs}</span>
          <button type="button" aria-label="−" onClick={() => setRuns((n) => Math.max(1, n - 1))} className="size-12 rounded-full bg-elevated text-xl font-semibold">
            −
          </button>
          <output className="w-8 text-center text-xl font-semibold tabular-nums" aria-live="polite">
            {runs}
          </output>
          <button type="button" aria-label="+" onClick={() => setRuns((n) => Math.min(50, n + 1))} className="size-12 rounded-full bg-elevated text-xl font-semibold">
            +
          </button>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => produceStock({ outputId, runs }), (r) => t.produced(qtyText(r.qty, f.unit) + ` ${f.label}`), () => setRuns(1))}
          className={primaryBtn}
        >
          {t.produce(runs, `${qtyText(f.outputQty * runs, f.unit)} ${f.label}`)}
        </button>
      </div>
    </section>
  );
}

function Waste({ stock }: { stock: StockView }) {
  const { pending, run } = useAdminAction();
  const items = stock.items.filter((i) => i.trackStock);
  const [id, setId] = useState(items[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<WasteReason>("expired");
  const [note, setNote] = useState("");
  const item = items.find((i) => i.id === id);
  const n = parseQty(qty);
  if (!item) return null;
  return (
    <section className={box} aria-labelledby="waste">
      <h2 id="waste" className={h2}>
        {t.wasteTitle}
      </h2>
      <div className="mt-3 space-y-3">
        <div>
          <label htmlFor="waste-item" className={label}>
            {t.item}
          </label>
          <select id="waste-item" value={id} onChange={(e) => setId(e.target.value)} className="input">
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="waste-qty" className={label}>
            {t.qty} ({item.unit})
          </label>
          <input id="waste-qty" inputMode="decimal" autoComplete="off" value={qty} onChange={(e) => setQty(e.target.value)} className="input tabular-nums" />
        </div>
        <div role="radiogroup" aria-label={t.reason} className="flex flex-wrap gap-2">
          {WASTE_REASONS.map((r) => (
            <button key={r} type="button" role="radio" aria-checked={reason === r} onClick={() => setReason(r)} className={chip(reason === r)}>
              {REASON_LABEL[r]}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="waste-note" className={label}>
            {reason === "other" ? t.noteRequired : t.note}
          </label>
          <input id="waste-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className="input" />
        </div>
        <button
          type="button"
          disabled={pending || !n || n <= 0 || (reason === "other" && !note.trim())}
          onClick={() =>
            run(
              () => wasteStock({ ingredientId: id, qty: n!, reason, note: note.trim() || undefined }),
              t.wasted,
              () => (setQty(""), setNote("")),
            )
          }
          className={primaryBtn}
        >
          {t.waste}
        </button>
      </div>
    </section>
  );
}

/** Đếm mù: chỉ ô nhập số đếm; sổ sách & lệch hiện sau khi lưu. Dùng cho kiểm kê tuần và kiểm nhanh cuối ca. */
export function CountForm({ kind, title, hint, items, note }: { kind: "weekly" | "quick"; title: string; hint: string; items: { id: string; label: string; unit: string }[]; note?: string }) {
  const { pending, run } = useAdminAction();
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ lines: CountResultLine[]; value?: number } | null>(null);
  const id = `count-${kind}`;
  const parsed = items.map((i) => ({ ingredientId: i.id, counted: parseQty(values[i.id] ?? "") }));
  const ready = items.length > 0 && parsed.every((p) => p.counted !== null && p.counted >= 0);
  return (
    <section className={box} aria-labelledby={id}>
      <h2 id={id} className={h2}>
        {title}
      </h2>
      <p className="mt-1 text-sm text-secondary">{hint}</p>
      {note ? <p className="mt-1 text-sm text-live">{note}</p> : null}
      {items.length === 0 ? (
        <p className="mt-3 text-secondary">{t.quickNone}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((i) => (
            <div key={i.id} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3">
              <label htmlFor={`${id}-${i.id}`} className="min-w-0 text-[17px]">
                {i.label} <span className="text-sm text-secondary">({i.unit})</span>
              </label>
              <input
                id={`${id}-${i.id}`}
                inputMode="decimal"
                autoComplete="off"
                value={values[i.id] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [i.id]: e.target.value }))}
                className="input min-w-0 text-right tabular-nums"
              />
            </div>
          ))}
          <button
            type="button"
            disabled={pending || !ready}
            onClick={() =>
              run(
                () => countStock({ kind, lines: parsed.map((p) => ({ ingredientId: p.ingredientId, counted: p.counted! })) }),
                t.countSaved,
                (r) => (setResult({ lines: r.lines, value: r.value }), setValues({})),
              )
            }
            className={`${primaryBtn} mt-2`}
          >
            {t.saveCount}
          </button>
        </div>
      )}
      {result ? (
        <div className="mt-4 rounded-2xl bg-elevated p-4" aria-live="polite" data-testid={`${id}-result`}>
          <h3 className="text-[15px] font-semibold">{t.resultTitle}</h3>
          <ul className="mt-1 space-y-1 text-[15px]">
            {result.lines.map((l) => (
              <li key={l.ingredientId} className={l.over ? "text-warn" : ""}>
                {l.over ? "⚠ " : ""}
                <strong>{l.label}</strong>:{" "}
                {t.resultLine(
                  qtyText(l.book, l.unit),
                  qtyText(l.counted, l.unit),
                  l.diff === 0 ? t.matched : `${l.diff > 0 ? "+" : "−"}${qtyText(Math.abs(l.diff), l.unit)}${l.pct !== null ? ` (${pctText(l.pct)})` : ""}`,
                )}
              </li>
            ))}
          </ul>
          {result.value !== undefined ? <p className="mt-2 text-sm font-semibold tabular-nums">{t.shrink(signed(result.value))}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

/** Kiểm nhanh cuối ca ở tab Việc (§17.8). */
export function QuickCount({ stock }: { stock: StockView }) {
  return (
    <CountForm
      kind="quick"
      title={t.quickTitle}
      hint={t.quickHint}
      items={stock.quick.items}
      note={stock.quick.lastAt ? t.quickDone(vnTimeLabel(new Date(stock.quick.lastAt))) : undefined}
    />
  );
}
