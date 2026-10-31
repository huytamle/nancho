"use client";

import { Logo } from "@/components/logo";
import { useLanguage } from "@/components/language-provider";
import { site } from "@/data/site";

export function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="border-t border-line bg-bg text-text">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-3 md:px-8">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-secondary">
            {site.tagline}
          </p>
        </div>

        <div>
          <p className="text-[11px] tracking-[0.22em] text-secondary uppercase">
            {t.hotline}
          </p>
          <a
            href={site.phoneHref}
            className="mt-2 block text-2xl font-semibold tracking-tight hover:opacity-80"
          >
            {site.phoneDisplay}
          </a>
          <p className="mt-2 text-sm text-secondary">{t.visit.addressValue}</p>
        </div>

        <div>
          <p className="text-[11px] tracking-[0.22em] text-secondary uppercase">
            {t.footer.social}
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a
                href={site.social.facebook}
                className="text-secondary hover:text-text"
                target="_blank"
                rel="noreferrer"
              >
                Facebook
              </a>
            </li>
            <li>
              <a
                href={site.social.instagram}
                className="text-secondary hover:text-text"
                target="_blank"
                rel="noreferrer"
              >
                Instagram
              </a>
            </li>
          </ul>
        </div>
      </div>
      <p className="border-t border-line px-4 py-5 text-center text-xs text-secondary">
        © {new Date().getFullYear()} {site.name}. {t.footer.dineIn}
      </p>
    </footer>
  );
}
