import { ReservationForm } from "@/components/reservation-form";
import { SectionHeading } from "@/components/section-heading";
import { copy } from "@/data/copy";

export function Reservation() {
  const t = copy.dineIn.reserve;

  return (
    <section id="dat-ban" className="scroll-mt-24 bg-bg px-4 py-20 sm:px-6 md:px-8 md:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-start">
        <SectionHeading kicker={t.kicker} title={t.title} description={t.description} />
        <div className="rounded-[28px] bg-surface p-6 sm:p-8">
          <ReservationForm />
        </div>
      </div>
    </section>
  );
}
