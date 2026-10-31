"use client";

import { copy } from "@/data/copy";
import type { DaySlots, SlotView } from "@/lib/domain/oven-status";

const bookable = (s: SlotView) => s.level !== "closed" && s.level !== "full";

function chipText(s: SlotView) {
  switch (s.level) {
    case "full":
      return copy.slot.full;
    case "closed":
      return copy.slot.closed;
    case "bbq_only":
      return copy.slot.bbqOnly;
    default:
      return copy.slot.left(s.remainingPan);
  }
}

/** Tab ngày (khi có > 1 ngày) + hàng chip giờ cuộn ngang (§7.2, §9.3). */
export function SlotPicker({
  days,
  selected,
  onSelect,
  showDays = true,
}: {
  days: DaySlots[];
  selected: SlotView | null;
  onSelect: (slot: SlotView) => void;
  showDays?: boolean;
}) {
  const day = days.find((d) => d.date === selected?.date) ?? days[0];
  if (!day) return null;

  return (
    <div className="space-y-2">
      {showDays && days.length > 1 ? (
        <div role="radiogroup" aria-label={copy.oven.daysLabel} className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
          {days.map((d) => {
            const first = d.slots.find(bookable);
            const checked = d.date === day.date;
            return (
              <button
                key={d.date}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-disabled={!first}
                onClick={() => first && !checked && onSelect(first)}
                className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium transition-colors ${
                  checked ? "bg-invert text-on-invert" : "text-secondary hover:text-text"
                } ${first ? "" : "opacity-40"}`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      ) : null}
      <div
        role="radiogroup"
        aria-label={`${copy.oven.slotsLabel} · ${day.label}`}
        className="no-scrollbar -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-0.5"
      >
        {day.slots.map((s) => {
          const ok = bookable(s);
          const hot = s.level === "few" || s.level === "last";
          const checked = selected?.batchId === s.batchId;
          return (
            <button
              key={s.batchId}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-disabled={!ok}
              aria-label={`${s.readyLabel}, ${chipText(s)}`}
              onClick={() => ok && !checked && onSelect(s)}
              className={`chip min-h-11 shrink-0 snap-start rounded-full border px-4 text-sm tabular-nums transition ${
                checked
                  ? "border-text bg-text font-semibold text-bg"
                  : hot
                    ? "border-accent bg-elevated"
                    : "border-transparent bg-elevated"
              } ${ok ? "" : "cursor-not-allowed text-tertiary line-through decoration-1"}`}
            >
              <span className="font-semibold">{s.readyLabel}</span>
              <span aria-hidden> · </span>
              <span className={checked ? "" : ok ? "text-secondary" : ""}>{chipText(s)}</span>
              {hot ? <span aria-hidden> 🔥</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
