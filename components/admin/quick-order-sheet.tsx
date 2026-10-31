"use client";

import { useState, useTransition } from "react";
import { createQuickOrder } from "@/app/actions/admin";
import { useKitchen } from "@/components/admin/use-admin";
import { Sheet } from "@/components/ui/sheet";
import { Stepper } from "@/components/ui/stepper";
import { copy } from "@/data/copy";
import type { QuickOrderInput } from "@/lib/admin-contract";
import { showToast } from "@/lib/client/toast-store";
import { formatPhoneInput } from "@/lib/domain/phone";
import { formatPrice } from "@/lib/format";
import { kitchenName } from "@/lib/kitchen-text";
import type { KitchenProduct } from "@/lib/server/dal/kitchen";

const t = copy.admin.quick;
const CHANNELS = ["phone", "zalo", "walkin"] as const;

type Line = { key: number; productId: string; qty: number; choices: Record<string, string>; addons: string[] };

export function QuickOrderSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Đổi `key` mỗi lần mở → form sạch + idempotencyKey mới.
  const [session, setSession] = useState(0);
  return (
    <Sheet
      open={open}
      onClose={() => {
        onClose();
        setSession((n) => n + 1);
      }}
      title={t.title}
      closeLabel={copy.admin.detail.close}
      snap="tall"
    >
      <QuickForm
        key={session}
        onDone={() => {
          onClose();
          setSession((n) => n + 1);
        }}
      />
    </Sheet>
  );
}

const chip = (on: boolean) => `chip min-h-11 rounded-full px-4 text-sm font-semibold ${on ? "bg-invert text-on-invert" : "bg-elevated text-secondary"}`;

