import { Logo } from "@/components/logo";
import { copy } from "@/data/copy";
import { site } from "@/data/site";

export function Footer() {
  const t = copy.footer;

  return (
    <footer className="border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] text-text">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-3 md:px-8">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-secondary">{site.tagline}</p>
        </div>

        <div>
          <p className="text-[11px] tracking-[0.22em] text-secondary uppercase">{t.hotline}</p>
          <a
            href={site.contact.phoneHref}
            className="mt-2 block text-2xl font-semibold tracking-tight tabular-nums hover:opacity-80"
          >
            {site.contact.phoneDisplay}
          </a>
          <p className="mt-6 text-[11px] tracking-[0.22em] text-secondary uppercase">
            {t.kitchen}
          </p>
          <p className="mt-2 text-sm text-secondary">
            {site.kitchen.name} · {site.kitchen.address}
          </p>
        </div>

        <div>
          <p className="text-[11px] tracking-[0.22em] text-secondary uppercase">{t.social}</p>
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
      <div className="border-t border-line px-4 py-5 text-center text-xs leading-relaxed text-secondary">
        <p>
          {t.legal}: {site.legal.businessName} · {site.legal.registrationNo} · {site.legal.email}
        </p>
        <p className="mt-1">© {site.name}</p>
      </div>
    </footer>
  );
}
