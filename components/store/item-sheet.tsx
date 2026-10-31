"use client";

import Image from "next/image";
import { useState } from "react";
import { SlotPicker } from "@/components/store/slot-chips";
import { useCatalog, type StoreProduct } from "@/components/store/store-provider";
import { chooseSlot, productAvailability, useOrder } from "@/components/store/use-order";
import { Sheet } from "@/components/ui/sheet";
import { Stepper } from "@/components/ui/stepper";
import { copy } from "@/data/copy";
import { dispatch, getCart } from "@/lib/client/cart-store";
import { showToast } from "@/lib/client/toast-store";
import { suggestSlot } from "@/lib/domain/capacity";
import { formatPrice } from "@/lib/format";

const t = copy.item;

export function ItemSheet({ product, open, onClose }: { product: StoreProduct | null; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={product?.name ?? ""} hideTitle closeLabel={t.close} snap="tall">
      {product ? <ItemBody key={product.id} product={product} onDone={onClose} /> : null}
    </Sheet>
  );
}

function ItemBody({ product, onDone }: { product: StoreProduct; onDone: () => void }) {
  const { byId } = useCatalog();
  const { slot, days, req, day, snap } = useOrder();
  const groups = product.comboConfig ?? [];
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(groups.map((g) => [g.key, g.options.find((o) => byId.get(o)?.isAvailable) ?? g.options[0]])),
  );
  const [extras, setExtras] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [picking, setPicking] = useState(false);

  const upsells = product.upsellIds.flatMap((id) => {
    const p = byId.get(id);
    return p && p.isAvailable ? [p] : [];
  });
  const choiceUnavailable = groups.some((g) => byId.get(choices[g.key])?.isAvailable === false);
  const avail = productAvailability(product, slot, req);
  const maxByRoom = avail.ok ? avail.maxQty : 0;
  const maxQty = Math.max(1, Math.min(snap?.rules.maxQtyPerLine ?? 10, maxByRoom));
  const count = Math.min(qty, maxQty);
  const total = product.price * count + upsells.filter((u) => extras.includes(u.id)).reduce((s, u) => s + u.price, 0);
  const canAdd = avail.ok && !choiceUnavailable;

  const suggestion =
    !avail.ok && avail.reason !== "sold_out" && slot
      ? suggestSlot(days, { pan: req.pan + product.usesPan, bbq: req.bbq + product.usesBbq }, slot.batchId)
      : null;

  function add() {
    if (!canAdd) return;
    const before = getCart();
    dispatch({
      type: "add",
      item: {
        productId: product.id,
        qty: count,
        comboChoices: groups.length > 0 ? choices : undefined,
        // Mỗi add-on 1 phần cho cả dòng (hũ sốt/chai), không nhân theo số bánh.
        addons: extras.map((id) => ({ productId: id, qty: 1 })),
      },
    });
    navigator.vibrate?.(8);
    showToast(`${copy.product.added} ${product.short}`, {
      label: copy.product.undo,
      run: () => dispatch({ type: "restore", state: before }),
    });
    onDone();
  }

  return (
    <div className="space-y-5">
      <div className="relative -mx-1 aspect-[16/10] overflow-hidden rounded-3xl bg-elevated">
        <Image src={product.image} alt={product.name} fill sizes="(min-width: 1024px) 440px, 100vw" className="object-cover" />
      </div>

      <div>
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-xl font-semibold tracking-tight text-balance">{product.name}</h3>
          <p className="shrink-0 text-lg font-semibold tabular-nums">{formatPrice(product.price)}</p>
        </div>
        <p className="mt-1.5 text-[15px] leading-relaxed text-secondary">{product.description ?? product.short}</p>
        {product.kind !== "addon" ? (
          <p className="mt-2 text-sm text-text">
            <span aria-hidden className="text-live">✓ </span>
            {copy.product.gingerNote}
          </p>
        ) : null}
        {!product.isAvailable ? <p className="mt-2 text-sm font-medium text-danger">{t.soldOut}</p> : null}
      </div>

      {groups.map((g) => (
        <fieldset key={g.key}>
          <legend className="mb-2 text-[11px] font-medium tracking-[0.22em] text-secondary uppercase">{g.label}</legend>
          <div className="grid grid-cols-2 gap-2">
            {g.options.map((id) => {
              const opt = byId.get(id);
              if (!opt) return null;
              return (
                <label
                  key={id}
                  className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-field border px-3 py-2 text-sm has-checked:border-text has-checked:bg-elevated ${
                    opt.isAvailable ? "border-line" : "border-line opacity-50"
                  }`}
                >
                  <input
                    type="radio"
                    name={`combo-${g.key}`}
                    value={id}
                    checked={choices[g.key] === id}
                    disabled={!opt.isAvailable}
                    onChange={() => setChoices((c) => ({ ...c, [g.key]: id }))}
                    className="size-4 accent-[var(--accent)]"
                  />
                  <span className="leading-snug">{opt.short === opt.name ? opt.name : opt.name.replace(/^Pan Pizza /, "")}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      {upsells.length > 0 ? (
        <fieldset>
          <legend className="mb-2 text-[11px] font-medium tracking-[0.22em] text-secondary uppercase">{t.extras}</legend>
          <div className="divide-y divide-line rounded-field bg-elevated/60">
            {upsells.map((u) => (
              <label key={u.id} className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={extras.includes(u.id)}
                  onChange={(e) => setExtras((x) => (e.target.checked ? [...x, u.id] : x.filter((i) => i !== u.id)))}
                  className="size-5 accent-[var(--accent)]"
                />
                <span className="flex-1">{u.name}</span>
                <span className="text-secondary tabular-nums">+{formatPrice(u.price)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="rounded-field bg-elevated/60 px-3 py-2">
        <div className="flex min-h-11 items-center justify-between gap-3 text-sm">
          {slot && day ? (
            <span className={avail.ok || avail.reason === "sold_out" ? "" : "text-danger"}>
              🕕{" "}
              {avail.ok || avail.reason === "sold_out"
                ? t.pickupAt(slot.readyLabel, day.label.toLowerCase())
                : t.noRoom(slot.readyLabel, avail.reason === "no_bbq" ? t.noBbq : t.noPan)}
            </span>
          ) : (
            <span className="text-secondary">{t.noSlot}</span>
          )}
          {days.length > 0 ? (
            <button
              type="button"
              aria-expanded={picking}
              onClick={() => setPicking((p) => !p)}
              className="-mr-2 min-h-11 shrink-0 px-2 font-medium text-secondary hover:text-text"
            >
              {t.change} ›
            </button>
          ) : null}
        </div>
        {suggestion ? (
          <button
            type="button"
            onClick={() => chooseSlot(suggestion)}
            className="mb-2 min-h-11 rounded-full border border-accent px-4 text-sm font-semibold"
          >
            {t.suggest(suggestion.readyLabel)}
          </button>
        ) : null}
        {picking ? (
          <div className="pb-2">
            <SlotPicker days={days} selected={slot} onSelect={(s) => chooseSlot(s, { toast: false })} />
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t.qty}</span>
        <Stepper value={count} max={maxQty} onChange={setQty} label={product.name} />
      </div>

      <div className="sticky bottom-0 -mx-5 mt-6 border-t border-line bg-surface/95 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <button
          type="button"
          onClick={add}
          disabled={!canAdd}
          className="h-13 w-full rounded-full bg-invert text-[17px] font-semibold text-on-invert tabular-nums transition active:scale-[0.98] disabled:opacity-40"
        >
          {t.addToOrder} · {formatPrice(total)}
        </button>
      </div>
    </div>
  );
}
