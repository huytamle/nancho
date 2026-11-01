"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { lookupCustomer } from "@/app/actions/customer";
import { placeOrder } from "@/app/actions/order";
import { checkPromo, myVouchers, type WalletVoucher } from "@/app/actions/promo";
import { OrderSuccess } from "@/components/store/order-success";
import { SlotPicker } from "@/components/store/slot-chips";
import { useCatalog } from "@/components/store/store-provider";
import { chooseSlot, useOrder, type OrderLine } from "@/components/store/use-order";
import { Sheet } from "@/components/ui/sheet";
import { Stepper } from "@/components/ui/stepper";
import { copy, type CheckoutErrorKey } from "@/data/copy";
import { site } from "@/data/site";
import { dispatch, getCart, type Draft } from "@/lib/client/cart-store";
import { refreshOven } from "@/lib/client/oven-store";
import { fits, suggestSlot } from "@/lib/domain/capacity";
import type { SlotView } from "@/lib/domain/oven-status";
import { formatPhoneInput, normalizePhone } from "@/lib/domain/phone";
import { CAFE_MIN_SUBTOTAL, priceOrder } from "@/lib/domain/pricing";
import type { PromoError } from "@/lib/domain/promo";
import { vnTimeLabel } from "@/lib/domain/time";
import { formatPrice } from "@/lib/format";
import { checkFields, type FieldErrors, type FieldKey, type LookupResult, type PlaceOrderResult } from "@/lib/order-contract";
import { track } from "@/lib/client/analytics";

