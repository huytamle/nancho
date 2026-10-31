export function SectionHeading({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-[11px] font-medium tracking-[0.28em] text-secondary uppercase">
        {kicker}
      </p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-text sm:text-5xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-[17px] leading-relaxed text-secondary">
          {description}
        </p>
      ) : null}
    </div>
  );
}
