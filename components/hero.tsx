"use client";

import Image from "next/image";
import { HeroGallery } from "@/components/hero-gallery";
import { useLanguage } from "@/components/language-provider";
import { site } from "@/data/site";

export function Hero() {
  const { t } = useLanguage();

  return (
    <section id="top" className="bg-bg">
      <div className="mx-auto flex min-h-[88svh] max-w-6xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6 md:px-8">
        <p className="text-[11px] font-medium tracking-[0.28em] text-secondary uppercase">
          {t.hero.location}
        </p>
        <Image
          src="/images/brand/logo-lockup.jpg"
          alt={`${site.name} — ${site.tagline}`}
          width={1200}
          height={675}
          priority
          className="mt-4 hidden w-full max-w-xl object-contain dark:block"
        />
        <div className="mt-6 block dark:hidden">
          <p className="text-4xl font-semibold tracking-[0.18em] sm:text-5xl">
            {site.name}
          </p>
          <p className="mt-3 text-[11px] tracking-[0.22em] text-secondary uppercase">
            {site.tagline}
          </p>
        </div>
        <p className="mt-4 max-w-md text-[17px] leading-relaxed text-secondary">
          {t.hero.lead}
        </p>
        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <a
            href="#menu"
            className="inline-flex h-11 items-center justify-center rounded-full bg-invert px-6 text-sm font-medium text-on-invert transition-opacity hover:opacity-80"
          >
            {t.viewMenu}
          </a>
          <a
            href="#dat-ban"
            className="inline-flex h-11 items-center justify-center rounded-full border border-line px-6 text-sm font-medium text-text transition-colors hover:bg-elevated"
          >
            {t.book}
          </a>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 md:px-8">
        <HeroGallery />
      </div>
    </section>
  );
}
