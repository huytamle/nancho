"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { placeOrder } from "@/app/actions/order";
import { OrderSuccess } from "@/components/store/order-success";
import { SlotPicker } from "@/components/store/slot-chips";
import { useCatalog } from "@/components/store/store-provider";
import { chooseSlot, useOrder, type OrderLine } from "@/components/store/use-order";
import { Sheet } from "@/components/ui/sheet";
import { Stepper } from "@/components/ui/stepper";
import { copy, type CheckoutErrorKey } from "@/data/copy";
import { site } from "@/data/site";
import { dispatch, type Draft } from "@/lib/client/cart-store";
import { refreshOven } from "@/lib/client/oven-store";
import { fits, suggestSlot } from "@/lib/domain/capacity";
import type { SlotView } from "@/lib/domain/oven-status";
import { formatPhoneInput } from "@/lib/domain/phone";
import { priceOrder } from "@/lib/domain/pricing";
import { vnTimeLabel } from "@/lib/domain/time";
import { formatPrice } from "@/lib/format";
import { checkFields, type FieldErrors, type FieldKey, type PlaceOrderResult } from "@/lib/order-contract";

const t = copy.checkout;
const MIN_FILL_MS = 3000; // server từ chối đơn điền < 3 giây (chống bot) → client tự chờ cho đủ.
const FIELD_ORDER: FieldKey[] = ["phone", "name", "zone", "address", "note"];
const fieldId = (f: FieldKey) => `co-${f}`;

type Failure = Exclude<PlaceOrderResult, { ok: true }> & { at: string };
type Success = Extract<PlaceOrderResult, { ok: true }>;

export function CheckoutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={t.title} closeLabel={t.close} snap="tall">
      <CheckoutBody onClose={onClose} />
    </Sheet>
  );
}

