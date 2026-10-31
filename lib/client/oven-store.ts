// Trạng thái lò phía client (§9.3): nhận snapshot stream từ server, poll `/api/oven` mỗi 30 s khi tab hiển thị,
// gọi lại ngay khi quay lại tab / chạm giờ chốt. Đồng hồ bù lệch: offset = serverNow − Date.now().

import { useSyncExternalStore } from "react";
import type { OvenSnapshot } from "@/lib/domain/oven-status";

export type { OvenSnapshot };

type State = { snap: OvenSnapshot | null; offset: number; error: boolean };

let state: State = { snap: null, offset: 0, error: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setSnapshot(snap: OvenSnapshot) {
  state = { snap, offset: Date.parse(snap.serverNow) - Date.now(), error: false };
  emit();
}

let inflight: Promise<void> | null = null;

export function refreshOven(): Promise<void> {
  inflight ??= fetch("/api/oven", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<OvenSnapshot>) : Promise.reject(new Error(String(r.status)))))
    .then(setSnapshot, () => {
      state = { ...state, error: true };
      emit();
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Bắt đầu poll; trả hàm dừng. */
export function startPolling(intervalMs = 30_000): () => void {
  const tick = () => {
    if (document.visibilityState === "visible") void refreshOven();
  };
  const id = window.setInterval(tick, intervalMs);
  document.addEventListener("visibilitychange", tick);
  window.addEventListener("focus", tick);
  return () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", tick);
    window.removeEventListener("focus", tick);
  };
}

/** Giờ server ước tính (ms). */
export function serverNowMs(): number {
  return Date.now() + state.offset;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const NONE: State = { snap: null, offset: 0, error: false };

export function useOven(): State {
  return useSyncExternalStore(subscribe, () => state, () => NONE);
}
