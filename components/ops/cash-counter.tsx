"use client";

import { opsCopy } from "@/data/copy-ops";
import { countTotal, DENOMINATIONS, type CashCounts } from "@/lib/domain/cash";
import { formatPrice } from "@/lib/format";

const t = opsCopy;
const label = (d: number) => new Intl.NumberFormat("vi-VN").format(d);

/** Đếm tiền theo mệnh giá (§17.3): một ô số tờ cho mỗi mệnh giá, tổng cộng dồn. Bàn phím số trên điện thoại. */
export function CashCounter({ id, value, onChange }: { id: string; value: CashCounts; onChange: (v: CashCounts) => void }) {
  return (
    <div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-2">
        {DENOMINATIONS.map((d) => {
          const key = `${d}` as const;
          const n = value[key] ?? 0;
          return (
            <li key={d} className="flex items-center gap-2">
              <label htmlFor={`${id}-${d}`} className="w-[4.5rem] shrink-0 text-right text-[15px] font-semibold tabular-nums">
                {label(d)}
              </label>
              <input
                id={`${id}-${d}`}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                aria-label={t.countLabel(label(d))}
                value={n === 0 ? "" : String(n)}
                placeholder="0"
                onChange={(e) => {
                  const v = Number(e.target.value.replace(/\D/g, "").slice(0, 5));
                  const next = { ...value };
                  if (v > 0) next[key] = v;
                  else delete next[key];
                  onChange(next);
                }}
                className="input min-h-11 min-w-0 text-center tabular-nums"
              />
            </li>
          );
        })}
      </ul>
      <p className="mt-3 flex items-baseline justify-between rounded-2xl bg-elevated px-4 py-3">
        <span className="text-secondary">{t.total}</span>
        <output htmlFor={DENOMINATIONS.map((d) => `${id}-${d}`).join(" ")} className="text-2xl font-bold tabular-nums" data-testid={`${id}-total`}>
          {formatPrice(countTotal(value))}
        </output>
      </p>
    </div>
  );
}
