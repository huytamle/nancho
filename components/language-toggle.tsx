"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import type { Lang } from "@/data/i18n";

export function LanguageToggle() {
  const { lang, setLang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function choose(next: Lang) {
    setLang(next);
    setOpen(false);
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t.lang.label}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 min-w-10 cursor-pointer items-center justify-center gap-1 rounded-full border border-line bg-surface px-2.5 text-[11px] font-semibold tracking-wide text-text transition-colors hover:bg-elevated"
      >
        {lang.toUpperCase()}
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 opacity-70" aria-hidden="true">
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-label={t.lang.label}
          className="absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-2xl border border-line bg-surface p-1 shadow-lg"
        >
          {(["vi", "en"] as const).map((code) => (
            <li key={code}>
              <button
                type="button"
                role="option"
                aria-selected={lang === code}
                onClick={() => choose(code)}
                className={`flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                  lang === code ? "bg-elevated text-text" : "text-secondary hover:bg-elevated/70 hover:text-text"
                }`}
              >
                <span>{code === "vi" ? t.lang.vi : t.lang.en}</span>
                {lang === code ? <span aria-hidden="true">✓</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
