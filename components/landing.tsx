import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { AccountButton, SegmentLink } from "@/components/landing-client";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { copy } from "@/data/copy";
import { journey } from "@/data/journey";
import { site } from "@/data/site";
import { PROMO, TIERS } from "@/lib/domain/promo";

// Landing (M12) — ngôn ngữ site gốc (logo, pill, sáng/tối) + hero chữ khổng lồ kiểu KOI Thé + kicker `// 0n`,
// chữ hiện dần, dải chạy kiểu JS Mastery. Toàn bộ là Server Component tĩnh, hiệu ứng chỉ bằng CSS (globals.css).
const t = copy.landing;
const k = (n: number) => `${Math.round(n / 1000)}k`;

/** Kicker kiểu `// 01 — Câu chuyện`. */
export function Kicker({ n, children }: { n: string; children: string }) {
  return (
    <p className="font-mono text-[12px] tracking-[0.18em] text-accent uppercase">
      <span aria-hidden>{`// ${n} — `}</span>
      {children}
    </p>
  );
}

/** Tiêu đề section: chữ hiện dần theo từng từ khi cuộn tới. */
export function Title({ id, children, className = "" }: { id: string; children: string; className?: string }) {
  return (
    <h2 id={id} className={`mt-3 text-[34px] leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl ${className}`}>
      {children.split(" ").map((w, i) => (
        <span key={i} className="word" style={{ "--i": i } as CSSProperties}>
          {w}{" "}
        </span>
      ))}
    </h2>
  );
}

