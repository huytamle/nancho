"use client";

import Image from "next/image";
import { SectionHeading } from "@/components/section-heading";
import { useLanguage } from "@/components/language-provider";
import { gallery } from "@/data/gallery";

export function Gallery() {
  const { t } = useLanguage();

  return (
    <section
      id="khong-gian"
      className="scroll-mt-24 bg-bg px-4 py-20 sm:px-6 md:px-8 md:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          kicker={t.space.kicker}
          title={t.space.title}
          description={t.space.description}
        />

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {gallery.map((shot) => (
            <figure key={shot.src} className="group overflow-hidden rounded-[28px]">
              <div className="relative aspect-[4/3]">
                <Image
                  src={shot.src}
                  alt={shot.alt}
                  fill
                  sizes="(max-width: 640px) 100vw, 50vw"
                  className="object-cover transition duration-700 group-hover:scale-[1.03]"
                />
              </div>
              <figcaption className="sr-only">{shot.caption}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
