"use client";

import { useState } from "react";
import { cancelExpense, recordExpense, reimbursePocket, reviewPocket, setExpenseCategory } from "@/app/actions/ops";
import { useAdminAction } from "@/components/admin/use-admin";
import { MoneyInput } from "@/components/ops/money-input";
import { PhotoInput } from "@/components/ops/photo-input";
import { box, h2, primaryBtn, secondaryBtn } from "@/components/ops/styles";
import { copy } from "@/data/copy";
import { opsCopy } from "@/data/copy-ops";
import { EXPENSE_CATEGORIES, EXPENSE_SOURCES, expenseCode, guessCategory, type ExpenseCategory, type ExpenseSource } from "@/lib/domain/expense-command";
import { vnDateOf, vnTimeLabel } from "@/lib/domain/time";
import { formatPrice } from "@/lib/format";
import { BOT_HELP, CATEGORY_LABEL, SOURCE_LABEL } from "@/lib/ops-text";
import type { ExpenseView, OpsView } from "@/lib/server/dal/ops";

const t = opsCopy.expense;
const chip = (on: boolean) => `min-h-12 rounded-full px-4 text-[15px] font-semibold ${on ? "bg-invert text-on-invert" : "bg-elevated text-secondary"}`;

export function ExpensePanel({ view }: { view: OpsView }) {
  const pending = view.expenses.filter((e) => !e.cancelled && (e.status === "pending" || e.status === "approved"));
  return (
    <div className="space-y-5">
      <NewExpense />
      <MonthSummary view={view} />
      {pending.length > 0 ? (
        <section className={box} aria-labelledby="pocket">
          <h2 id="pocket" className={h2}>
            {t.pending}
          </h2>
          <ul className="mt-2 divide-y divide-line">
            {pending.map((e) => (
              <PocketRow key={`${e.id}-${e.status}`} e={e} />
            ))}
          </ul>
        </section>
      ) : null}
      <section className={box} aria-labelledby="expenses">
        <h2 id="expenses" className={h2}>
          {t.recent}
        </h2>
        {view.expenses.length === 0 ? (
          <p className="mt-2 text-secondary">{t.empty}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {view.expenses.map((e) => (
              <ExpenseRow key={`${e.id}-${e.category}-${e.cancelled}`} e={e} />
            ))}
          </ul>
        )}
      </section>
      <section className={box} aria-labelledby="tg-help">
        <h2 id="tg-help" className={h2}>
          {t.telegramTitle}
        </h2>
        <p className="mt-2 text-[15px] whitespace-pre-line text-secondary">{BOT_HELP}</p>
      </section>
    </div>
  );
}

function NewExpense() {
  const { pending, run } = useAdminAction();
  const [amountText, setAmountText] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [source, setSource] = useState<ExpenseSource>("petty");
  const [photo, setPhoto] = useState<string | null>(null);
  const shown = category ?? guessCategory(description);
  const reset = () => {
    setAmountText("");
    setAmount(null);
    setDescription("");
    setCategory(null);
    setPhoto(null);
  };

  return (
    <section className={box} aria-labelledby="new-expense">
      <h2 id="new-expense" className={h2}>
        {t.newTitle}
      </h2>
      <div className="mt-3 space-y-3">
        <MoneyInput id="exp-amount" label={t.amount} text={amountText} onText={(s, v) => (setAmountText(s), setAmount(v))} />
        <div>
          <label htmlFor="exp-desc" className="mb-1 block text-sm text-secondary">
            {t.description}
          </label>
          <input id="exp-desc" value={description} maxLength={200} placeholder={t.descriptionHint} onChange={(e) => setDescription(e.target.value)} className="input" />
        </div>
        <div>
          <label htmlFor="exp-cat" className="mb-1 block text-sm text-secondary">
            {t.category}
          </label>
          <select id="exp-cat" value={shown} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className="input appearance-none bg-[length:12px] bg-[right_1rem_center] bg-no-repeat">
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div role="radiogroup" aria-label={t.source} className="flex flex-wrap gap-2">
          {EXPENSE_SOURCES.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={source === s} onClick={() => setSource(s)} className={chip(source === s)}>
              {SOURCE_LABEL[s]}
            </button>
          ))}
        </div>
        <PhotoInput id="exp-photo" label={t.photo} value={photo} onChange={setPhoto} />
        <button
          type="button"
          disabled={pending || amount === null || !description.trim()}
          onClick={() =>
            run(
              () => recordExpense({ amount: amount!, description, category: shown, source, photo }),
              (r) => t.saved(expenseCode(r.id)),
              reset,
            )
          }
          className={primaryBtn}
        >
          {t.save}
        </button>
      </div>
    </section>
  );
}

