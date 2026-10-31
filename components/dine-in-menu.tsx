import Image from "next/image";
import { KoldLogo } from "@/components/kold-logo";
import { SectionHeading } from "@/components/section-heading";
import { copy } from "@/data/copy";
import { dineInMenu } from "@/data/dine-in";
import { formatPrice } from "@/lib/format";

export function DineInMenu() {
  const t = copy.dineIn.menu;

  return (
    <section id="thuc-don" className="scroll-mt-24 bg-bg px-4 py-20 sm:px-6 md:px-8 md:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading kicker={t.kicker} title={t.title} description={t.description} />

        <div className="mt-16 space-y-20">
          {dineInMenu.map((group) => (
            <div key={group.id} id={group.id} className="scroll-mt-28">
              {group.brand === "kold" ? <KoldLogo className="mb-4" /> : null}
              <p className="text-[11px] tracking-[0.24em] text-secondary uppercase">
                {group.kicker}
              </p>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                {group.title}
              </h3>
              <ul className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {group.items.map((item) => (
                  <li key={item.id} className="group overflow-hidden rounded-[28px] bg-surface">
                    <div className="relative aspect-square overflow-hidden">
                      <Image
                        src={item.image}
                        alt={item.alt}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        className="object-cover transition-transform duration-700 ease-(--ease-out) group-hover:scale-[1.04]"
                      />
                    </div>
                    <div className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="font-medium tracking-tight">{item.name}</h4>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-secondary">
                          {formatPrice(item.price)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-secondary">{item.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
