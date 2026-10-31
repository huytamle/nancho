"use client";

import { ReservationForm } from "@/components/reservation-form";
import { SectionHeading } from "@/components/section-heading";
import { useLanguage } from "@/components/language-provider";

export function Reservation() {
  const { t } = useLanguage();

  return (
    <section
      id="dat-ban"
      className="scroll-mt-24 bg-bg px-4 py-20 sm:px-6 md:px-8 md:py-28"
    >
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-start">
        <SectionHeading
          kicker={t.reserve.kicker}
          title={t.reserve.title}
          description={t.reserve.description}
        />
        <div className="rounded-[28px] bg-surface p-6 sm:p-8">
          <ReservationForm />
        </div>
      </div>
    </section>
  );
}
