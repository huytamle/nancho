// Đồng hồ chung theo giờ server (đã bù lệch). Mỗi bước (1 s / 30 s) một bộ đếm, chỉ chạy khi có người nghe.
// Trả 0 khi render trên server/hydrate → component hiển thị nhãn tĩnh, không lệch hydrate.

import { useSyncExternalStore } from "react";
import { serverNowMs } from "@/lib/client/oven-store";

type Clock = { subscribe: (l: () => void) => () => void; get: () => number };
const clocks = new Map<number, Clock>();

function clockFor(step: number): Clock {
  const existing = clocks.get(step);
  if (existing) return existing;
  const listeners = new Set<() => void>();
  let now = 0;
  let id: ReturnType<typeof setInterval> | undefined;
  const clock: Clock = {
    subscribe(l) {
      listeners.add(l);
      if (!id) {
        now = serverNowMs();
        id = setInterval(() => {
          now = serverNowMs();
          listeners.forEach((fn) => fn());
        }, step);
      }
      return () => {
        listeners.delete(l);
        if (listeners.size === 0) {
          clearInterval(id);
          id = undefined;
        }
      };
    },
    get: () => now,
  };
  clocks.set(step, clock);
  return clock;
}

export function useClock(stepMs: number): number {
  const c = clockFor(stepMs);
  return useSyncExternalStore(c.subscribe, c.get, () => 0);
}
