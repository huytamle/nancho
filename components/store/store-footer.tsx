import Link from "next/link";
import { copy } from "@/data/copy";
import { site } from "@/data/site";
import type { PickupPoint } from "@/lib/domain/types";

// "Cách đặt" + điểm nhận + liên hệ + pháp lý (§9.2). Pháp lý bắt buộc hiển thị (NĐ 52/2013).
export function StoreFooter({ pickup }: { pickup: PickupPoint | null }) {
  const t = copy.store;
  const maps = pickup?.mapsUrl ?? site.kitchen.mapsLink;
  return (
    <footer className="mx-auto max-w-5xl px-4 pt-10 pb-[calc(6.5rem+env(safe-area-inset-bottom))] text-sm text-secondary">
      <h2 className="sr-only">{t.howToLabel}</h2>
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-text">
        {t.howTo.map((step, i) => (
          <li key={step}>
            <span className="mr-1 font-semibold text-accent tabular-nums">{i + 1}</span>
            {step}
          </li>
        ))}
      </ol>

      <p className="mt-5">
        ☕ {t.pickupAt} {pickup?.name ?? site.kitchen.name}: {pickup?.address ?? site.kitchen.address}
        {maps ? (
          <>
            {" · "}
            <a href={maps} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-text">
              {t.openMaps}
            </a>
          </>
        ) : null}
      </p>

      <p className="mt-3 flex flex-wrap items-center gap-x-4">
        <a href={site.contact.phoneHref} className="inline-flex min-h-11 items-center font-semibold text-text tabular-nums">
          ☎ {site.contact.phoneDisplay}
        </a>
        <a href={site.contact.zaloHref} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center hover:text-text">
          {t.zalo}
        </a>
        <Link href="/tai-quan" className="inline-flex min-h-11 items-center hover:text-text">
          {t.dineInLink} ›
        </Link>
      </p>

      <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed">
        {copy.footer.legal}: {site.legal.businessName} · {site.legal.registrationNo} · {site.legal.email}
        <br />© {site.name}
      </p>
    </footer>
  );
}
