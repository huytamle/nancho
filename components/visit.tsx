"use client";

import { SectionHeading } from "@/components/section-heading";
import { useLanguage } from "@/components/language-provider";
import { site } from "@/data/site";

export function Visit() {
  const { t } = useLanguage();

  return (
    <section
      id="den-quan"
      className="scroll-mt-24 bg-bg px-4 py-20 sm:px-6 md:px-8 md:py-28"
    >
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:items-stretch">
        <div>
          <SectionHeading
            kicker={t.visit.kicker}
            title={t.visit.title}
            description={t.visit.description}
          />

          <dl className="mt-10 space-y-8 text-[17px]">
            <div>
              <dt className="text-[11px] tracking-[0.22em] text-secondary uppercase">
                {t.visit.address}
              </dt>
              <dd className="mt-2">{t.visit.addressValue}</dd>
              <a
                href={site.mapsLink}
                className="mt-2 inline-block text-sm text-text underline-offset-4 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {t.visit.openMaps}
              </a>
            </div>
            <div>
              <dt className="text-[11px] tracking-[0.22em] text-secondary uppercase">
                {t.hotline}
              </dt>
              <dd className="mt-2">
                <a href={site.phoneHref} className="hover:opacity-80">
                  {site.phoneDisplay}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-[0.22em] text-secondary uppercase">
                {t.visit.hours}
              </dt>
              <dd className="mt-3 space-y-3">
                {t.visit.rows.map((row) => (
                  <div
                    key={row.days}
                    className="flex items-baseline justify-between gap-4 border-b border-line pb-3"
                  >
                    <span className="text-secondary">{row.days}</span>
                    <span className="tabular-nums">{row.time}</span>
                  </div>
                ))}
              </dd>
            </div>
          </dl>
        </div>

        <div className="min-h-[280px] overflow-hidden rounded-[28px] bg-surface lg:min-h-full">
          <iframe
            title={t.visit.mapTitle}
            src={site.mapsEmbedUrl}
            className="h-full min-h-[280px] w-full dark:grayscale lg:min-h-[420px]"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </section>
  );
}
