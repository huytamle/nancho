"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";

type Theme = "dark" | "light";

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v1.5M12 19.5V21M4.9 4.9l1.1 1.1M18 18l1.1 1.1M3 12h1.5M19.5 12H21M4.9 19.1 6 18M18 6l1.1-1.1" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M16.5 13.2A7 7 0 0 1 10.8 6 6.2 6.2 0 1 0 18 14.5a7 7 0 0 1-1.5-1.3Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ThemeToggle() {
  const { t } = useLanguage();
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("light") ? "light" : "dark");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.classList.toggle("light", next === "light");
    try {
      localStorage.setItem("theheat-theme", next);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? t.theme.toLight : t.theme.toDark}
      className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-text transition-colors hover:bg-elevated"
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
