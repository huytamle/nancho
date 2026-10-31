"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cancelOrderByToken } from "@/app/actions/order";
import { copy } from "@/data/copy";
import { track } from "@/lib/client/analytics";
import { dispatch } from "@/lib/client/cart-store";
import type { OrderView } from "@/lib/server/dal/orders";

const t = copy.receipt;
const POLL_MS = 30_000;

/** Đơn chưa xong → làm mới mỗi 30 s khi tab đang mở, và ngay khi quay lại tab (§5.3). */
export function LiveRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [active, router]);
  return null;
}

export function CancelOrder({ token, cutoffLabel }: { token: string; cutoffLabel: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cancel() {
    setError(null);
    startTransition(async () => {
      let res;
      try {
        res = await cancelOrderByToken({ token });
      } catch {
        res = { ok: false as const, reason: "not_found" as const };
      }
      if (res.ok) {
        track("cancel_order");
        navigator.vibrate?.(20);
        router.refresh();
        return;
      }
      setError(res.reason === "too_late" ? t.cancelTooLate : t.cancelFailed);
      if (res.reason === "too_late") router.refresh();
    });
  }

  return (
    <div className="mt-2 text-center">
      {confirming ? (
        <div role="alertdialog" aria-labelledby="cancel-q" className="rounded-field border border-line p-3 text-left text-sm">
          <p id="cancel-q">{t.cancelConfirm}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="h-11 rounded-full bg-elevated font-medium">
              {t.cancelNo}
            </button>
            <button type="button" onClick={cancel} disabled={pending} className="h-11 rounded-full border border-danger font-semibold text-danger">
              {pending ? t.cancelling : t.cancelYes}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="h-11 px-4 text-sm font-medium text-secondary underline underline-offset-4 hover:text-text">
          {t.cancel}
        </button>
      )}
      <p className="mt-1 text-xs text-secondary">{t.cancelUntil(cutoffLabel)}</p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Thêm lại các món của đơn vào giỏ rồi mở "Chốt đơn" — giá & suất tính lại theo hôm nay. */
export function Reorder({ lines, label = t.reorder }: { lines: OrderView["reorder"]; label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        for (const l of lines) dispatch({ type: "add", item: l });
        router.push("/?buoc=chot-don");
      }}
      className="inline-flex h-12 items-center justify-center rounded-full bg-accent font-semibold text-on-accent"
    >
      {label}
    </button>
  );
}
