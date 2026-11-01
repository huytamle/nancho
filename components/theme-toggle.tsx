"use client";

import { useSyncExternalStore } from "react";

// Sáng/tối (M12). Script đầu trang (app/layout.tsx) đặt `data-theme` trước khi vẽ → không nháy.
// Chưa chọn thì theo máy; chọn rồi thì nhớ trong localStorage `th_theme`.

export const THEME_KEY = "th_theme";

/** Chạy inline trong <head>: chọn theme trước lần vẽ đầu. */
// Khu bếp/vận hành (/admin) luôn tối: thiết kế cho màn hình bếp, nhãn trạng thái chỉ kiểm tương phản trên nền tối.
export const themeScript = `try{var t=location.pathname.indexOf("/admin")===0?"dark":localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}`;

type Theme = "light" | "dark";
const listeners = new Set<() => void>();
const read = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, read, () => "dark" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";

  function toggle() {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
    listeners.forEach((l) => l());
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={next === "light" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full text-text transition hover:bg-elevated active:scale-95 ${className}`}
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        </svg>
      )}
    </button>
  );
}
