"use client";

import { useState, useTransition } from "react";
import { importCafeSales, previewCafeSales, saveCafeItem, type PreviewResult } from "@/app/actions/cafe";
import { useAdminAction } from "@/components/admin/use-admin";
import { PlainMoneyInput } from "@/components/ops/money-input";
import { label, parseQty } from "@/components/ops/stock-ui";
import { box, h2, primaryBtn, secondaryBtn } from "@/components/ops/styles";
import { copy } from "@/data/copy";
import { opsCopy } from "@/data/copy-ops";
import { addDays, type ISODate } from "@/lib/domain/time";
import { showToast } from "@/lib/client/toast-store";
import { formatPrice } from "@/lib/format";
import { dayText, pctOrDash } from "@/lib/metrics-text";
import type { CafeItemView, CafeView } from "@/lib/server/dal/cafe";
import { qtyText } from "@/lib/stock-text";

const t = opsCopy.cafe;

// Mục "Café" của tab Kho (§17.10, M11): nhập số bán từ Sapo → trừ kho; món & định lượng (owner/manager).
export function CafePanel({ cafe }: { cafe: CafeView }) {
  return (
    <>
      {cafe.canImport ? <SapoImport cafe={cafe} /> : null}
      {cafe.canManage ? <CafeMenu cafe={cafe} /> : null}
    </>
  );
}

type Preview = Extract<PreviewResult, { ok: true }>;