export function SiteHeader() {
  return (
    <header className="relative z-40 border-b border-line bg-header backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
        <Link href="/" aria-label={site.name} className="mr-auto shrink-0">
          <Logo compact preload />
        </Link>
        <nav aria-label={t.nav.label} className="hidden items-center gap-1 text-sm text-secondary md:flex">
          {t.nav.links.map((l, i) => (
            <a key={l.href} href={`/${l.href}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 transition hover:text-text">
              <span aria-hidden className="font-mono text-[11px] text-secondary">
                0{i + 1}
              </span>
              {l.label}
            </a>
          ))}
        </nav>
        <ThemeToggle />
        <AccountButton />
      </div>
    </header>
  );
}

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      <div aria-hidden className="absolute -bottom-48 left-1/2 -z-10 h-96 w-[70rem] -translate-x-1/2 rounded-full bg-accent-glow blur-3xl" />
      <div className="mx-auto max-w-6xl px-4 pt-6 sm:pt-10">
        <div className="flex items-center justify-between font-mono text-[11px] tracking-[0.18em] text-secondary uppercase">
          <span>{t.hero.kicker}</span>
          <span className="hidden sm:inline">Pan pizza · BBQ · Cà phê</span>
        </div>
      </div>

      {/* Chữ THE HEAT khổng lồ (KOI). Hai dòng trên mobile, một dòng từ sm. */}
      <div className="relative mt-4 select-none sm:mt-2">
        <h1 id="hero-title" className="sr-only">
          {site.name} — {t.hero.line1} {t.hero.line2}
        </h1>
        <div
          aria-hidden
          className="flex flex-col items-center text-[26vw] leading-[0.8] font-bold tracking-[-0.05em] sm:flex-row sm:justify-center sm:gap-[3vw] sm:text-[11vw]"
        >
          <span className="drift-l">{t.hero.wordmark[0]}</span>
          <span className="drift-r">{t.hero.wordmark[1]}</span>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 pt-6 pb-8 sm:grid-cols-[1.2fr_1fr] sm:items-end sm:pb-10">
        <div>
          <p className="text-[30px] leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl">
            {t.hero.line1}
            <br />
            <span className="text-gradient-fire">{t.hero.line2}</span>
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <SegmentLink
              segment="pizza"
              className="inline-flex h-12 items-center rounded-full bg-accent px-6 text-[15px] font-semibold text-on-accent transition hover:brightness-110 active:scale-[0.98]"
            >
              {t.hero.ctaPizza}
            </SegmentLink>
            <SegmentLink
              segment="cafe"
              className="inline-flex h-12 items-center rounded-full border border-line px-6 text-[15px] font-semibold transition hover:bg-elevated active:scale-[0.98]"
            >
              {t.hero.ctaCafe}
            </SegmentLink>
          </div>
        </div>
        <div>
          <p className="max-w-md text-[15px] leading-relaxed text-secondary italic">{t.hero.body}</p>
          <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-line pt-5">
            {t.hero.facts.map((f) => (
              <div key={f.label}>
                <dt className="font-mono text-[10px] tracking-[0.12em] text-secondary uppercase">{f.label}</dt>
                <dd className="mt-1 text-[17px] font-semibold tracking-tight tabular-nums sm:text-xl">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      {/* Ảnh bánh dạng banner bo góc dưới chữ — không đè lên chữ nào. */}
      <div className="mx-auto pb-12 max-w-6xl px-4 sm:pb-16">
        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl shadow-2xl shadow-black/30 sm:aspect-[21/9]">
          <Image src="/images/menu/pan-bbq.jpg" alt={t.hero.alt} fill preload fetchPriority="high" sizes="(min-width: 1152px) 1120px, 100vw" className="object-cover" />
        </div>
      </div>

      <Marquee />
    </section>
  );
}

/** Dải chữ chạy (JSM) — trang trí, trình đọc màn hình bỏ qua. */
function Marquee() {
  const items = [...t.hero.marquee, ...t.hero.marquee];
  return (
    <div aria-hidden className="overflow-hidden border-y border-line bg-bg py-3">
      <div className="marquee flex w-max gap-8 font-mono text-[12px] tracking-[0.16em] uppercase">
        {items.map((m, i) => (
          <span key={i} className="flex items-center gap-8">
            {m}
            <span className="text-accent">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Story() {
  return (
    <section id="cau-chuyen" aria-labelledby="story-title" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-20 sm:py-28">
      <div className="max-w-4xl">
        <Kicker n="01">{t.story.kicker}</Kicker>
        <Title id="story-title">{t.story.title}</Title>
        <p className="reveal mt-6 max-w-2xl text-[17px] leading-relaxed text-secondary sm:text-xl">{t.story.body}</p>
      </div>
      <div className="mt-14 grid gap-4 md:grid-cols-3">
        {t.story.pillars.map((p, i) => (
          <article key={p.title} className="reveal group overflow-hidden rounded-tile border border-line">
            <div className="relative aspect-[4/3] overflow-hidden">
              <Image
                src={p.image}
                alt={p.alt}
                fill
                sizes="(min-width: 768px) 360px, calc(100vw - 32px)"
                className="object-cover transition duration-700 ease-[var(--ease-out)] group-hover:scale-[1.04]"
              />
            </div>
            <div className="p-6">
              <p className="font-mono text-[40px] leading-none font-semibold text-secondary tabular-nums">0{i + 1}</p>
              <h3 className="mt-3 text-xl font-semibold tracking-tight">{p.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-secondary">{p.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/** Mở đầu khu thực đơn (02). Phần món là BentoMenu (client) trong store-page. */
export function MenuIntro() {
  return (
    <div className="max-w-3xl">
      <Kicker n="02">{copy.menu.kicker}</Kicker>
      <Title id="thuc-don-title">{copy.menu.title}</Title>
    </div>
  );
}

/** Khu đặt hàng (03): ba bước theo mảng + khung đơn (client, truyền vào qua `panel`). */
export function OrderSection({ panel }: { panel: ReactNode }) {
  return (
    <section id="dat-hang" aria-labelledby="order-title" className="scroll-mt-16 border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
        <div className="max-w-3xl">
          <Kicker n="03">{t.order.kicker}</Kicker>
          <Title id="order-title">{t.order.title}</Title>
          <p className="reveal mt-5 text-[17px] leading-relaxed text-secondary">{t.order.body}</p>
        </div>
        <div className="mt-12 grid gap-4 lg:grid-cols-[1fr_1fr_1.1fr]">
          {t.how.cards.map((c) => (
            <article key={c.title} className="reveal rounded-tile border border-line p-6 sm:p-7">
              <p className="font-mono text-[11px] tracking-[0.16em] text-accent uppercase">{c.kicker}</p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight">{c.title}</h3>
              <ol className="mt-5 space-y-4">
                {c.steps.map((s, i) => (
                  <li key={s} className="flex gap-3 text-[15px] leading-relaxed">
                    <span className="w-6 shrink-0 pt-0.5 font-mono text-[13px] text-secondary tabular-nums">0{i + 1}</span>
                    <span className="text-secondary">{s}</span>
                  </li>
                ))}
              </ol>
            </article>
          ))}
          {panel}
        </div>
        <p className="mt-6 text-sm text-secondary">
          {t.order.help}{" "}
          <a href={site.contact.phoneHref} className="font-semibold text-text tabular-nums underline-offset-4 hover:underline">
            {site.contact.phoneDisplay}
          </a>
          {" · "}
          <a href={site.contact.zaloHref} target="_blank" rel="noreferrer" className="font-semibold text-text underline-offset-4 hover:underline">
            Zalo
          </a>
        </p>
      </div>
    </section>
  );
}

export function MemberPerks() {
  const perks = [
    { title: t.perks.welcome.title(k(PROMO.welcome.amount)), body: t.perks.welcome.body(k(PROMO.welcome.minSubtotal)) },
    { title: t.perks.points.title, body: t.perks.points.body(k(PROMO.points.per), PROMO.points.cost, k(PROMO.points.amount)) },
    { title: t.perks.referral.title(k(PROMO.referral.amount)), body: t.perks.referral.body },
    { title: t.perks.review.title(k(PROMO.review.amount)), body: t.perks.review.body },
    { title: t.perks.track.title, body: t.perks.track.body },
    { title: t.perks.history.title, body: t.perks.history.body },
  ];
  return (
    <section id="uu-dai" aria-labelledby="perks-title" className="scroll-mt-16 bg-surface py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <div className="max-w-3xl">
          <Kicker n="04">{t.perks.kicker}</Kicker>
          <Title id="perks-title">{t.perks.title}</Title>
          <p className="reveal mt-5 text-[17px] leading-relaxed text-secondary">{t.perks.body}</p>
        </div>
        <div className="mt-12 grid gap-px overflow-hidden rounded-tile border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {perks.map((p, i) => (
            <article key={p.title} className="bg-surface p-6">
              <p className="font-mono text-[12px] text-secondary tabular-nums">0{i + 1}</p>
              <h3 className="mt-3 text-lg font-semibold tracking-tight">{p.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-secondary">{p.body}</p>
            </article>
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-5 rounded-tile border border-line p-6 sm:flex-row sm:items-center sm:p-8">
          <div className="flex-1">
            <h3 className="text-lg font-semibold tracking-tight">{t.perks.tiersTitle}</h3>
            <ol className="mt-3 flex flex-wrap gap-2">
              {TIERS.map((tier) => (
                <li key={tier.key} className="rounded-full bg-elevated px-4 py-2 text-sm">
                  <span className="font-semibold">{tier.label}</span> <span className="text-secondary">· {t.perks.tierFrom(tier.from)}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <Link href="/tai-khoan" className="inline-flex h-12 items-center rounded-full bg-invert px-6 font-semibold text-on-invert active:scale-[0.98]">
              {t.perks.cta}
            </Link>
            <p className="mt-2 text-sm text-secondary">{t.perks.optional}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Journey() {
  const cols = [
    { key: "done", mark: "✓", items: journey.done },
    { key: "improving", mark: "↻", items: journey.improving },
    { key: "next", mark: "→", items: journey.next },
  ] as const;
  return (
    <section id="hanh-trinh" aria-labelledby="journey-title" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-20 sm:py-28">
      <div className="max-w-3xl">
        <Kicker n="05">{t.journey.kicker}</Kicker>
        <Title id="journey-title">{t.journey.title}</Title>
        <p className="reveal mt-5 text-[17px] leading-relaxed text-secondary">{t.journey.body}</p>
      </div>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {cols.map((c) => (
          <div key={c.key} className="reveal rounded-tile border border-line p-6">
            <h3 className="flex items-center justify-between font-mono text-[12px] tracking-[0.16em] uppercase">
              {t.journey.columns[c.key]}
              <span className={c.key === "done" ? "text-live" : c.key === "improving" ? "text-warn" : "text-accent"} aria-hidden>
                {c.items.length}
              </span>
            </h3>
            <ul className="mt-5 space-y-3">
              {c.items.map((s) => (
                <li key={s} className="flex gap-3 text-[15px] leading-relaxed">
                  <span aria-hidden className={c.key === "done" ? "text-live" : c.key === "improving" ? "text-warn" : "text-accent"}>
                    {c.mark}
                  </span>
                  <span className="text-secondary">{s}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <h3 className="mt-16 text-2xl font-semibold tracking-tight">{t.journey.dishes}</h3>
      <p className="mt-1 text-[15px] text-secondary">{t.journey.dishesNote}</p>
      <div role="region" aria-label={t.journey.dishes} tabIndex={0} className="no-scrollbar -mx-4 mt-6 flex snap-x gap-4 overflow-x-auto px-4 pb-2">
        {journey.dishes.map((u) => (
          <article key={u.name} className="w-[78%] shrink-0 snap-start overflow-hidden rounded-tile border border-line sm:w-[360px]">
            <div className="relative aspect-[4/3]">
              <Image src={u.image} alt={u.name} fill sizes="360px" className="object-cover" />
              <span className="absolute top-3 left-3 rounded-full bg-black/70 px-3 py-1 font-mono text-[11px] tracking-wide text-white uppercase backdrop-blur">
                {u.when}
              </span>
            </div>
            <div className="p-5">
              <h4 className="text-lg font-semibold tracking-tight">{u.name}</h4>
              <p className="mt-1 text-[15px] leading-relaxed text-secondary">{u.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Faq() {
  return (
    <section id="hoi-dap" aria-labelledby="faq-title" className="mx-auto max-w-3xl scroll-mt-16 px-4 pb-10">
      <Kicker n="06">{t.faq.title}</Kicker>
      <h2 id="faq-title" className="sr-only">
        {t.faq.title}
      </h2>
      <div className="mt-6 divide-y divide-line border-y border-line">
        {t.faq.items.map((f) => (
          <details key={f.q} className="group py-1">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-medium [&::-webkit-details-marker]:hidden">
              {f.q}
              <span aria-hidden className="text-xl text-secondary transition group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="pb-4 text-[15px] leading-relaxed text-secondary">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