function QuickForm({ onDone }: { onDone: () => void }) {
  const { day, role } = useKitchen();
  const [idem] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [mode, setMode] = useState<"delivery" | "pickup">("delivery");
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [address, setAddress] = useState("");
  const [batchId, setBatchId] = useState<number | null>(null);
  const [payment, setPayment] = useState<"cod" | "transfer">("cod");
  const [note, setNote] = useState("");
  const [override, setOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byId = new Map(day.products.map((p) => [p.id, p]));
  const mains = day.products.filter((p) => p.kind !== "addon" && p.isAvailable);
  const point = day.points[0];
  const zone = day.zones.find((z) => z.id === zoneId);
  const pan = lines.reduce((s, l) => s + (byId.get(l.productId)?.usesPan ?? 0) * l.qty, 0);
  const bbq = lines.reduce((s, l) => s + (byId.get(l.productId)?.usesBbq ?? 0) * l.qty, 0);
  const subtotal = lines.reduce(
    (s, l) => s + (byId.get(l.productId)?.price ?? 0) * l.qty + l.addons.reduce((a, id) => a + (byId.get(id)?.price ?? 0), 0),
    0,
  );
  const shipFee = mode === "delivery" && zone ? zone.shipFee : 0;
  const nowMs = Date.parse(day.serverNow);
  const batches = day.batches.filter(
    (b) =>
      (b.status === "open" || (override && b.status === "closed")) &&
      (override || Date.parse(b.cutoffAt) > nowMs) &&
      b.capPan - b.usedPan >= pan &&
      b.capBbq - b.usedBbq >= bbq,
  );
  const chosen = batches.some((b) => b.id === batchId) ? batchId : null;

  function addLine(p: KitchenProduct) {
    const choices = Object.fromEntries((p.comboConfig ?? []).map((g) => [g.key, g.options[0]]));
    setLines((ls) => [...ls, { key: Date.now() + ls.length, productId: p.id, qty: 1, choices, addons: [] }]);
  }
  const patch = (key: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  function submit() {
    setError(null);
    if (lines.length === 0) return setError(t.empty);
    if (chosen === null) return setError(t.errors.slot_full);
    const input: QuickOrderInput = {
      idempotencyKey: idem,
      batchId: chosen,
      channel,
      overrideCutoff: override,
      lines: lines.map((l) => ({
        productId: l.productId,
        qty: l.qty,
        ...(byId.get(l.productId)?.kind === "combo" ? { comboChoices: l.choices } : {}),
        ...(l.addons.length ? { addons: l.addons.map((productId) => ({ productId, qty: 1 })) } : {}),
      })),
      customer: { phone, name, remember: false },
      fulfillment: mode === "delivery" ? { type: "delivery", zoneId: zoneId ?? 0, addressText: address } : { type: "pickup", pickupPointId: point.id },
      paymentMethod: payment,
      note: note || undefined,
    };
    startTransition(async () => {
      const res = await createQuickOrder(input);
      if (res.ok) {
        showToast(t.done(res.seq, formatPrice(res.total)));
        onDone();
        return;
      }
      setError(res.reason in t.errors ? t.errors[res.reason as keyof typeof t.errors] : t.errors.invalid);
    });
  }

  const label = "mb-1.5 block text-sm font-semibold text-secondary";

  return (
    <div className="space-y-5 pb-6">
      <div>
        <p className={label}>{t.channel}</p>
        <div role="radiogroup" aria-label={t.channel} className="flex gap-2">
          {CHANNELS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={channel === c} onClick={() => setChannel(c)} className={chip(channel === c)}>
              {copy.admin.channel[c]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="q-phone" className={label}>
            {t.phone}
          </label>
          <input id="q-phone" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(formatPhoneInput(e.target.value))} className="input tabular-nums" />
        </div>
        <div>
          <label htmlFor="q-name" className={label}>
            {t.name}
          </label>
          <input id="q-name" autoComplete="off" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className="input" />
        </div>
      </div>

      <div>
        <p className={label}>{t.items}</p>
        <ul className="space-y-2">
          {lines.map((l) => {
            const p = byId.get(l.productId)!;
            return (
              <li key={l.key} className="rounded-2xl bg-elevated p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{kitchenName(p.name)}</span>
                  <div className="flex items-center gap-2">
                    <Stepper size="sm" value={l.qty} max={10} onChange={(qty) => patch(l.key, { qty })} label={p.name} />
                    <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="min-h-11 px-2 text-sm text-secondary underline">
                      {t.remove}
                    </button>
                  </div>
                </div>
                {(p.comboConfig ?? []).map((g) => (
                  <div key={g.key} className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={g.label}>
                    {g.options
                      .filter((id) => byId.get(id)?.isAvailable)
                      .map((id) => (
                        <button key={id} type="button" role="radio" aria-checked={l.choices[g.key] === id} onClick={() => patch(l.key, { choices: { ...l.choices, [g.key]: id } })} className={chip(l.choices[g.key] === id)}>
                          {kitchenName(byId.get(id)!.name)}
                        </button>
                      ))}
                  </div>
                ))}
                {p.upsellIds.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {p.upsellIds
                      .filter((id) => byId.get(id)?.isAvailable)
                      .map((id) => {
                        const on = l.addons.includes(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => patch(l.key, { addons: on ? l.addons.filter((a) => a !== id) : [...l.addons, id] })}
                            className={chip(on)}
                          >
                            + {kitchenName(byId.get(id)!.name)}
                          </button>
                        );
                      })}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          {mains.map((p) => (
            <button key={p.id} type="button" onClick={() => addLine(p)} className="chip min-h-11 rounded-full border border-line px-4 text-sm font-semibold">
              + {kitchenName(p.name)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className={label}>{t.fulfillment}</p>
        <div role="radiogroup" aria-label={t.fulfillment} className="flex flex-wrap gap-2">
          <button type="button" role="radio" aria-checked={mode === "delivery"} onClick={() => setMode("delivery")} className={chip(mode === "delivery")}>
            {t.delivery}
          </button>
          {point ? (
            <button type="button" role="radio" aria-checked={mode === "pickup"} onClick={() => setMode("pickup")} className={chip(mode === "pickup")}>
              {t.pickup(point.name)}
            </button>
          ) : null}
        </div>
        {mode === "delivery" ? (
          <div className="mt-3 space-y-3">
            <label htmlFor="q-zone" className="sr-only">
              {t.zone}
            </label>
            <select
              id="q-zone"
              value={zoneId ?? ""}
              onChange={(e) => setZoneId(e.target.value ? Number(e.target.value) : null)}
              className="input appearance-none bg-[length:12px] bg-[right_1rem_center] bg-no-repeat"
            >
              <option value="">{t.zonePick}</option>
              {day.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} · {formatPrice(z.shipFee)}
                </option>
              ))}
            </select>
            <label htmlFor="q-address" className="sr-only">
              {t.address}
            </label>
            <textarea id="q-address" value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} placeholder={t.address} className="input min-h-20 resize-none py-3" />
          </div>
        ) : null}
      </div>

      <div>
        <p className={label}>{t.batch}</p>
        {role === "owner" ? (
          <label className="mb-2 flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="size-5 accent-[var(--accent)]" />
            {t.override}
          </label>
        ) : null}
        <div role="radiogroup" aria-label={t.batch} className="flex flex-wrap gap-2">
          {batches.length === 0 ? <p className="text-sm text-secondary">{t.errors.slot_full}</p> : null}
          {batches.map((b) => (
            <button key={b.id} type="button" role="radio" aria-checked={chosen === b.id} onClick={() => setBatchId(b.id)} className={`${chip(chosen === b.id)} tabular-nums`}>
              {copy.admin.detail.moveTo(b.readyLabel, b.capPan - b.usedPan)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className={label}>{t.payment}</p>
        <div role="radiogroup" aria-label={t.payment} className="flex gap-2">
          {(["cod", "transfer"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={payment === m} onClick={() => setPayment(m)} className={chip(payment === m)}>
              {m === "cod" ? copy.admin.detail.cod : copy.admin.detail.transfer}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="q-note" className={label}>
          {t.note}
        </label>
        <input id="q-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className="input" />
      </div>

      <div className="space-y-2 border-t border-line pt-4">
        <p className="flex justify-between text-sm text-secondary tabular-nums">
          <span>{t.subtotal}</span>
          <span>{formatPrice(subtotal + shipFee)}</span>
        </p>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="flex h-14 w-full items-center justify-center rounded-full bg-accent text-[17px] font-semibold text-on-accent disabled:opacity-50"
        >
          {pending ? t.saving : t.submit}
        </button>
      </div>
    </div>
  );
}
