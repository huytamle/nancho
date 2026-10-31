"use client";

import Image from "next/image";
import { useActionState, useEffect, useMemo, useState } from "react";
import { createDeliveryOrder, type DeliveryState } from "@/app/actions/delivery";
import { SectionHeading } from "@/components/section-heading";
import { useLanguage } from "@/components/language-provider";
import { DELIVERY_FEE, MAX_ITEM_QTY } from "@/data/delivery";
import { menu, type MenuItemId } from "@/data/menu";
import { formatPrice } from "@/lib/format";

const initial: DeliveryState = { ok: false, status: "", errors: {} };

const fieldClass =
  "mt-2 h-12 w-full rounded-2xl border border-line bg-bg px-4 text-text outline-none transition focus:border-text/40";

type Filter = "all" | (typeof menu)[number]["id"];

export function Delivery() {
  const { lang, t } = useLanguage();
  const [filter, setFilter] = useState<Filter>("all");
  const [qty, setQty] = useState<Partial<Record<MenuItemId, number>>>({});
  const [state, action, pending] = useActionState(createDeliveryOrder, initial);

  useEffect(() => {
    if (state.ok) setQty({});
  }, [state.ok]);

  const lines = useMemo(() => {
    return menu.flatMap((group) =>
      group.items
        .filter((item) => (qty[item.id] ?? 0) > 0)
        .map((item) => ({
          ...item,
          groupId: group.id,
          count: qty[item.id] ?? 0,
        })),
    );
  }, [qty]);

  const subtotal = lines.reduce((sum, line) => sum + line.price * line.count, 0);
  const fee = lines.length > 0 ? DELIVERY_FEE : 0;
  const total = subtotal + fee;
  const itemsJson = JSON.stringify(
    lines.map((line) => ({ id: line.id, qty: line.count })),
  );

  function setCount(id: MenuItemId, next: number) {
    setQty((current) => {
      const value = Math.max(0, Math.min(MAX_ITEM_QTY, next));
      const copy = { ...current };
      if (value === 0) delete copy[id];
      else copy[id] = value;
      return copy;
    });
  }

  const groups = filter === "all" ? menu : menu.filter((group) => group.id === filter);
  const statusMessage =
    state.status === "success"
      ? t.delivery.success
      : state.status === "invalid"
        ? t.delivery.invalid
        : "";

  return (
    <section
      id="delivery"
      className="scroll-mt-24 bg-bg px-4 py-20 sm:px-6 md:px-8 md:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          kicker={t.delivery.kicker}
          title={t.delivery.title}
          description={t.delivery.description}
        />

        <div className="mt-10 flex gap-2 overflow-x-auto pb-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${
              filter === "all"
                ? "border-invert bg-invert text-on-invert"
                : "border-line text-secondary hover:text-text"
            }`}
          >
            {t.delivery.all}
          </button>
          {menu.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => setFilter(group.id)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${
                filter === group.id
                  ? "border-invert bg-invert text-on-invert"
                  : "border-line text-secondary hover:text-text"
              }`}
            >
              {t.menu.groups[group.id].title}
            </button>
          ))}
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.35fr_0.9fr] lg:items-start">
          <div className="space-y-10">
            {groups.map((group) => (
              <div key={group.id}>
                <h3 className="text-xl font-semibold tracking-tight">
                  {t.menu.groups[group.id].title}
                </h3>
                <ul className="mt-4 space-y-3">
                  {group.items.map((item) => {
                    const text = t.menu.items[item.id];
                    const count = qty[item.id] ?? 0;
                    return (
                      <li
                        key={item.id}
                        className="flex items-center gap-4 rounded-[24px] bg-surface p-3"
                      >
                        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl">
                          <Image
                            src={item.image}
                            alt={text.alt}
                            fill
                            sizes="80px"
                            className="object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium tracking-tight">{text.name}</p>
                          <p className="mt-0.5 truncate text-sm text-secondary">
                            {text.description}
                          </p>
                          <p className="mt-1 text-sm tabular-nums text-secondary">
                            {formatPrice(item.price, lang)}
                          </p>
                        </div>
                        {count === 0 ? (
                          <button
                            type="button"
                            onClick={() => setCount(item.id, 1)}
                            className="shrink-0 rounded-full bg-invert px-4 py-2 text-sm font-medium text-on-invert"
                          >
                            {t.delivery.add}
                          </button>
                        ) : (
                          <Stepper
                            value={count}
                            onChange={(value) => setCount(item.id, value)}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          <aside
            id="gio-hang"
            className="rounded-[28px] bg-surface p-5 sm:p-6 lg:sticky lg:top-24"
          >
            <h3 className="text-lg font-semibold tracking-tight">{t.delivery.cart}</h3>

            {lines.length === 0 ? (
              <p className="mt-4 text-sm text-secondary">{t.delivery.empty}</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {lines.map((line) => (
                  <li key={line.id} className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <p className="font-medium">{t.menu.items[line.id].name}</p>
                      <p className="text-secondary tabular-nums">
                        {line.count} × {formatPrice(line.price, lang)}
                      </p>
                    </div>
                    <Stepper
                      value={line.count}
                      onChange={(value) => setCount(line.id, value)}
                    />
                  </li>
                ))}
              </ul>
            )}

            <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-secondary">{t.delivery.subtotal}</dt>
                <dd className="tabular-nums">{formatPrice(subtotal, lang)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-secondary">{t.delivery.fee}</dt>
                <dd className="tabular-nums">{formatPrice(fee, lang)}</dd>
              </div>
              <div className="flex justify-between text-base font-medium">
                <dt>{t.delivery.total}</dt>
                <dd className="tabular-nums">{formatPrice(total, lang)}</dd>
              </div>
            </dl>

            <form action={action} className="mt-6 space-y-4" noValidate>
              <input type="hidden" name="items" value={itemsJson} />
              {statusMessage ? (
                <p
                  role="status"
                  className={`rounded-2xl px-4 py-3 text-sm ${
                    state.ok ? "bg-elevated" : "bg-accent/15"
                  }`}
                >
                  {statusMessage}
                </p>
              ) : null}
              {state.errors.cart ? (
                <p className="text-sm text-accent">{t.delivery.errors[state.errors.cart]}</p>
              ) : null}

              <div>
                <label htmlFor="delivery-name" className="text-sm text-secondary">
                  {t.form.name}
                </label>
                <input
                  id="delivery-name"
                  name="name"
                  required
                  autoComplete="name"
                  className={fieldClass}
                />
                {state.errors.name ? (
                  <p className="mt-1 text-sm text-accent">
                    {t.delivery.errors[state.errors.name]}
                  </p>
                ) : null}
              </div>

              <div>
                <label htmlFor="delivery-phone" className="text-sm text-secondary">
                  {t.form.phone}
                </label>
                <input
                  id="delivery-phone"
                  name="phone"
                  type="tel"
                  required
                  autoComplete="tel"
                  placeholder="0922 662 669"
                  className={fieldClass}
                />
                {state.errors.phone ? (
                  <p className="mt-1 text-sm text-accent">
                    {t.delivery.errors[state.errors.phone]}
                  </p>
                ) : null}
              </div>

              <div>
                <label htmlFor="delivery-address" className="text-sm text-secondary">
                  {t.delivery.address}
                </label>
                <textarea
                  id="delivery-address"
                  name="address"
                  required
                  rows={2}
                  placeholder={t.delivery.addressPlaceholder}
                  className="mt-2 w-full rounded-2xl border border-line bg-bg px-4 py-3 text-text outline-none transition focus:border-text/40"
                />
                {state.errors.address ? (
                  <p className="mt-1 text-sm text-accent">
                    {t.delivery.errors[state.errors.address]}
                  </p>
                ) : null}
              </div>

              <div>
                <label htmlFor="delivery-notes" className="text-sm text-secondary">
                  {t.form.notes}
                </label>
                <textarea
                  id="delivery-notes"
                  name="notes"
                  rows={2}
                  maxLength={300}
                  placeholder={t.delivery.notesPlaceholder}
                  className="mt-2 w-full rounded-2xl border border-line bg-bg px-4 py-3 text-text outline-none transition focus:border-text/40"
                />
                {state.errors.notes ? (
                  <p className="mt-1 text-sm text-accent">
                    {t.delivery.errors[state.errors.notes]}
                  </p>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-invert px-6 text-sm font-medium text-on-invert transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                {pending ? t.delivery.pending : t.delivery.submit}
              </button>
            </form>
          </aside>
        </div>
      </div>
    </section>
  );
}

function Stepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-line">
      <button
        type="button"
        aria-label="-"
        onClick={() => onChange(value - 1)}
        className="h-9 w-9 text-lg leading-none"
      >
        −
      </button>
      <span className="w-6 text-center text-sm tabular-nums">{value}</span>
      <button
        type="button"
        aria-label="+"
        onClick={() => onChange(value + 1)}
        className="h-9 w-9 text-lg leading-none"
      >
        +
      </button>
    </div>
  );
}
