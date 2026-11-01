"use client";

import Image from "next/image";
import { useState } from "react";
import { SlotPicker } from "@/components/store/slot-chips";
import { useCatalog, type StoreProduct } from "@/components/store/store-provider";
import { addToCart, chooseSlot, productAvailability, useOrder } from "@/components/store/use-order";
import { Sheet } from "@/components/ui/sheet";
import { Stepper } from "@/components/ui/stepper";
import { copy } from "@/data/copy";
import { suggestSlot } from "@/lib/domain/capacity";
import { isExtra, segmentOf } from "@/lib/domain/types";
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
  const order = useOrder();
  // Món khác segment với giỏ → xem mẻ/khung của segment món này (thêm vào sẽ thay giỏ).
  const own = isExtra(product.kind) || segmentOf(product.kind) === order.segment;
  const snap = order.snap;
  const days = own ? order.days : ((segmentOf(product.kind) === "cafe" ? snap?.cafe : snap?.days) ?? []);
  const slot = own ? order.slot : (days.flatMap((d) => d.slots).find((s) => s.level !== "closed" && s.level !== "full") ?? null);
  const req = own ? order.req : { pan: 0, bbq: 0 };
  const day = slot ? (days.find((d) => d.date === slot.date) ?? null) : null;
  const cafe = product.kind === "cafe";
  const groups = product.comboConfig ?? [];
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(groups.map((g) => [g.key, g.options.find((o) => byId.get(o)?.isAvailable) ?? g.options[0]])),
  );
  const [extras, setExtras] = useState<Record<string, number>>({});
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
  const total = product.price * count + upsells.reduce((s, u) => s + u.price * (extras[u.id] ?? 0), 0);
  const sauces = upsells.filter((u) => u.kind === "addon");
  const drinks = upsells.filter((u) => u.kind === "drink");
  const drinkCount = drinks.reduce((n, u) => n + (extras[u.id] ?? 0), 0);
  // Gợi ý số lon theo số người ăn: combo ~2 người, mỗi bánh/phần BBQ ~1 lon.
  const people = (product.kind === "combo" ? 2 : 1) * count;
  const canAdd = avail.ok && !choiceUnavailable;

  const suggestion =
    !avail.ok && avail.reason !== "sold_out" && slot
      ? suggestSlot(days, { pan: req.pan + product.usesPan, bbq: req.bbq + product.usesBbq }, slot.batchId)
      : null;

  function add() {
    if (!canAdd) return;
    addToCart(
      product,
      {
        productId: product.id,
        qty: count,
        comboChoices: groups.length > 0 ? choices : undefined,
        // Số hũ sốt/lon nước cho cả dòng, không nhân theo số bánh.
        addons: Object.entries(extras)
          .filter(([, q]) => q > 0)
          .map(([id, q]) => ({ productId: id, qty: q })),
      },
      byId,
    );
    onDone();
  }
  const setExtra = (id: string, q: number) => setExtras((x) => ({ ...x, [id]: q }));

  return (
    <div className="space-y-5">
      <div className="relative -mx-1 aspect-[16/10] overflow-hidden rounded-3xl bg-elevated">
        <Image src={product.image} alt={product.name} fill sizes="(min-width: 1024px) 440px, 100vw" className="object-cover" unoptimized={product.image.endsWith(".svg")} />
      </div>

      <div>
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-xl font-semibold tracking-tight text-balance">{product.name}</h3>
          <p className="shrink-0 text-lg font-semibold tabular-nums">{formatPrice(product.price)}</p>
        </div>
        <p className="mt-1.5 text-[15px] leading-relaxed text-secondary">{product.description ?? product.short}</p>
        {product.kind === "combo" || product.kind === "pizza" || product.kind === "bbq" ? (
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

      {sauces.length > 0 ? <ExtraList title={t.extras} items={sauces} extras={extras} onChange={setExtra} /> : null}
      {drinks.length > 0 ? (
        <ExtraList
          title={t.drinks}
          hint={drinkCount < people ? t.drinksHint(people) : t.drinksOk}
          items={drinks}
          extras={extras}
          onChange={setExtra}
        />
      ) : null}

      <div className="rounded-field bg-elevated/60 px-3 py-2">
        <div className="flex min-h-11 items-center justify-between gap-3 text-sm">
          {slot && day ? (
            <span className={avail.ok || avail.reason === "sold_out" ? "" : "text-danger"}>
              🕕{" "}
              {avail.ok || avail.reason === "sold_out"
                ? cafe
                  ? t.cafeAt(slot.readyLabel, day.label.toLowerCase())
                  : t.pickupAt(slot.readyLabel, day.label.toLowerCase())
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

/** Sốt/nước kèm: bước +/- (mua 2–3 lon cho cả nhà chỉ cần chạm), hiện giá lẻ gạch ngang. */
function ExtraList({
  title,
  hint,
  items,
  extras,
  onChange,
}: {
  title: string;
  hint?: string;
  items: StoreProduct[];
  extras: Record<string, number>;
  onChange: (id: string, qty: number) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-[11px] font-medium tracking-[0.22em] text-secondary uppercase">{title}</legend>
      {hint ? <p className="mb-2 text-sm text-secondary">{hint}</p> : <div className="mb-2" />}
      <div className="divide-y divide-line rounded-field bg-elevated/60">
        {items.map((u) => (
          <div key={u.id} className="flex min-h-14 items-center gap-3 px-3 py-1.5 text-sm">
            <span className="relative size-10 shrink-0 overflow-hidden rounded-xl bg-surface">
              <Image src={u.image} alt="" fill sizes="40px" className="object-cover" unoptimized={u.image.endsWith(".svg")} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block leading-snug">{u.name}</span>
              <span className="tabular-nums">
                +{formatPrice(u.price)}
                {u.listPrice && u.listPrice > u.price ? (
                  <s className="ml-1.5 text-secondary">
                    <span className="sr-only">{copy.product.listPrice} </span>
                    {formatPrice(u.listPrice)}
                  </s>
                ) : null}
              </span>
            </span>
            <Stepper size="sm" min={0} max={10} value={extras[u.id] ?? 0} label={u.name} onChange={(q) => onChange(u.id, q)} />
          </div>
        ))}
      </div>
    </fieldset>
  );
}
