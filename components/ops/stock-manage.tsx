"use client";

import { useState } from "react";
import { cancelBill, payDebt, receiveStock, saveStockItem } from "@/app/actions/stock";
import { useAdminAction } from "@/components/admin/use-admin";
import { MoneyInput } from "@/components/ops/money-input";
import { PhotoInput } from "@/components/ops/photo-input";
import { chip, label, parseQty } from "@/components/ops/stock-ui";
import { box, h2, primaryBtn, secondaryBtn } from "@/components/ops/styles";
import { opsCopy } from "@/data/copy-ops";
import { EXPENSE_SOURCES, type ExpenseSource } from "@/lib/domain/expense-command";
import { SEGMENTS, type Segment } from "@/lib/domain/metrics";
import { ROLES, type Role } from "@/lib/domain/roles";
import { COUNT_CLASSES, STOCK_LEVELS, type CountClass, type StockLevel } from "@/lib/domain/stock";
import { vnDateOf } from "@/lib/domain/time";
import { formatPrice } from "@/lib/format";
import { SEGMENT_LABEL } from "@/lib/metrics-text";
import { ROLE_LABEL, SOURCE_LABEL } from "@/lib/ops-text";
import type { StockRowView, StockView } from "@/lib/server/dal/stock";
import { billCode, billLineText, LEVEL_LABEL, qtyText } from "@/lib/stock-text";

const t = opsCopy.stock;
const COUNT_ROLES: Role[] = ROLES.filter((r) => r !== "owner" && r !== "manager" && r !== "shipper");

const dmy = (iso: string) => {
  const d = vnDateOf(new Date(iso));
  return `${d.slice(8)}/${d.slice(5, 7)}`;
};