function MonthSummary({ view }: { view: OpsView }) {
  const m = view.month;
  return (
    <section className={box} aria-labelledby="month">
      <h2 id="month" className={h2}>
        {t.month} · {m.label}
      </h2>
      <p className="mt-2 text-3xl font-bold tabular-nums" data-testid="month-total">
        {formatPrice(m.total)}
      </p>
      <ul className="mt-2 space-y-1 text-[15px] tabular-nums">
        {[...m.byCategory]
          .sort((a, b) => b.amount - a.amount)
          .map((c) => (
            <li key={c.category} className="flex justify-between">
              <span className="text-secondary">{CATEGORY_LABEL[c.category]}</span>
              <span>{formatPrice(c.amount)}</span>
            </li>
          ))}
      </ul>
      {m.bySource.length ? (
        <p className="mt-2 text-sm text-secondary">{m.bySource.map((s) => `${SOURCE_LABEL[s.source]} ${formatPrice(s.amount)}`).join(" · ")}</p>
      ) : null}
    </section>
  );
}

const when = (iso: string) => {
  const d = vnDateOf(new Date(iso));
  return `${d.slice(8)}/${d.slice(5, 7)} ${vnTimeLabel(new Date(iso))}`;
};

function Meta({ e }: { e: ExpenseView }) {
  return (
    <p className="text-sm text-secondary">
      {expenseCode(e.id)} · {when(e.spentAt)} · {e.by} · {SOURCE_LABEL[e.source]}
      {t.status[e.status] ? ` · ${t.status[e.status]}` : ""}
      {e.replenished ? ` · ${t.replenishedTag}` : ""}
      {e.photo ? (
        <>
          {" · "}
          <a href={`/api/ops/files/${e.photo}`} target="_blank" rel="noreferrer" className="underline">
            {t.viewPhoto}
          </a>
        </>
      ) : null}
    </p>
  );
}

function PocketRow({ e }: { e: ExpenseView }) {
  const { pending, run } = useAdminAction();
  return (
    <li className="py-3">
      <p className="flex justify-between gap-3 text-[15px]">
        <span>{e.description}</span>
        <strong className="tabular-nums">{formatPrice(e.amount)}</strong>
      </p>
      <Meta e={e} />
      {e.canReview ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {e.status === "pending" ? (
            <>
              <button type="button" disabled={pending} onClick={() => run(() => reviewPocket({ id: e.id, decision: "approve" }), copy.admin.saved)} className={secondaryBtn}>
                {t.approve}
              </button>
              <button type="button" disabled={pending} onClick={() => run(() => reviewPocket({ id: e.id, decision: "reject" }), copy.admin.saved)} className={`${secondaryBtn} text-danger`}>
                {t.reject}
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={pending} onClick={() => run(() => reimbursePocket({ id: e.id, from: "petty" }), copy.admin.saved)} className={secondaryBtn}>
                {t.reimbursePetty}
              </button>
              <button type="button" disabled={pending} onClick={() => run(() => reimbursePocket({ id: e.id, from: "bank" }), copy.admin.saved)} className={secondaryBtn}>
                {t.reimburseBank}
              </button>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

function ExpenseRow({ e }: { e: ExpenseView }) {
  const { pending, run } = useAdminAction();
  return (
    <li className={`py-3 ${e.cancelled ? "opacity-50" : ""}`}>
      <p className="flex justify-between gap-3 text-[15px]">
        <span className={e.cancelled ? "line-through" : ""}>{e.description}</span>
        <strong className="tabular-nums">{formatPrice(e.amount)}</strong>
      </p>
      <Meta e={e} />
      {e.cancelled ? (
        <p className="text-sm text-secondary">{t.cancelled}</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`cat-${e.id}`}>
            {t.category} {expenseCode(e.id)}
          </label>
          <select
            id={`cat-${e.id}`}
            value={e.category}
            disabled={pending}
            onChange={(ev) => run(() => setExpenseCategory({ id: e.id, category: ev.target.value as ExpenseCategory }), copy.admin.saved)}
            className="input min-h-11 !w-auto appearance-none bg-[length:12px] bg-[right_0.75rem_center] bg-no-repeat !pr-9 text-[15px]"
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          {e.canCancel ? (
            <button type="button" disabled={pending} onClick={() => run(() => cancelExpense({ id: e.id }), t.cancelled)} className="min-h-11 rounded-full px-3 text-sm text-danger">
              {t.cancel} <span className="sr-only">{expenseCode(e.id)}</span>
            </button>
          ) : null}
        </div>
      )}
    </li>
  );
}