const t = copy.checkout;
const MIN_FILL_MS = 3000; // server từ chối đơn điền < 3 giây (chống bot) → client tự chờ cho đủ.
const LOOKUP_DEBOUNCE_MS = 300;
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
  const { cart, lines, req, slot, day, days, snap, segment } = useOrder();
  const cafe = segment === "cafe";
  const d = cart.draft;
  const [pending, startTransition] = useTransition();
  const [touched, setTouched] = useState<Set<FieldKey>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [success, setSuccess] = useState<Success | null>(null);
  const [showNote, setShowNote] = useState(d.note.length > 0);
  const [pin, setPin] = useState<"idle" | "busy">("idle");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [savedChoice, setSavedChoice] = useState<"saved" | "other" | null>(null);
  const [prepay, setPrepay] = useState(false);
  const [promo, setPromo] = useState<{ code: string; amount: number } | null>(null);
  const [promoErr, setPromoErr] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [wallet, setWallet] = useState<{ signedIn: boolean; vouchers: WalletVoucher[] } | null>(null);
  const idem = useRef<string | null>(null);
  const startedAt = useRef(0);
  const lookupTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lookupPhone = useRef("");

  // Tra khách cũ (§7.7): chỉ khi đủ 10 số hợp lệ, debounce 300 ms; bỏ kết quả của số đã bị sửa.
  function runLookup(phone: string) {
    lookupPhone.current = phone;
    clearTimeout(lookupTimer.current);
    lookupTimer.current = setTimeout(async () => {
      let res: LookupResult;
      try {
        res = await lookupCustomer({ phone });
      } catch {
        return;
      }
      if (lookupPhone.current !== phone) return;
      setLookup(res);
      if (res.status === "new") return;
      track("lookup_known", { device: res.status });
      const cur = getCart().draft;
      const patch: Partial<Draft> = {};
      if (!cur.name.trim()) patch.name = res.status === "self" ? res.name : res.greetingName;
      if (res.status === "self") {
        if (cur.zoneId === null && res.zoneId !== null) patch.zoneId = res.zoneId;
        if (!cur.addressText.trim() && res.addressText) {
          patch.addressText = res.addressText;
          if (res.lat !== null && res.lng !== null) Object.assign(patch, { lat: res.lat, lng: res.lng, accuracy: null });
        }
      }
      if (res.requiresPrepay) {
        setPrepay(true);
        patch.paymentMethod = "transfer";
      }
      if (Object.keys(patch).length > 0) dispatch({ type: "draft", patch });
    }, LOOKUP_DEBOUNCE_MS);
  }

  function changePhone(raw: string) {
    const phone = formatPhoneInput(raw);
    set({ phone });
    const normalized = normalizePhone(phone) ?? "";
    if (normalized === lookupPhone.current) return;
    lookupPhone.current = "";
    clearTimeout(lookupTimer.current);
    setLookup(null);
    setSavedChoice(null);
    setPrepay(false);
    if (normalized) runLookup(normalized);
  }

  useEffect(() => {
    startedAt.current = Date.now();
    // Ví mã của khách đăng nhập (M12) — chip một chạm. Lỗi/khách vãng lai → không hiện.
    myVouchers().then(setWallet, () => {});
  }, []);

  useEffect(() => {
    // Nháp còn SĐT từ lần trước → tra luôn để tự điền (cookie "ghi nhớ") hoặc chào khách cũ.
    const phone = normalizePhone(getCart().draft.phone);
    if (phone) runLookup(phone);
    return () => clearTimeout(lookupTimer.current);
  }, []);

  if (success) return <OrderSuccess result={success} onDone={onClose} />;

  const set = (patch: Partial<Draft>) => dispatch({ type: "draft", patch });
  const zone = zones.find((z) => z.id === d.zoneId) ?? null;
  const gift = pickup?.giftProductId ? byId.get(pickup.giftProductId) : undefined;
  // Cà phê chỉ giao tận nơi (M12).
  const isPickup = !cafe && d.fulfillment === "pickup" && pickup !== null;

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
    discount: promo?.amount,
  });
  const subtotal = priced.ok ? priced.subtotal : lines.reduce((s, l) => s + l.lineTotal, 0);
  const shipFee = priced.ok && (isPickup || zone) ? priced.shipFee : null;
  const discount = priced.ok ? priced.discount : 0;
  const total = subtotal - discount + (shipFee ?? 0);
  const belowCafeMin = cafe && subtotal < CAFE_MIN_SUBTOTAL;
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
  // Nước lạnh có thẻ riêng (thấy rõ giá kèm); sốt chấm giữ hàng chip gợi ý.
  const drinkSuggestions = suggestions.filter((p) => p.kind === "drink");
  const sauceSuggestions = suggestions.filter((p) => p.kind !== "drink");
  const hasDrink = lines.some((l) => l.product.kind === "drink" || l.addons.some((a) => a.product.kind === "drink"));

  const known = lookup?.status === "known" ? lookup : null;
  const savedToken = !isPickup && savedChoice === "saved" ? (known?.savedAddressToken ?? null) : null;
  const fields = { ...d, fulfillment: isPickup ? ("pickup" as const) : ("delivery" as const), savedAddress: savedToken !== null };
  const clientErrors = checkFields(fields);
  const errorOf = (f: FieldKey): CheckoutErrorKey | undefined =>
    (submitted || touched.has(f) ? clientErrors[f] : undefined) ?? serverErrors[f];
  const blur = (f: FieldKey) => setTouched((s) => (s.has(f) ? s : new Set(s).add(f)));

  const canSubmit = lines.length > 0 && slot !== null && fitsSlot && unavailableIds.size === 0 && !belowCafeMin && !pending;

  async function applyPromo(raw: string) {
    const code = raw.trim();
    if (!code) return;
    setPromoBusy(true);
    setPromoErr(null);
    try {
      const r = await checkPromo({ code, phone: d.phone, subtotal });
      if (r.ok) {
        setPromo({ code: r.code, amount: r.amount });
        set({ promo: r.code });
        track("promo_applied", { amount: r.amount });
      } else {
        setPromo(null);
        setPromoErr(promoMessage(r.reason, r.minSubtotal));
      }
    } catch {
      setPromoErr(t.promoErrors.not_found);
    } finally {
      setPromoBusy(false);
    }
  }
  function clearPromo() {
    setPromo(null);
    setPromoErr(null);
    set({ promo: "" });
  }

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
            : savedToken
              ? { type: "delivery", zoneId: d.zoneId ?? 0, savedAddressToken: savedToken }
              : {
                  type: "delivery",
                  zoneId: d.zoneId ?? 0,
                  addressText: d.addressText.trim(),
                  ...(d.lat !== null && d.lng !== null ? { lat: d.lat, lng: d.lng } : {}),
                },
          paymentMethod: d.paymentMethod,
          note: d.note.trim() || undefined,
          promoCode: promo?.code,
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
        track("place_order", { total: res.total, payment: res.payment.method, status: res.status });
        navigator.vibrate?.(20);
        void refreshOven();
        return;
      }
      setServerErrors(res.reason === "invalid" ? res.fieldErrors : {});
      // Token địa chỉ cũ hết hạn (30 phút) → mở lại ô mô tả nhà.
      if (res.reason === "invalid" && res.fieldErrors.address && savedToken) setSavedChoice("other");
      if (res.reason === "promo") {
        setPromo(null);
        setPromoErr(promoMessage(res.promo, res.minSubtotal));
      }
      if (res.reason === "prepay_required") {
        setPrepay(true);
        set({ paymentMethod: "transfer" });
      }
      setFailure({ ...res, at: target.readyLabel });
      if (res.reason === "slot_full" || res.reason === "cutoff_passed") {
        track("slot_full", { reason: res.reason });
        void refreshOven();
      }
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

      {!cafe && !hasDrink && drinkSuggestions.length > 0 ? (
        <div className="-mt-2 rounded-3xl bg-elevated/70 p-4">
          <p className="text-[15px] font-semibold">{t.drinksTitle}</p>
          <p className="mt-0.5 text-sm text-secondary">{t.drinksBody}</p>
          <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1">
            {drinkSuggestions.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => dispatch({ type: "add", item: { productId: p.id, qty: 1, addons: [] } })}
                className="min-h-11 shrink-0 rounded-full bg-surface px-3 text-sm shadow-sm"
              >
                + {p.name} <span className="font-semibold tabular-nums">{Math.round(p.price / 1000)}k</span>
                {p.listPrice && p.listPrice > p.price ? (
                  <s className="ml-1 text-secondary tabular-nums">{Math.round(p.listPrice / 1000)}k</s>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {sauceSuggestions.length > 0 ? (
        <div className="-mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="shrink-0 text-xs text-secondary">{t.suggest}:</span>
          {sauceSuggestions.map((p) => (
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

      {belowCafeMin ? (
        <p role="status" className="rounded-field border border-warn/50 px-3 py-2.5 text-sm">
          {t.cafeMin(formatPrice(CAFE_MIN_SUBTOTAL), formatPrice(CAFE_MIN_SUBTOTAL - subtotal))}
        </p>
      ) : null}

      {/* Mẻ */}
      <Section title={cafe ? t.cafeWindow : t.receiveAt}>
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
            onChange={(e) => changePhone(e.target.value)}
            onBlur={() => blur("phone")}
            placeholder="0912 345 678"
            className="input tabular-nums"
            aria-invalid={!!errorOf("phone")}
            aria-describedby={errorOf("phone") ? `${fieldId("phone")}-err` : undefined}
          />
        </Field>
        {known ? (
          <div className="-mt-1 rounded-field bg-elevated px-3 py-2.5 text-sm" role="status">
            <p>
              {t.welcomeBack(known.greetingName)}
              {!isPickup && known.savedAddressToken && known.zoneName && savedChoice === null ? ` ${t.deliverToLast(known.zoneName)}` : ""}
            </p>
            {!isPickup && known.savedAddressToken && known.zoneName && savedChoice === null ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSavedChoice("saved");
                    if (known.zoneId !== null) set({ zoneId: known.zoneId });
                  }}
                  className="min-h-11 rounded-full bg-invert px-4 font-semibold text-on-invert"
                >
                  {t.useSaved}
                </button>
                <button type="button" onClick={() => setSavedChoice("other")} className="min-h-11 rounded-full border border-line px-4 font-medium">
                  {t.otherAddress}
                </button>
              </div>
            ) : null}
          </div>
        ) : lookup?.status === "self" ? (
          <p className="-mt-1 text-sm text-secondary" role="status">
            {t.welcomeBack(lookup.name.trim().split(/\s+/).pop() ?? "")} {t.filledFromLast}
          </p>
        ) : null}
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
          {pickup && !cafe ? (
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
            {savedToken && known?.zoneName ? (
              <div className="flex min-h-11 items-center justify-between gap-2 rounded-field border border-line px-3 py-1.5 text-sm">
                <span>📍 {t.savedAddress(known.zoneName)}</span>
                <button type="button" onClick={() => setSavedChoice("other")} className="min-h-11 shrink-0 px-2 text-secondary underline">
                  {t.otherAddress}
                </button>
              </div>
            ) : (
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
            )}
            {savedToken ? null : d.lat !== null ? (
              <p className="flex min-h-11 items-center gap-2 text-sm text-live">
                📍 {d.accuracy !== null ? t.pinned(d.accuracy) : t.pinnedBefore}
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
            <label key={m} className={`flex min-h-11 items-center gap-3 text-[15px] ${prepay && m === "cod" ? "opacity-50" : "cursor-pointer"}`}>
              <input
                type="radio"
                name="payment"
                checked={d.paymentMethod === m}
                disabled={prepay && m === "cod"}
                onChange={() => set({ paymentMethod: m })}
                className="size-5 accent-[var(--accent)]"
              />
              {m === "cod" ? t.cod : t.transfer}
            </label>
          ))}
        </div>
        {prepay ? <p className="mt-1 text-sm text-secondary">{t.prepayNote}</p> : null}
      </Section>

      {/* Mã ưu đãi (M12) */}
      <Section title={t.promo}>
        {promo ? (
          <div className="flex min-h-12 items-center justify-between gap-2 rounded-field border border-live/50 px-3 py-1.5 text-sm">
            <span>
              🎟 <span className="font-semibold tracking-wider">{promo.code}</span> · {t.promoApplied(formatPrice(promo.amount))}
            </span>
            <button type="button" onClick={clearPromo} className="min-h-11 shrink-0 px-2 text-secondary underline">
              {t.promoRemove}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <label htmlFor="co-promo" className="sr-only">
              {t.promo}
            </label>
            <input
              id="co-promo"
              value={d.promo}
              maxLength={24}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                set({ promo: e.target.value.toUpperCase() });
                setPromoErr(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void applyPromo(d.promo);
                }
              }}
              placeholder={t.promoPlaceholder}
              className="input flex-1 tracking-wider uppercase placeholder:normal-case placeholder:tracking-normal"
              aria-invalid={!!promoErr}
              aria-describedby={promoErr ? "co-promo-err" : undefined}
            />
            <button
              type="button"
              onClick={() => void applyPromo(d.promo)}
              disabled={promoBusy || !d.promo.trim()}
              className="min-h-12 shrink-0 rounded-full bg-elevated px-5 text-sm font-semibold disabled:opacity-40"
            >
              {promoBusy ? "…" : t.promoApply}
            </button>
          </div>
        )}
        {promoErr ? (
          <p id="co-promo-err" role="alert" className="mt-1.5 text-sm text-danger">
            {promoErr}
          </p>
        ) : null}
        {!promo && wallet?.vouchers.length ? (
          <div className="no-scrollbar -mx-1 mt-2 flex gap-2 overflow-x-auto px-1">
            {wallet.vouchers.map((v) => (
              <button
                key={v.code}
                type="button"
                onClick={() => {
                  set({ promo: v.code });
                  void applyPromo(v.code);
                }}
                className="min-h-11 shrink-0 rounded-full border border-dashed border-accent px-3 text-sm"
              >
                🎟 −{Math.round(v.amount / 1000)}k <span className="text-secondary">· {t.promoMin(Math.round(v.minSubtotal / 1000))}</span>
              </button>
            ))}
          </div>
        ) : null}
        {wallet && !wallet.signedIn ? (
          <p className="mt-2 text-xs text-secondary">
            {t.memberNudge}{" "}
            <a href="/tai-khoan" className="font-medium text-text underline underline-offset-4">
              {t.memberLink}
            </a>
          </p>
        ) : null}
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
        <p className="text-xs text-secondary">
          {t.policyPrefix}{" "}
          <a href="/chinh-sach" target="_blank" className="underline underline-offset-4 hover:text-text">
            {t.policyLink}
          </a>
          .
        </p>
      </div>

      {/* Honeypot — người thật không thấy */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="co-website">Website</label>
        <input id="co-website" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      {/* Chốt */}
      <div className="sticky bottom-0 -mx-5 mt-6 space-y-2 border-t border-line bg-surface/95 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <FailureBanner failure={failure} onPick={retryAt} onRetry={() => submit()} onZalo={zaloFallback} />
        <p className="flex flex-wrap justify-between gap-x-3 text-sm text-secondary tabular-nums">
          <span>
            {t.subtotal} {formatPrice(subtotal)}
          </span>
          {discount > 0 ? (
            <span className="text-live">
              {t.discount} −{formatPrice(discount)}
            </span>
          ) : null}
          <span>
            {t.ship} {shipFee === null ? t.shipPending : formatPrice(shipFee)}
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
            (cafe ? t.submitCafe : t.submit)(slot?.readyLabel ?? "", formatPrice(total))
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

function promoMessage(reason: PromoError | "rate_limited", min?: number): string {
  if (reason === "min_subtotal") return t.promoErrors.min_subtotal(formatPrice(min ?? 0));
  return t.promoErrors[reason];
}

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
                  {s.readyLabel} · {s.segment === "cafe" ? copy.slot.open : copy.slot.left(s.remainingPan)}
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
    case "promo":
      return (
        <p role="alert" className={`${box} border-warn/50`}>
          {t.promoFailed}
        </p>
      );
    case "prepay_required":
      return (
        <p role="alert" className={`${box} border-warn/50`}>
          {t.prepayNote}
        </p>
      );
    default:
      return (
        <div role="alert" className={`${box} border-danger/50`}>
          <p>{failure.reason === "rate_limited" ? t.rateLimited : failure.reason === "contact_us" ? t.contactUs : t.failed}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {failure.reason === "server_error" ? (
              <button type="button" onClick={onRetry} className="min-h-11 rounded-full bg-invert px-4 font-semibold text-on-invert">
                {t.retry}
              </button>
            ) : null}
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