/** Nhập kho trong app (owner/manager): số lượng theo đơn vị gốc hoặc đơn vị mua; trả bằng hộp chi/túi/CK hoặc ghi nợ NCC. */
export function ReceiveSection({ stock }: { stock: StockView }) {
  const { pending, run } = useAdminAction();
  const items = stock.items.filter((i) => i.trackStock);
  const [id, setId] = useState(items[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [usePurchase, setUsePurchase] = useState(true);
  const [amountText, setAmountText] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [pay, setPay] = useState<ExpenseSource | "debt">("petty");
  const [supplier, setSupplier] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  const n = parseQty(qty);
  const factor = usePurchase && item.purchaseUnit && item.purchaseFactor ? item.purchaseFactor : 1;
  const base = n && n > 0 ? Math.round(n * factor * 1000) / 1000 : null;
  const ok = base !== null && (pay === "debt" ? supplier.trim() !== "" : amount !== null);
  const reset = () => (setQty(""), setAmountText(""), setAmount(null), setPhoto(null));

  return (
    <section className={box} aria-labelledby="receive">
      <h2 id="receive" className={h2}>
        {t.receiveTitle}
      </h2>
      <p className="mt-1 text-sm text-secondary">{t.receiveHint}</p>
      <div className="mt-3 space-y-3">
        <div>
          <label htmlFor="rcv-item" className={label}>
            {t.item}
          </label>
          <select id="rcv-item" value={id} onChange={(e) => setId(e.target.value)} className="input">
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </div>
        {item.purchaseUnit && item.purchaseFactor ? (
          <div role="radiogroup" aria-label={t.unit} className="flex flex-wrap gap-2">
            <button type="button" role="radio" aria-checked={usePurchase} onClick={() => setUsePurchase(true)} className={chip(usePurchase)}>
              {t.unitPurchase(item.purchaseUnit, item.purchaseFactor.toLocaleString("vi-VN"), item.unit)}
            </button>
            <button type="button" role="radio" aria-checked={!usePurchase} onClick={() => setUsePurchase(false)} className={chip(!usePurchase)}>
              {t.unitBase(item.unit)}
            </button>
          </div>
        ) : null}
        <div>
          <label htmlFor="rcv-qty" className={label}>
            {t.qty} ({usePurchase && item.purchaseUnit ? item.purchaseUnit : item.unit})
          </label>
          <input id="rcv-qty" inputMode="decimal" autoComplete="off" value={qty} onChange={(e) => setQty(e.target.value)} className="input tabular-nums" aria-describedby="rcv-qty-base" />
          <p id="rcv-qty-base" className="mt-1 min-h-5 text-sm text-secondary tabular-nums" aria-live="polite">
            {base !== null && factor !== 1 ? `= ${qtyText(base, item.unit)}` : ""}
          </p>
        </div>
        <MoneyInput id="rcv-amount" label={pay === "debt" ? t.amountOptional : t.amount} text={amountText} onText={(s, v) => (setAmountText(s), setAmount(v))} />
        <div role="radiogroup" aria-label={t.pay} className="flex flex-wrap gap-2">
          {[...EXPENSE_SOURCES, "debt" as const].map((s) => (
            <button key={s} type="button" role="radio" aria-checked={pay === s} onClick={() => setPay(s)} className={chip(pay === s)}>
              {s === "debt" ? t.debt : SOURCE_LABEL[s]}
            </button>
          ))}
        </div>
        {pay === "debt" ? (
          <div>
            <label htmlFor="rcv-supplier" className={label}>
              {t.supplier}
            </label>
            <input id="rcv-supplier" list="rcv-suppliers" value={supplier} maxLength={60} placeholder={t.supplierHint} onChange={(e) => setSupplier(e.target.value)} className="input" />
            <datalist id="rcv-suppliers">
              {stock.suppliers.map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
          </div>
        ) : null}
        <PhotoInput id="rcv-photo" label={opsCopy.expense.photo} value={photo} onChange={setPhoto} />
        <button
          type="button"
          disabled={pending || !ok}
          onClick={() =>
            run(
              () =>
                receiveStock({
                  ingredientId: id,
                  qty: base!,
                  amount,
                  pay: pay === "debt" ? { kind: "debt", supplier: supplier.trim() } : { kind: "expense", source: pay },
                  photo,
                }),
              t.received(`${qtyText(base!, item.unit)} ${item.label}`),
              reset,
            )
          }
          className={primaryBtn}
        >
          {t.receive}
        </button>
      </div>
    </section>
  );
}

export function DebtSection({ stock }: { stock: StockView }) {
  return (
    <section className={box} aria-labelledby="debts">
      <h2 id="debts" className={h2}>
        {t.debtsTitle}
      </h2>
      {stock.suppliers.length === 0 ? (
        <p className="mt-2 text-secondary">{t.noDebts}</p>
      ) : (
        <ul className="mt-2 space-y-4">
          {stock.suppliers.map((s) => (
            <SupplierDebt key={`${s.id}-${s.debt}-${s.bills.length}`} s={s} />
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm text-secondary">/no Cô Nhiều 3 thùng sting, 2 thùng pepsi 480k · /trano Cô Nhiều 480k #ck · /congno</p>
    </section>
  );
}

function SupplierDebt({ s }: { s: StockView["suppliers"][number] }) {
  const { pending, run } = useAdminAction();
  const [amountText, setAmountText] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [source, setSource] = useState<ExpenseSource>("petty");
  const id = `debt-${s.id}`;
  return (
    <li className="rounded-2xl bg-elevated p-4" aria-labelledby={id}>
      <h3 id={id} className="flex items-baseline gap-2">
        <span className="mr-auto text-[17px] font-semibold">{s.name}</span>
        <span className="font-semibold tabular-nums" data-testid={`debt-${s.name}`}>
          {t.debtLine(formatPrice(s.debt), s.bills.length, s.unknown)}
        </span>
      </h3>
      <ul className="mt-2 divide-y divide-line text-[15px]">
        {s.bills.map((b) => (
          <li key={b.id} className="flex items-start gap-2 py-2">
            <span className="min-w-0 flex-1">
              <strong>{billCode(b.id)}</strong> · {dmy(b.receivedAt)} · {b.amount !== null ? formatPrice(b.amount) : t.noPrice}
              {b.paidAmount > 0 ? ` · ${t.paidPart(formatPrice(b.paidAmount))}` : ""}
              <span className="block text-sm text-secondary">{b.items.map(billLineText).join(" · ")}</span>
            </span>
            {b.paidAmount === 0 ? (
              <button type="button" disabled={pending} onClick={() => run(() => cancelBill({ id: b.id }), t.billCancelled)} className="min-h-11 shrink-0 rounded-full px-3 text-sm text-secondary underline">
                {t.cancelBill}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-2 space-y-2">
        <MoneyInput id={`${id}-amount`} label={t.payAmount} text={amountText} onText={(v, a) => (setAmountText(v), setAmount(a))} />
        <div role="radiogroup" aria-label={t.pay} className="flex flex-wrap gap-2">
          {EXPENSE_SOURCES.map((x) => (
            <button key={x} type="button" role="radio" aria-checked={source === x} onClick={() => setSource(x)} className={chip(source === x)}>
              {SOURCE_LABEL[x]}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={pending || amount === null}
          onClick={() => run(() => payDebt({ supplier: s.name, amount: amount!, source }), (r) => t.paid(r.closed, formatPrice(r.remaining)), () => (setAmountText(""), setAmount(null)))}
          className={`${secondaryBtn} w-full`}
        >
          {t.payBtn}
        </button>
      </div>
    </li>
  );
}

export function MarginSection({ stock }: { stock: StockView }) {
  return (
    <>
      <section className={box} aria-labelledby="margins">
        <h2 id="margins" className={h2}>
          {t.marginTitle}
        </h2>
        <p className="mt-1 text-sm text-secondary">{t.marginHint}</p>
        <ul className="mt-3 divide-y divide-line">
          {stock.margins.map((m) => (
            <li key={m.productId} className="py-2.5">
              <p className="text-[17px] font-medium">{m.name}</p>
              {m.cost > 0 ? (
                <p className="text-sm text-secondary tabular-nums" data-testid={`margin-${m.productId}`}>
                  {t.cols.price} {formatPrice(m.price)} · {t.cols.cost} {formatPrice(m.cost)} ·{" "}
                  <strong className={m.gross < 0 ? "text-danger" : "text-text"}>
                    {t.cols.gross} {formatPrice(m.gross)} ({String(m.pct).replace(".", ",")}%)
                  </strong>
                </p>
              ) : (
                <p className="text-sm text-secondary">{t.noCost}</p>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className={box} aria-labelledby="stock-items">
        <h2 id="stock-items" className={h2}>
          {t.settingsTitle}
        </h2>
        <p className="mt-1 text-sm text-secondary">{t.settingsHint}</p>
        <div className="mt-3 space-y-2">
          {stock.items.map((i) => (
            <ItemEditor key={`${i.id}-${i.aliases.join()}-${i.parLevel}-${i.trackStock}-${i.countClass}`} item={i} />
          ))}
        </div>
      </section>
    </>
  );
}

function ItemEditor({ item }: { item: StockRowView }) {
  const { pending, run } = useAdminAction();
  const [track, setTrack] = useState(item.trackStock);
  const [level, setLevel] = useState<StockLevel>(item.level);
  const [cls, setCls] = useState<CountClass>(item.countClass);
  const [roles, setRoles] = useState<Role[]>(item.countRoles);
  const [par, setPar] = useState(item.parLevel?.toString().replace(".", ",") ?? "");
  const [shelf, setShelf] = useState(item.shelfLifeHours?.toString() ?? "");
  const [pUnit, setPUnit] = useState(item.purchaseUnit ?? "");
  const [pFactor, setPFactor] = useState(item.purchaseFactor?.toString().replace(".", ",") ?? "");
  const [aliases, setAliases] = useState(item.aliases.join(", "));
  const [tol, setTol] = useState(String(item.countTolerancePct));
  const [segment, setSegment] = useState<Segment>(item.segment);
  const id = `item-${item.id}`;
  const factor = parseQty(pFactor);
  const valid = (pUnit.trim() === "") === (pFactor.trim() === "") && (pFactor.trim() === "" || (factor !== null && factor > 0)) && roles.length > 0;
  const field = (fid: string, text: string, value: string, set: (v: string) => void, mode: "text" | "decimal" | "numeric" = "decimal") => (
    <div className="min-w-0">
      <label htmlFor={`${id}-${fid}`} className={label}>
        {text}
      </label>
      <input id={`${id}-${fid}`} inputMode={mode} autoComplete="off" value={value} onChange={(e) => set(e.target.value)} className="input min-w-0 tabular-nums" />
    </div>
  );
  return (
    <details className="rounded-2xl bg-elevated">
      <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 text-[15px] font-semibold">
        <span className="mr-auto">{item.label}</span>
        <span className="text-sm font-normal text-secondary">
          {item.trackStock ? `${cls} · ${LEVEL_LABEL[item.level]}` : t.untracked}
        </span>
      </summary>
      <div className="space-y-3 px-4 pb-4">
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} className="size-6 accent-[var(--live)]" />
          {t.track}
        </label>
        <div role="radiogroup" aria-label={t.level} className="flex flex-wrap gap-2">
          {STOCK_LEVELS.map((l) => (
            <button key={l} type="button" role="radio" aria-checked={level === l} onClick={() => setLevel(l)} className={chip(level === l)}>
              {LEVEL_LABEL[l]}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label={t.segment} className="flex flex-wrap gap-2">
          {SEGMENTS.map((g) => (
            <button key={g} type="button" role="radio" aria-checked={segment === g} onClick={() => setSegment(g)} className={chip(segment === g)}>
              {SEGMENT_LABEL[g]}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label={t.countClass} className="flex flex-wrap gap-2">
          {COUNT_CLASSES.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={cls === c} onClick={() => setCls(c)} className={chip(cls === c)}>
              {c}
            </button>
          ))}
        </div>
        <fieldset>
          <legend className={label}>{t.countRoles}</legend>
          <div className="flex flex-wrap gap-2">
            {COUNT_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={roles.includes(r)}
                onClick={() => setRoles((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]))}
                className={chip(roles.includes(r))}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          {field("par", `${t.parLevel} (${item.unit})`, par, setPar)}
          {field("shelf", t.shelfLife, shelf, setShelf, "numeric")}
          {field("punit", t.purchaseUnit, pUnit, setPUnit, "text")}
          {field("pfactor", t.purchaseFactor(item.unit), pFactor, setPFactor)}
          {field("tol", t.tolerance, tol, setTol, "numeric")}
        </div>
        {field("aliases", t.aliases, aliases, setAliases, "text")}
        <button
          type="button"
          disabled={pending || !valid}
          onClick={() =>
            run(
              () =>
                saveStockItem({
                  id: item.id,
                  level,
                  trackStock: track,
                  purchaseUnit: pUnit.trim() || null,
                  purchaseFactor: pFactor.trim() ? factor : null,
                  shelfLifeHours: shelf.trim() ? Math.max(1, Math.round(Number(shelf))) : null,
                  parLevel: par.trim() ? parseQty(par) : null,
                  aliases: aliases
                    .split(",")
                    .map((a) => a.trim())
                    .filter(Boolean)
                    .slice(0, 12),
                  countClass: cls,
                  countRoles: roles,
                  countTolerancePct: Math.min(100, Math.max(0, Math.round(Number(tol) || 0))),
                  segment,
                }),
              t.savedItem,
            )
          }
          className={`${secondaryBtn} w-full`}
        >
          {t.saveItem}
        </button>
      </div>
    </details>
  );
}