function CheckoutBody({ onClose }: { onClose: () => void }) {
  const { byId, zones, pickup } = useCatalog();
  const { cart, lines, req, slot, day, days, snap } = useOrder();
  const d = cart.draft;
  const [pending, startTransition] = useTransition();
  const [touched, setTouched] = useState<Set<FieldKey>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [success, setSuccess] = useState<Success | null>(null);
  const [showNote, setShowNote] = useState(d.note.length > 0);
  const [pin, setPin] = useState<"idle" | "busy">("idle");
  const idem = useRef<string | null>(null);
  const startedAt = useRef(0);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  if (success) return <OrderSuccess result={success} onDone={onClose} />;

  const set = (patch: Partial<Draft>) => dispatch({ type: "draft", patch });
  const zone = zones.find((z) => z.id === d.zoneId) ?? null;
  const gift = pickup?.giftProductId ? byId.get(pickup.giftProductId) : undefined;
  const isPickup = d.fulfillment === "pickup" && pickup !== null;

  const priced = priceOrder({
    lines: lines.map((l) => ({
      product: l.product,
      qty: l.item.qty,
      comboChoices: l.product.kind === "combo" ? l.item.comboChoices : undefined,
      addons: l.addons,
    })),
    fulfillment: isPickup
      ? { type: "pickup", point: pickup, giftProduct: gift }
      : { type: "delivery", zone: { shipFee: zone?.shipFee ?? 0 } },
    shipping: { freeShipFrom: snap?.rules.freeShipFrom ?? null },
  });
  const subtotal = priced.ok ? priced.subtotal : lines.reduce((s, l) => s + l.lineTotal, 0);
  const shipFee = priced.ok && (isPickup || zone) ? priced.shipFee : null;
  const total = subtotal + (shipFee ?? 0);
  const giftItem = priced.ok ? priced.items.find((i) => i.isGift) : undefined;
  const unavailableIds = new Set([
    ...lines.filter((l) => !l.product.isAvailable).map((l) => l.product.id),
    ...(failure?.reason === "unavailable" ? failure.productIds : []),
  ]);

  const fitsSlot = slot ? fits(req, slot) : false;
  const altSlot = slot && !fitsSlot ? suggestSlot(days, req, slot.batchId) : null;
  const upsellIds = [...new Set(lines.flatMap((l) => l.product.upsellIds))].filter(
    (id) => !lines.some((l) => l.product.id === id || l.addons.some((a) => a.product.id === id)),
  );
  const suggestions = upsellIds.flatMap((id) => {
    const p = byId.get(id);
    return p?.isAvailable ? [p] : [];
  });

  const fields = { ...d, fulfillment: isPickup ? ("pickup" as const) : ("delivery" as const) };
  const clientErrors = checkFields(fields);
  const errorOf = (f: FieldKey): CheckoutErrorKey | undefined =>
    (submitted || touched.has(f) ? clientErrors[f] : undefined) ?? serverErrors[f];
  const blur = (f: FieldKey) => setTouched((s) => (s.has(f) ? s : new Set(s).add(f)));

  const canSubmit = lines.length > 0 && slot !== null && fitsSlot && unavailableIds.size === 0 && !pending;

  function submit(target: SlotView | null = slot) {
    setSubmitted(true);
    setFailure(null);
    const errs = checkFields(fields);
    const first = FIELD_ORDER.find((f) => errs[f]);
    if (first) {
      const el = document.getElementById(fieldId(first));
      el?.focus();
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      navigator.vibrate?.([12, 60, 12]);
      return;
    }
    if (!target || lines.length === 0) return;
    idem.current ??= crypto.randomUUID();
    const key = idem.current;

    startTransition(async () => {
      const wait = MIN_FILL_MS - (Date.now() - startedAt.current);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      let res: PlaceOrderResult;
      try {
        res = await placeOrder({
          idempotencyKey: key,
          batchId: target.batchId,
          lines: lines.map((l) => ({
            productId: l.product.id,
            qty: l.item.qty,
            comboChoices: l.item.comboChoices,
            addons: l.item.addons.length > 0 ? l.item.addons : undefined,
          })),
          customer: { phone: d.phone, name: d.name.trim(), remember: d.remember },
          fulfillment: isPickup
            ? { type: "pickup", pickupPointId: pickup.id }
            : {
                type: "delivery",
                zoneId: d.zoneId ?? 0,
                addressText: d.addressText.trim(),
                ...(d.lat !== null && d.lng !== null ? { lat: d.lat, lng: d.lng } : {}),
              },
          paymentMethod: d.paymentMethod,
          note: d.note.trim() || undefined,
          website: (document.getElementById("co-website") as HTMLInputElement | null)?.value ?? "",
          startedAt: startedAt.current,
        });
      } catch {
        res = { ok: false, reason: "server_error" };
      }
      if (res.ok) {
        idem.current = null;
        dispatch({ type: "placed" });
        setSuccess(res);
        navigator.vibrate?.(20);
        void refreshOven();
        return;
      }
      setServerErrors(res.reason === "invalid" ? res.fieldErrors : {});
      setFailure({ ...res, at: target.readyLabel });
      if (res.reason === "slot_full" || res.reason === "cutoff_passed") void refreshOven();
      navigator.vibrate?.([12, 60, 12]);
    });
  }

  function retryAt(s: SlotView) {
    chooseSlot(s, { toast: false });
    submit(s);
  }

  function pinLocation() {
    if (!navigator.geolocation) return;
    setPin("busy");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        set({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) });
        setPin("idle");
      },
      () => setPin("idle"), // thất bại → im lặng, không chặn đơn
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function zaloFallback() {
    const text = [
      `Đặt lò ${slot?.readyLabel ?? ""} ${day?.label ?? ""}`,
      ...lines.map((l) => `${l.item.qty}× ${l.product.name}${l.addons.map((a) => ` + ${a.product.name}`).join("")}`),
      `${d.name} · ${d.phone}`,
      isPickup ? `Nhận tại ${pickup.name}` : `${zone?.name ?? ""} · ${d.addressText}`,
      `Tổng ${formatPrice(total)}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
    window.open(site.contact.zaloHref, "_blank", "noopener");
  }

  if (lines.length === 0) {
    return <p className="py-10 text-center text-secondary">{t.empty}</p>;
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onFocus={(e) => {
        if (e.target instanceof HTMLElement && e.target.matches("input,select,textarea")) {
          setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
        }
      }}
      className="space-y-6"
    >
      {/* Đơn */}
      <ul className="divide-y divide-line">
        {lines.map((l) => (
          <CartLineRow key={l.item.key} line={l} max={snap?.rules.maxQtyPerLine ?? 10} unavailable={unavailableIds.has(l.product.id)} />
        ))}
        {giftItem ? (
          <li className="flex items-center justify-between gap-3 py-3 text-sm">
            <span>🎁 {giftItem.name}</span>
            <span className="font-semibold text-live">{t.gift}</span>
          </li>
        ) : null}
      </ul>

      {suggestions.length > 0 ? (
        <div className="-mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="shrink-0 text-xs text-secondary">{t.suggest}:</span>
          {suggestions.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => dispatch({ type: "add", item: { productId: p.id, qty: 1, addons: [] } })}
              className="min-h-11 shrink-0 rounded-full bg-elevated px-3 text-sm"
            >
              + {p.name} <span className="text-secondary tabular-nums">{Math.round(p.price / 1000)}k</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Mẻ */}
      <Section title={t.receiveAt}>
        {days.length > 0 ? (
          <SlotPicker days={days} selected={slot} onSelect={(s) => chooseSlot(s, { toast: false })} />
        ) : (
          <p className="text-sm text-secondary">{copy.item.noSlot}</p>
        )}
        {slot && !fitsSlot ? (
          <p className="mt-2 text-sm text-danger">
            {t.noRoom(slot.readyLabel)}
            {altSlot ? (
              <button type="button" onClick={() => chooseSlot(altSlot)} className="ml-2 min-h-11 font-semibold text-text underline">
                {copy.item.suggest(altSlot.readyLabel)}
              </button>
            ) : null}
          </p>
        ) : null}
      </Section>

      {/* Khách */}
      <div className="space-y-4">
        <Field id={fieldId("phone")} label={t.phone} error={errorOf("phone")}>
          <input
            id={fieldId("phone")}
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={d.phone}
            onChange={(e) => set({ phone: formatPhoneInput(e.target.value) })}
            onBlur={() => blur("phone")}
            placeholder="0912 345 678"
            className="input tabular-nums"
            aria-invalid={!!errorOf("phone")}
            aria-describedby={errorOf("phone") ? `${fieldId("phone")}-err` : undefined}
          />
        </Field>
        <Field id={fieldId("name")} label={t.name} error={errorOf("name")}>
          <input
            id={fieldId("name")}
            autoComplete="given-name"
            value={d.name}
            maxLength={40}
            onChange={(e) => set({ name: e.target.value })}
            onBlur={() => blur("name")}
            placeholder={t.namePlaceholder}
            className="input"
            aria-invalid={!!errorOf("name")}
            aria-describedby={errorOf("name") ? `${fieldId("name")}-err` : undefined}
          />
        </Field>
      </div>

      {/* Cách nhận */}
      <Section title={t.fulfillment}>
        <div role="radiogroup" aria-label={t.fulfillment} className="grid grid-cols-2 gap-2">
          <Choice checked={!isPickup} onSelect={() => set({ fulfillment: "delivery" })} title={`🛵 ${t.delivery}`}>
            {zones.length > 0
              ? `+${formatPrice(Math.min(...zones.map((z) => z.shipFee)))}${
                  Math.max(...zones.map((z) => z.shipFee)) !== Math.min(...zones.map((z) => z.shipFee))
                    ? `–${formatPrice(Math.max(...zones.map((z) => z.shipFee)))}`
                    : ""
                }`
              : null}
          </Choice>
          {pickup ? (
            <Choice checked={isPickup} onSelect={() => set({ fulfillment: "pickup" })} title={`☕ ${t.pickup(pickup.name.replace(/^Cà phê /, ""))}`}>
              {t.freeShip}
              {gift?.isAvailable ? (
                <>
                  <br />
                  {t.giftLine(gift.short)}
                </>
              ) : null}
            </Choice>
          ) : null}
        </div>

        <div className="collapse-rows mt-4" data-open={!isPickup || undefined}>
          <div className="min-h-0 space-y-4" inert={isPickup}>
            <Field id={fieldId("zone")} label={t.zone} error={errorOf("zone")}>
              <select
                id={fieldId("zone")}
                value={d.zoneId ?? ""}
                onChange={(e) => set({ zoneId: e.target.value ? Number(e.target.value) : null })}
                onBlur={() => blur("zone")}
                className="input appearance-none bg-[length:12px] bg-[right_1rem_center] bg-no-repeat"
                aria-invalid={!!errorOf("zone")}
                aria-describedby={errorOf("zone") ? `${fieldId("zone")}-err` : undefined}
              >
                <option value="">{t.zonePlaceholder}</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} — {formatPrice(z.shipFee)}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={fieldId("address")} label={t.address} error={errorOf("address")}>
              <textarea
                id={fieldId("address")}
                rows={2}
                maxLength={200}
                autoComplete="street-address"
                value={d.addressText}
                onChange={(e) => set({ addressText: e.target.value })}
                onBlur={() => blur("address")}
                placeholder={t.addressPlaceholder}
                className="input min-h-20 resize-none py-3"
                aria-invalid={!!errorOf("address")}
                aria-describedby={errorOf("address") ? `${fieldId("address")}-err` : undefined}
              />
            </Field>
            {d.lat !== null ? (
              <p className="flex min-h-11 items-center gap-2 text-sm text-live">
                📍 {t.pinned(d.accuracy ?? 0)}
                <button type="button" onClick={() => set({ lat: null, lng: null, accuracy: null })} className="min-h-11 px-2 text-secondary underline">
                  {t.unpin}
                </button>
              </p>
            ) : (
              <button type="button" onClick={pinLocation} disabled={pin === "busy"} className="min-h-11 text-sm text-secondary hover:text-text">
                📍 {pin === "busy" ? t.pinning : t.pin}
              </button>
            )}
          </div>
        </div>
      </Section>

      {/* Thanh toán */}
      <Section title={t.payment}>
        <div className="space-y-1">
          {(["cod", "transfer"] as const).map((m) => (
            <label key={m} className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
              <input
                type="radio"
                name="payment"
                checked={d.paymentMethod === m}
                onChange={() => set({ paymentMethod: m })}
                className="size-5 accent-[var(--accent)]"
              />
              {m === "cod" ? t.cod : t.transfer}
            </label>
          ))}
        </div>
      </Section>

      <div className="space-y-2">
        {showNote ? (
          <Field id={fieldId("note")} label={t.note} error={errorOf("note")}>
            <textarea
              id={fieldId("note")}
              rows={2}
              maxLength={300}
              value={d.note}
              onChange={(e) => set({ note: e.target.value })}
              onBlur={() => blur("note")}
              className="input min-h-20 resize-none py-3"
            />
          </Field>
        ) : (
          <button type="button" onClick={() => setShowNote(true)} className="min-h-11 text-sm text-secondary hover:text-text">
            {t.noteToggle}
          </button>
        )}
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={d.remember} onChange={(e) => set({ remember: e.target.checked })} className="size-5 accent-[var(--accent)]" />
          {t.remember}
        </label>
      </div>

      {/* Honeypot — người thật không thấy */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="co-website">Website</label>
        <input id="co-website" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      {/* Chốt */}
      <div className="sticky bottom-0 -mx-5 mt-6 space-y-2 border-t border-line bg-surface/95 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <FailureBanner failure={failure} onPick={retryAt} onRetry={() => submit()} onZalo={zaloFallback} />
        <p className="flex justify-between text-sm text-secondary tabular-nums">
          <span>
            {t.subtotal} {formatPrice(subtotal)}
          </span>
          <span>
            {t.ship} {shipFee === null ? "—" : formatPrice(shipFee)}
          </span>
        </p>
        <button
          type="submit"
          disabled={!canSubmit}
          aria-disabled={pending || undefined}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-full bg-accent text-[17px] font-semibold text-on-accent tabular-nums transition active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? (
            <>
              <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
              {t.pending}
            </>
          ) : (
            t.submit(slot?.readyLabel ?? "", formatPrice(total))
          )}
        </button>
        <p className="text-center text-xs text-secondary" aria-live="polite">
          {pending ? t.pending : slot ? t.terms(timeOf(slot.cutoffAt)) : ""}
        </p>
      </div>
    </form>
  );
}

const timeOf = (iso: string) => vnTimeLabel(new Date(iso));

function CartLineRow({ line, max, unavailable }: { line: OrderLine; max: number; unavailable: boolean }) {
  const { byId } = useCatalog();
  const choiceNames = Object.values(line.item.comboChoices ?? {})
    .map((id) => byId.get(id)?.name.replace(/^Pan Pizza /, ""))
    .filter(Boolean)
    .join(" + ");
  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug font-medium">
            {line.product.name}
            {choiceNames ? <span className="text-secondary"> ({choiceNames})</span> : null}
          </p>
          {line.addons.map((a) => (
            <p key={a.product.id} className="mt-0.5 pl-3 text-sm text-secondary">
              + {a.product.name} <span className="tabular-nums">{formatPrice(a.product.price * a.qty)}</span>
            </p>
          ))}
          {unavailable ? <p className="mt-0.5 text-sm text-danger">{copy.product.soldOutToday}</p> : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-semibold tabular-nums">{formatPrice(line.lineTotal)}</span>
          <Stepper
            size="sm"
            min={0}
            max={max}
            value={line.item.qty}
            label={line.product.name}
            onChange={(qty) => dispatch({ type: "setQty", key: line.item.key, qty })}
          />
        </div>
      </div>
    </li>
  );
}

function FailureBanner({
  failure,
  onPick,
  onRetry,
  onZalo,
}: {
  failure: Failure | null;
  onPick: (s: SlotView) => void;
  onRetry: () => void;
  onZalo: () => void;
}) {
  if (!failure) return null;
  const box = "rounded-field border px-3 py-2.5 text-sm";
  switch (failure.reason) {
    case "slot_full":
    case "cutoff_passed":
      return (
        <div role="alert" className={`${box} border-danger/50`}>
          <p>{t.slotGone(failure.at, failure.reason === "slot_full" ? "full" : "cutoff")}</p>
          {failure.alternatives.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="sr-only">{t.pickAlternative}</span>
              {failure.alternatives.slice(0, 3).map((s) => (
                <button key={s.batchId} type="button" onClick={() => onPick(s)} className="min-h-11 rounded-full border border-accent px-3 font-semibold tabular-nums">
                  {s.readyLabel} · {copy.slot.left(s.remainingPan)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      );
    case "invalid":
      return (
        <p role="alert" className={`${box} border-danger/50`}>
          {t.invalid}
        </p>
      );
    case "unavailable":
      return (
        <p role="alert" className={`${box} border-danger/50`}>
          {t.unavailable}
        </p>
      );
    case "paused":
      return (
        <p role="alert" className={`${box} border-warn/50`}>
          {t.paused}
        </p>
      );
    default:
      return (
        <div role="alert" className={`${box} border-danger/50`}>
          <p>{t.failed}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={onRetry} className="min-h-11 rounded-full bg-invert px-4 font-semibold text-on-invert">
              {t.retry}
            </button>
            <a href={site.contact.phoneHref} className="inline-flex min-h-11 items-center rounded-full bg-elevated px-4 font-medium">
              {copy.store.callToOrder}
            </a>
            <button type="button" onClick={onZalo} className="min-h-11 rounded-full bg-elevated px-4 font-medium">
              {copy.store.zalo}
            </button>
          </div>
        </div>
      );
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-medium tracking-[0.22em] text-secondary uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: CheckoutErrorKey; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 text-sm text-danger">
          {t.errors[error]}
        </p>
      ) : null}
    </div>
  );
}

function Choice({ checked, onSelect, title, children }: { checked: boolean; onSelect: () => void; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={`min-h-20 rounded-field border p-3 text-left transition ${checked ? "border-text bg-elevated" : "border-line"}`}
    >
      <span className="block text-[15px] font-semibold">{title}</span>
      <span className="mt-1 block text-xs leading-relaxed text-secondary">{children}</span>
    </button>
  );
}
