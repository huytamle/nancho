"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { heroSlides } from "@/data/hero-slides";

export function HeroGallery() {
  const { t } = useLanguage();
  const [index, setIndex] = useState(0);
  const total = heroSlides.length;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % total);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [total]);

  function go(next: number) {
    setIndex((next + total) % total);
  }

  return (
    <div className="relative aspect-[16/9] overflow-hidden rounded-[28px] sm:aspect-[21/9]">
      {heroSlides.map((slide, i) => (
        <Image
          key={slide.src}
          src={slide.src}
          alt={slide.alt}
          fill
          sizes="(max-width: 1024px) 100vw, 1152px"
          priority={i === 0}
          className={`object-cover transition-opacity duration-700 ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}

      <button
        type="button"
        onClick={() => go(index - 1)}
        className="absolute top-1/2 left-3 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-md sm:flex"
        aria-label={t.galleryNav.prev}
      >
        <Arrow dir="left" />
      </button>
      <button
        type="button"
        onClick={() => go(index + 1)}
        className="absolute top-1/2 right-3 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-md sm:flex"
        aria-label={t.galleryNav.next}
      >
        <Arrow dir="right" />
      </button>

      <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center gap-1.5">
        {heroSlides.map((slide, i) => (
          <button
            key={slide.src}
            type="button"
            aria-label={`${t.galleryNav.dot} ${i + 1}`}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? "w-5 bg-white" : "w-1.5 bg-white/45"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function Arrow({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      {dir === "left" ? (
        <path d="M15 5 8 12l7 7" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}
