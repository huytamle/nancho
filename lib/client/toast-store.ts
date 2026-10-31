// Toast một-dòng (§9.3, §9.4): một toast tại một thời điểm, tự ẩn sau 3 s, có thể kèm 1 hành động.

import { useSyncExternalStore } from "react";

export type Toast = { id: number; text: string; action?: { label: string; run: () => void } };

let toast: Toast | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showToast(text: string, action?: Toast["action"]) {
  clearTimeout(timer);
  toast = { id: nextId++, text, action };
  emit();
  timer = setTimeout(dismissToast, action ? 4500 : 2500);
}

export function dismissToast() {
  clearTimeout(timer);
  toast = null;
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useToast(): Toast | null {
  return useSyncExternalStore(subscribe, () => toast, () => null);
}
