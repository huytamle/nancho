"use client";

import { useState } from "react";
import { recordHandover } from "@/app/actions/sale-day";
import { useAdminAction, useKitchen } from "@/components/admin/use-admin";
import { MoneyInput } from "@/components/ops/money-input";
import { copy } from "@/data/copy";
import { vnTimeLabel } from "@/lib/domain/time";
import { formatPrice } from "@/lib/format";
import type { HandoverView } from "@/lib/server/dal/sale-day";

const t = copy.admin.handover;

const diffText = (expected: number, received: number) => {
  const d = received - expected;
  return d === 0 ? "" : d > 0 ? t.over(formatPrice(d)) : t.short(formatPrice(-d));
};

// Bàn giao tiền COD của shipper (§18.4): người nhận đếm mù — chỉ thấy danh sách đơn, nhập số nhận thật;
// số đáng có và độ lệch hiện sau khi lưu.
export function HandoverPanel() {
  const { day, role } = useKitchen();
  const { pending, done } = day.handovers;
  const canReceive = role !== "shipper";
  if (pending.length === 0 && done.length === 0) return null;

  return (
    <section aria-labelledby="ban-giao" className="space-y-3">
      <h2 id="ban-giao" className="text-2xl font-bold">
        💵 {t.title}
      </h2>
      {canReceive && pending.length > 0 ? <p className="text-sm text-secondary">{t.hint}</p> : null}
      {pending.map((g) => (
        <Pending key={g.shipperId} group={g} date={day.date} canReceive={canReceive} />
      ))}
      {done.length > 0 ? (
        <ul className="divide-y divide-line rounded-tile bg-surface px-5">
          {done.map((h) => {
            const diff = diffText(h.expected, h.received);
            return (
              <li key={h.id} className="py-3 text-[15px]">
                <p className="font-semibold">
                  ✅ {h.shipperName} → {h.receiverName} · {vnTimeLabel(new Date(h.at))}
                </p>
                <p className={`text-sm tabular-nums ${diff ? "text-warn" : "text-secondary"}`}>
                  {t.orders(h.orders)} · {t.result(formatPrice(h.expected), formatPrice(h.received), diff)}
                </p>
                {h.note ? <p className="text-sm text-secondary">📝 {h.note}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function Pending({ group: g, date, canReceive }: { group: HandoverView["pending"][number]; date: string; canReceive: boolean }) {
  const { pending, run } = useAdminAction();
  const [text, setText] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const id = `ho-${g.shipperId}`;
  return (
    <article aria-label={`${t.title} · ${g.shipperName}`} className="rounded-tile bg-surface p-5">
      <h3 className="text-lg font-semibold">🛵 {g.shipperName}</h3>
      <p className="text-secondary">{t.orders(g.orders.length)}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {g.orders.map((o) => (
          <li key={o.id} className="rounded-full bg-elevated px-3 py-1 text-sm">
            #{o.seq} {o.name}
          </li>
        ))}
      </ul>
      {canReceive ? (
        <div className="mt-4 space-y-3">
          <MoneyInput id={id} label={t.received} text={text} onText={(v, n) => (setText(v), setAmount(n))} />
          <div>
            <label htmlFor={`${id}-note`} className="mb-1 block text-sm text-secondary">
              {t.note}
            </label>
            <input id={`${id}-note`} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className="input" />
          </div>
          <button
            type="button"
            disabled={pending || amount === null}
            onClick={() =>
              run(
                () => recordHandover({ date, shipperId: g.shipperId, orderIds: g.orders.map((o) => o.id), received: amount!, note: note || undefined }),
                (r) => t.result(formatPrice(r.expected), formatPrice(r.received), diffText(r.expected, r.received)),
              )
            }
            className="min-h-14 w-full rounded-full bg-invert font-semibold text-on-invert disabled:opacity-50"
          >
            {t.save}
          </button>
        </div>
      ) : null}
    </article>
  );
}
