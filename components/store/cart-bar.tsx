"use client";

import { useOrder } from "@/components/store/use-order";
import { copy } from "@/data/copy";
import { openSheet } from "@/lib/client/sheet-url";
import { formatPrice } from "@/lib/format";

const t = copy.cart;

/** Thanh giỏ nổi, đảo màu kiểu Apple Pay (§9.6). Cam để dành cho nút "Đặt lò". */
export function CartBar() {
  const { count, subtotal, slot } = useOrder();
  if (count === 0) return null;

  return (
    <div className="cart-bar-in fixed inset-x-0 bottom-[calc(12px+env(safe-area-inset-bottom))] z-30 flex justify-center px-4">
      <button
        key={`${count}-${subtotal}`}
        type="button"
        onClick={() => openSheet({ buoc: "chot-don" })}
        aria-label={`${t.open}: ${t.items(count)}${slot ? `, ${t.pickupAt(slot.readyLabel)}` : ""}, ${formatPrice(subtotal)}`}
        className="bump flex h-14 w-full max-w-[480px] items-center gap-3 rounded-full bg-invert pr-2 pl-5 text-on-invert shadow-2xl shadow-black/60 transition active:scale-[0.98]"
      >
        <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
          {t.items(count)}
          {slot ? ` · ${t.pickupAt(slot.readyLabel)}` : ""}
        </span>
        <span className="font-semibold tabular-nums">{formatPrice(subtotal)}</span>
        <span className="inline-flex h-10 items-center rounded-full bg-black px-4 text-sm font-semibold text-white">{t.cta} ›</span>
      </button>
    </div>
  );
}
