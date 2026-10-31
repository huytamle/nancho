"use client";

import { useEffect, useState } from "react";
import { LanguageToggle } from "@/components/language-toggle";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useLanguage } from "@/components/language-provider";
import { site } from "@/data/site";

export function Header() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const nav = [
    { href: "#menu", label: t.nav.menu },
    { href: "#delivery", label: t.nav.delivery },
    { href: "#khong-gian", label: t.nav.space },
    { href: "#den-quan", label: t.nav.visit },
  ];

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-header text-text backdrop-blur-xl">
      <a
        href="#noi-dung"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-full focus:bg-invert focus:px-3 focus:py-2 focus:text-on-invert"
      >
        {t.skip}
      </a>
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 md:px-8">
        <a href="#top" aria-label={site.name}>
          <Logo compact priority />
        </a>

        <div className="flex items-center gap-2">
          <nav className="hidden items-center gap-5 text-[13px] md:flex xl:gap-7" aria-label={t.navAria}>
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="relative pb-0.5 text-secondary transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] after:absolute after:bottom-0 after:left-1/2 after:h-px after:w-0 after:-translate-x-1/2 after:bg-current after:transition-[width] after:duration-500 after:ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-text hover:after:w-full"
              >
                {item.label}
              </a>
            ))}
            <a
              href="#dat-ban"
              className="group relative inline-flex items-center overflow-hidden rounded-full bg-invert px-4 py-1.5 text-[13px] font-medium text-on-invert shadow-[0_1px_0_color-mix(in_srgb,var(--invert)_35%,transparent)] transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:scale-[1.04] hover:shadow-[0_10px_28px_color-mix(in_srgb,var(--invert)_22%,transparent)] active:translate-y-0 active:scale-[0.98] active:duration-150"
            >
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--on-invert)_22%,transparent)] to-transparent transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-full" />
              <span className="relative">{t.book}</span>
            </a>
          </nav>

          <LanguageToggle />
          <ThemeToggle />

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line md:hidden"
            aria-expanded={open}
            aria-controls="menu-mobile"
            onClick={() => setOpen((value) => !value)}
          >
            <span className="sr-only">{open ? t.closeMenu : t.openMenu}</span>
            <span className="relative block h-3.5 w-4">
              <span
                className={`absolute left-0 block h-0.5 w-4 bg-text transition ${open ? "top-1.5 rotate-45" : "top-0"}`}
              />
              <span
                className={`absolute left-0 top-1.5 block h-0.5 w-4 bg-text transition ${open ? "opacity-0" : ""}`}
              />
              <span
                className={`absolute left-0 block h-0.5 w-4 bg-text transition ${open ? "top-1.5 -rotate-45" : "top-3"}`}
              />
            </span>
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="menu-mobile"
          className="border-t border-line bg-bg px-4 py-6 md:hidden"
          aria-label={t.navMobile}
        >
          <ul className="flex flex-col">
            {nav.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="block py-3 text-2xl font-semibold tracking-tight"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <a
            href="#dat-ban"
            className="group relative mt-6 inline-flex items-center justify-center overflow-hidden rounded-full bg-invert px-5 py-2.5 text-sm font-medium text-on-invert shadow-[0_1px_0_color-mix(in_srgb,var(--invert)_35%,transparent)] transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:scale-[1.04] hover:shadow-[0_10px_28px_color-mix(in_srgb,var(--invert)_22%,transparent)]"
            onClick={() => setOpen(false)}
          >
            <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--on-invert)_22%,transparent)] to-transparent transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-full" />
            <span className="relative">{t.book}</span>
          </a>
          <a
            href={site.phoneHref}
            className="mt-5 inline-block text-sm text-secondary"
            onClick={() => setOpen(false)}
          >
            {t.hotline} {site.phoneDisplay}
          </a>
        </nav>
      ) : null}
    </header>
  );
}
