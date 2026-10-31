"use client";

import Image from "next/image";
import { SectionHeading } from "@/components/section-heading";
import { useLanguage } from "@/components/language-provider";
import { menu } from "@/data/menu";
import { formatPrice } from "@/lib/format";

export function MenuSection() {
  const { lang, t } = useLanguage();

  return (
    <section id="menu" className="scroll-mt-24 bg-bg px-4 py-20 sm:px-6 md:px-8 md:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          kicker={t.menu.kicker}
          title={t.menu.title}
          description={t.menu.description}
        />

        <div className="mt-10 flex gap-2 overflow-x-auto pb-2">
          {menu.map((group) => (
            <a
              key={group.id}
              href={`#${group.id}`}
              className="shrink-0 rounded-full border border-line px-4 py-2 text-sm text-secondary transition-colors hover:border-text/40 hover:text-text"
            >
              {t.menu.groups[group.id].title}
            </a>
          ))}
        </div>

        <div className="mt-16 space-y-20">
          {menu.map((group) => (
            <div key={group.id} id={group.id} className="scroll-mt-28">
              <p className="text-[11px] tracking-[0.24em] text-secondary uppercase">
                {t.menu.groups[group.id].kicker}
              </p>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                {t.menu.groups[group.id].title}
              </h3>
              <ul
                className={`mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 ${
                  group.items.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"
                }`}
              >
                {group.items.map((item) => {
                  const text = t.menu.items[item.id];
                  return (
                    <li
                      key={item.id}
                      className="group overflow-hidden rounded-[28px] bg-surface"
                    >
                      <div className="relative aspect-square overflow-hidden">
                        <Image
                          src={item.image}
                          alt={text.alt}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                          className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.06]"
                        />
                      </div>
                      <div className="px-5 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <h4 className="font-medium tracking-tight">{text.name}</h4>
                          <span className="shrink-0 text-sm tabular-nums text-secondary">
                            {formatPrice(item.price, lang)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-secondary">{text.description}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
