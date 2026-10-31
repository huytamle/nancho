"use client";

import { createContext, use, useEffect, useState, useTransition } from "react";
import { copy, type KitchenTab } from "@/data/copy";
import type { AdminResult } from "@/lib/admin-contract";
import { showToast } from "@/lib/client/toast-store";
import type { StaffRole } from "@/lib/domain/order-status";
import type { KitchenDay } from "@/lib/server/dal/kitchen";

// Trạng thái dùng chung của Kitchen Dashboard: dữ liệu ngày (từ server), nhân viên, điều hướng tab.

export type KitchenCtx = {
  day: KitchenDay;
  role: StaffRole;
  goTo: (tab: KitchenTab, opts?: { batchId?: number }) => void;
  openOrder: (id: string) => void;
  openQuickOrder: () => void;
};

export const KitchenContext = createContext<KitchenCtx | null>(null);

export function useKitchen(): KitchenCtx {
  const ctx = use(KitchenContext);
  if (!ctx) throw new Error("useKitchen cần KitchenContext");
  return ctx;
}

/** Gọi một action admin; lỗi → toast tiếng Việt. Trả kết quả để caller xử lý thêm. */
export function useAdminAction() {
  const [pending, startTransition] = useTransition();
  function run<R extends AdminResult>(
    fn: () => Promise<R>,
    okText?: string | ((r: Extract<R, { ok: true }>) => string),
    after?: (r: Extract<R, { ok: true }>) => void,
  ) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        showToast(copy.admin.errors[(res as Extract<AdminResult, { ok: false }>).reason]);
        return;
      }
      const ok = res as Extract<R, { ok: true }>;
      if (okText) showToast(typeof okText === "string" ? okText : okText(ok));
      after?.(ok);
    });
  }
  return { pending, run };
}

/** Giờ máy, nhích mỗi `stepMs` (chỉ dùng cho nhãn "x giây trước"/đếm ngược). 0 trước khi hydrate. */
export function useNow(stepMs: number): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, stepMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [stepMs]);
  return now;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(copy.admin.copied);
  } catch {
    showToast(copy.admin.errors.server_error);
  }
}

// ── Âm "ding" khi có đơn mới (§10.1): trình duyệt chỉ cho phát sau lần chạm đầu → mở khoá AudioContext lúc đó ──

let audio: AudioContext | null = null;

export function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    audio = null;
  }
}

export function ding() {
  if (!audio || audio.state !== "running") return;
  const t0 = audio.currentTime;
  for (const [i, freq] of [880, 1320].entries()) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.4, t0 + i * 0.18 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.18 + 0.35);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0 + i * 0.18);
    osc.stop(t0 + i * 0.18 + 0.4);
  }
}

export const telHref = (phone: string) => `tel:${phone}`;
export const zaloHref = (phone: string) => `https://zalo.me/${phone}`;
export const mapsHref = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
