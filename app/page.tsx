import Image from "next/image";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";
import { copy } from "@/data/copy";
import { site } from "@/data/site";

// M0: trang giữ chỗ. Oven Bar + Bento Menu + sheets sẽ thay thế ở M3 (BLUEPRINT §9).
export default function Home() {
  const t = copy.store;

  return (
    <>
      <main
        id="noi-dung"
        className="mx-auto flex min-h-[100svh] max-w-5xl flex-col px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-12 sm:px-6"
      >
        <Logo preload />

        <section className="mt-10 overflow-hidden rounded-tile bg-surface">
          <div className="relative aspect-[16/10]">
            <Image
              src="/images/menu/pan-bbq.jpg"
              alt="Pan pizza viền phô mai cháy bên cạnh sườn BBQ"
              fill
              preload
              sizes="(max-width: 1024px) 100vw, 1024px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-black/30 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 px-5 sm:px-8">
              <p className="text-[11px] font-medium tracking-[0.24em] text-text/80 uppercase">
                {t.kicker}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
                {t.title}
              </h1>
            </div>
          </div>
          <div className="px-5 pt-3 pb-6 sm:px-8 sm:pb-8">
            <p className="text-[17px] text-secondary">{t.comingSoon}</p>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={site.contact.phoneHref}
                className="inline-flex h-12 items-center rounded-full bg-accent px-6 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
              >
                {t.callToOrder} · <span className="ml-1 tabular-nums">{site.contact.phoneDisplay}</span>
              </a>
              <a
                href={site.contact.zaloHref}
                className="inline-flex h-12 items-center rounded-full bg-elevated px-6 text-sm font-medium transition-opacity hover:opacity-80"
              >
                {t.zalo}
              </a>
            </div>
          </div>
        </section>

        <Link
          href="/tai-quan"
          className="mt-6 inline-flex min-h-11 items-center self-start text-sm text-secondary underline-offset-4 hover:text-text hover:underline"
        >
          {t.dineInLink} ›
        </Link>
      </main>
      <Footer />
    </>
  );
}
