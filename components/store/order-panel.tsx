"use client";

import { useOrder } from "@/components/store/use-order";
import { copy } from "@/data/copy";
import { openSheet } from "@/lib/client/sheet-url";
import { formatPrice } from "@/lib/format";

const t = copy.landing.order;
const SHOW = 4;

/** Khung "Đơn của bạn" trong khu Đặt hàng: tóm tắt giỏ + mẻ đang chọn → mở sheet Chốt đơn (cùng luồng với CartBar). */
export function OrderPanel() {
  const { lines, count, subtotal, slot } = useOrder();

  return (
    <aside aria-labelledby="order-basket" className="flex flex-col rounded-tile bg-invert p-6 text-on-invert sm:p-7">
      <h3 id="order-basket" className="flex items-baseline justify-between font-mono text-[12px] tracking-[0.16em] uppercase">
        {t.basket}
        <span className="tabular-nums opacity-60">{count}</span>
      </h3>

      {count === 0 ? (
        <>
          <p className="mt-5 flex-1 text-[15px] leading-relaxed opacity-75">{t.empty}</p>
          <a
            href="#thuc-don"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-full border border-current/25 px-6 font-semibold transition active:scale-[0.98]"
          >
            {t.pick} ↑
          </a>
        </>
      ) : (
        <>
          <ul className="mt-5 flex-1 space-y-2 text-[15px]">
            {lines.slice(0, SHOW).map((l) => (
              <li key={l.item.key} className="flex gap-3">
                <span className="w-6 shrink-0 tabular-nums opacity-60">{l.item.qty}×</span>
                <span className="min-w-0 flex-1 truncate">{l.product.name}</span>
                <span className="tabular-nums">{formatPrice(l.lineTotal)}</span>
              </li>
            ))}
            {lines.length > SHOW ? <li className="opacity-60">{t.more(lines.length - SHOW)}</li> : null}
          </ul>
          <dl className="mt-5 space-y-1 border-t border-current/15 pt-4 text-[15px]">
            {slot ? (
              <div className="flex justify-between">
                <dt className="opacity-60">{t.at}</dt>
                <dd className="font-semibold tabular-nums">{slot.readyLabel}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="opacity-60">{t.subtotal}</dt>
              <dd className="font-semibold tabular-nums">{formatPrice(subtotal)}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => openSheet({ buoc: "chot-don" })}
            className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-accent px-6 font-semibold text-on-accent transition hover:brightness-110 active:scale-[0.98]"
          >
            {t.checkout} ›
          </button>
        </>
      )}
    </aside>
  );
}
