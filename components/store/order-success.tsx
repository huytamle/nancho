"use client";

import Link from "next/link";
import { copy } from "@/data/copy";
import { site } from "@/data/site";
import { TransferBox } from "@/components/store/transfer-box";
import type { PlaceOrderResult } from "@/lib/order-contract";

const t = copy.success;

/** Màn thành công trong cùng sheet (§9.8). */
export function OrderSuccess({ result, onDone }: { result: Extract<PlaceOrderResult, { ok: true }>; onDone: () => void }) {
  const pay = result.payment;

  return (
    <div className="flex flex-col items-center pt-4 pb-6 text-center" role="status" aria-live="polite">
      <svg aria-hidden viewBox="0 0 52 52" className="size-16 text-live">
        <circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="3" opacity=".25" />
        <path className="draw-check" d="M15 27l7.5 7.5L37 19" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <h3 className="mt-4 text-xl font-semibold tracking-tight text-balance">{t.title(result.seq, result.readyLabel)}</h3>
      <p className="mt-1.5 text-[15px] text-secondary">
        {result.dayLabel} · {result.etaLabel}
      </p>
      <p className="mt-1 text-sm text-secondary tabular-nums">{result.code}</p>

      {pay.method === "transfer" ? <TransferBox info={pay} className="mt-5 w-full" /> : null}

      <div className="mt-6 flex w-full flex-col gap-2">
        {result.trackingPath !== "/" ? (
          <Link
            href={result.trackingPath}
            // Bỏ `?buoc=chot-don` khỏi lịch sử: Back từ trang theo dõi về thẳng "/" thay vì sheet trống.
            onClick={() => window.history.replaceState(null, "", "/")}
            className="inline-flex h-12 items-center justify-center rounded-full bg-invert font-semibold text-on-invert"
          >
            {t.track}
          </Link>
        ) : null}
        <a href={site.contact.zaloHref} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center justify-center rounded-full bg-elevated font-medium">
          {t.zalo}
        </a>
        <button type="button" onClick={onDone} className="h-12 rounded-full font-medium text-secondary hover:text-text">
          {t.done}
        </button>
      </div>
      <p className="mt-3 text-xs text-secondary">{t.cancelNote(result.cutoffLabel, result.dayLabel.toLowerCase())}</p>
    </div>
  );
}