function SapoImport({ cafe }: { cafe: CafeView }) {
  const today = cafe.today;
  const [date, setDate] = useState<ISODate>(addDays(today, -1));
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [parsing, startParse] = useTransition();
  const { pending, run } = useAdminAction();

  function doPreview() {
    const form = new FormData();
    form.set("date", date);
    if (file) form.set("file", file);
    else form.set("text", text);
    startParse(async () => {
      const res = await previewCafeSales(form);
      if (res.ok) {
        setPreview(res);
        return;
      }
      setPreview(null);
      const r = res.reason;
      showToast(r === "no_header" ? t.noHeader : r === "empty" ? t.empty : r === "bad_file" ? t.badFile : copy.admin.errors[r]);
    });
  }

  const matched = preview?.lines.filter((l) => l.itemId !== null) ?? [];
  const unmatched = preview?.lines.filter((l) => l.itemId === null) ?? [];
  return (
    <section className={box} aria-labelledby="cafe-import">
      <h2 id="cafe-import" className={h2}>
        {t.importTitle}
      </h2>
      <p className="mt-1 text-sm text-secondary">{t.importHint}</p>
      <div className="mt-3 space-y-3">
        <div>
          <label htmlFor="cafe-date" className={label}>
            {t.date}
          </label>
          <input
            id="cafe-date"
            type="date"
            max={today}
            value={date}
            onChange={(e) => {
              setDate(e.target.value as ISODate);
              setPreview(null);
            }}
            className="input !w-auto"
          />
        </div>
        <div>
          <label htmlFor="cafe-file" className={label}>
            {t.file}
          </label>
          <input
            id="cafe-file"
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
            }}
            className="block w-full text-[15px] file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-elevated file:px-4 file:font-semibold file:text-text"
          />
        </div>
        {!file ? (
          <div>
            <label htmlFor="cafe-paste" className={label}>
              {t.paste}
            </label>
            <textarea
              id="cafe-paste"
              rows={4}
              value={text}
              placeholder={t.pasteHint}
              onChange={(e) => {
                setText(e.target.value);
                setPreview(null);
              }}
              className="input min-h-24 font-mono text-sm"
            />
          </div>
        ) : null}
        <button type="button" disabled={parsing || (!file && !text.trim())} onClick={doPreview} className={`${secondaryBtn} w-full`}>
          {t.preview}
        </button>
        {preview ? (
          <div className="space-y-2" data-testid="cafe-preview">
            {preview.already ? <p className="font-semibold text-warn">{t.already}</p> : null}
            <p className="text-[15px] font-semibold">{t.matched(matched.length)}</p>
            <ul className="divide-y divide-line text-[15px]">
              {matched.map((l) => (
                <li key={l.name} className="flex justify-between gap-3 py-1.5">
                  <span>{l.item}</span>
                  <span className="tabular-nums">× {l.qty.toLocaleString("vi-VN")}</span>
                </li>
              ))}
            </ul>
            {unmatched.length ? <p className="text-sm text-warn">{t.unmatched(unmatched.map((l) => l.name).join(", "))}</p> : null}
            <button
              type="button"
              disabled={pending || preview.already || matched.length === 0}
              onClick={() =>
                run(
                  () => importCafeSales({ date: preview.date, lines: preview.lines.map((l) => ({ name: l.name, qty: l.qty, revenue: l.revenue })) }),
                  (r) => t.imported(r.matched),
                  () => {
                    setPreview(null);
                    setFile(null);
                    setText("");
                  },
                )
              }
              className={primaryBtn}
            >
              {t.commit(matched.length)}
            </button>
          </div>
        ) : null}
        {cafe.imports.length ? (
          <div>
            <h3 className="text-[15px] font-semibold">{t.recent}</h3>
            <ul className="mt-1 text-sm text-secondary">
              {cafe.imports.map((i) => (
                <li key={i.date} className="py-0.5">
                  {dayText(i.date)} · {t.recentLine(i.cups.toLocaleString("vi-VN"), i.matched)}
                  {i.unmatched.length ? ` · ⚠ ${i.unmatched.join(", ")}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CafeMenu({ cafe }: { cafe: CafeView }) {
  return (
    <section className={box} aria-labelledby="cafe-menu">
      <h2 id="cafe-menu" className={h2}>
        {t.menuTitle}
      </h2>
      <p className="mt-1 text-sm text-secondary">{t.menuHint}</p>
      <div className="mt-3 space-y-2">
        {cafe.items.map((i) => (
          <ItemEditor key={`${i.id}-${i.name}-${i.price}-${i.lines.length}`} item={i} ingredients={cafe.ingredients} />
        ))}
        <ItemEditor key={`new-${cafe.items.length}`} item={null} ingredients={cafe.ingredients} />
      </div>
    </section>
  );
}

function ItemEditor({ item, ingredients }: { item: CafeItemView | null; ingredients: CafeView["ingredients"] }) {
  const { pending, run } = useAdminAction();
  const [name, setName] = useState(item?.name ?? "");
  const [aliases, setAliases] = useState(item?.aliases.join(", ") ?? "");
  const [price, setPrice] = useState(item?.price ?? 0);
  const [active, setActive] = useState(item?.isActive ?? true);
  const [lines, setLines] = useState(item?.lines.map((l) => ({ ingredientId: l.ingredientId, qty: String(l.qty).replace(".", ",") })) ?? []);
  const id = `cafe-${item?.id ?? "new"}`;
  const unitOf = new Map(ingredients.map((i) => [i.id, i.unit]));
  const parsed = lines.map((l) => ({ ingredientId: l.ingredientId, qty: parseQty(l.qty) }));
  const valid = name.trim().length > 0 && parsed.every((l) => l.ingredientId && l.qty !== null && l.qty > 0) && new Set(parsed.map((l) => l.ingredientId)).size === parsed.length;
  return (
    <details className="rounded-2xl bg-elevated">
      <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 text-[15px] font-semibold">
        <span className="mr-auto">{item ? item.name : `+ ${t.newItem}`}</span>
        {item ? (
          <span className="text-sm font-normal text-secondary tabular-nums" data-testid={`cafe-margin-${item.id}`}>
            {item.cost ? `${formatPrice(item.gross ?? 0)} · ${pctOrDash(item.pct ?? null)}` : t.noRecipe}
          </span>
        ) : null}
      </summary>
      <div className="space-y-3 px-4 pb-4">
        {item && item.cost ? (
          <p className="text-sm text-secondary tabular-nums">{t.cost(formatPrice(item.price ?? 0), formatPrice(item.cost), formatPrice(item.gross ?? 0), pctOrDash(item.pct ?? null))}</p>
        ) : null}
        <div>
          <label htmlFor={`${id}-name`} className={label}>
            {t.name}
          </label>
          <input id={`${id}-name`} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="input" />
        </div>
        <div>
          <label htmlFor={`${id}-aliases`} className={label}>
            {t.aliases}
          </label>
          <input id={`${id}-aliases`} value={aliases} onChange={(e) => setAliases(e.target.value)} className="input" />
        </div>
        <PlainMoneyInput id={`${id}-price`} label={t.price} value={price} onChange={setPrice} />
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-6 accent-[var(--live)]" />
          {t.active}
        </label>
        <fieldset>
          <legend className={label}>{t.lines}</legend>
          <ul className="space-y-2">
            {lines.map((l, i) => (
              <li key={i} className="grid grid-cols-[1fr_6rem_auto] items-center gap-2">
                <select
                  aria-label={opsCopy.stock.item}
                  value={l.ingredientId}
                  onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ingredientId: e.target.value } : x)))}
                  className="input min-w-0"
                >
                  <option value="">—</option>
                  {ingredients.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`${t.qty}${unitOf.get(l.ingredientId) ? ` (${unitOf.get(l.ingredientId)})` : ""}`}
                  inputMode="decimal"
                  value={l.qty}
                  placeholder={unitOf.get(l.ingredientId) ?? ""}
                  onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
                  className="input min-w-0 tabular-nums"
                />
                <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="min-h-11 px-2 text-sm text-secondary">
                  {t.removeLine}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setLines((ls) => [...ls, { ingredientId: "", qty: "" }])} className="mt-2 min-h-11 text-[15px] font-semibold text-accent">
            + {t.addLine}
          </button>
        </fieldset>
        {item?.lines.length ? <p className="text-xs text-secondary">{item.lines.map((l) => `${qtyText(l.qty, l.unit)} ${l.label}`).join(" + ")}</p> : null}
        <button
          type="button"
          disabled={pending || !valid}
          onClick={() =>
            run(
              () =>
                saveCafeItem({
                  id: item?.id,
                  name: name.trim(),
                  aliases: aliases
                    .split(",")
                    .map((a) => a.trim())
                    .filter(Boolean)
                    .slice(0, 8),
                  price,
                  isActive: active,
                  lines: parsed.map((l) => ({ ingredientId: l.ingredientId, qty: l.qty! })),
                }),
              t.saved,
            )
          }
          className={`${secondaryBtn} w-full`}
        >
          {t.save}
        </button>
      </div>
    </details>
  );
}
