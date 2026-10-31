"use client";

import { copy } from "@/data/copy";

export function Stepper({
  value,
  min = 1,
  max,
  onChange,
  label,
  size = "md",
}: {
  value: number;
  min?: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
  size?: "sm" | "md";
}) {
  const btn =
    size === "sm"
      ? "size-9 text-lg"
      : "size-11 text-xl";
  return (
    <div className="inline-flex items-center rounded-full bg-elevated p-0.5">
      <button
        type="button"
        className={`${btn} inline-flex items-center justify-center rounded-full font-medium disabled:opacity-30`}
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={copy.stepper.dec(label)}
      >
        −
      </button>
      <output className="min-w-7 text-center font-semibold tabular-nums" aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className={`${btn} inline-flex items-center justify-center rounded-full font-medium disabled:opacity-30`}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={copy.stepper.inc(label)}
      >
        +
      </button>
    </div>
  );
}
