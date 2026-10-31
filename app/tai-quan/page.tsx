import type { Metadata } from "next";
import Link from "next/link";
import { DineInMenu } from "@/components/dine-in-menu";
import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";
import { Reservation } from "@/components/reservation";
import { copy } from "@/data/copy";
import { site } from "@/data/site";

// Mục riêng cho quán ăn tại chỗ THE HEAT: café, KOLD Gelato, đặt bàn (BLUEPRINT §5.4).
export const metadata: Metadata = {
  title: "Café, gelato & đặt bàn tại quán",
  description: `Café specialty, KOLD Gelato và đặt bàn tại ${site.dineIn.name} — ${site.dineIn.address}.`,
  alternates: { canonical: "/tai-quan" },
};

export default function DineInPage() {
  const t = copy.dineIn;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-header pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 md:px-8">
          <Link href="/" aria-label={site.name}>
            <Logo compact />
          </Link>
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
          >
            {t.back}
          </Link>
        </div>
      </header>

      <main id="noi-dung">
        <DineInMenu />

        <section className="bg-bg px-4 sm:px-6 md:px-8">
          <div className="mx-auto grid max-w-6xl gap-6 rounded-tile bg-surface p-6 sm:grid-cols-2 sm:p-8">
            <div>
              <p className="text-[11px] tracking-[0.22em] text-secondary uppercase">
                {t.visit.address}
              </p>
              <p className="mt-2">{site.dineIn.address}</p>
              <a
                href={site.dineIn.mapsLink}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex min-h-11 items-center text-sm text-secondary underline-offset-4 hover:text-text hover:underline"
              >
                {t.visit.openMaps} ›
              </a>
            </div>
            <div>
              <p className="text-[11px] tracking-[0.22em] text-secondary uppercase">
                {t.visit.hours}
              </p>
              <dl className="mt-2 space-y-1">
                {site.dineIn.hours.map((row) => (
                  <div key={row.days} className="flex justify-between gap-4">
                    <dt className="text-secondary">{row.days}</dt>
                    <dd className="tabular-nums">{row.time}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <Reservation />
      </main>
      <Footer />
    </>
  );
}
