"use client";

import { useEffect, useRef, useState } from "react";
import { SlotPicker } from "@/components/store/slot-chips";
import { chooseSlot, useOrder } from "@/components/store/use-order";
import { copy } from "@/data/copy";
import { site } from "@/data/site";
import { refreshOven, setSnapshot, startPolling, useOven } from "@/lib/client/oven-store";
import { useClock } from "@/lib/client/use-clock";
import type { OvenSnapshot, OvenStatus } from "@/lib/domain/oven-status";
import { formatRemaining, vnTimeLabel } from "@/lib/domain/time";

const t = copy.oven;
const TEN_MIN = 10 * 60_000;

function headline(status: OvenStatus, dayLabel: (d: string | null) => string) {
  switch (status.kind) {
    case "open":
      return t.open(t.tonight);
    case "closing_soon":
      return t.closingSoon(status.batchIndex);
    case "sold_out":
      return t.soldOut;
    case "after_cutoff":
      return status.nextOpenDate ? `${t.afterCutoff} · ${t.openFor(dayLabel(status.nextOpenDate))}` : t.afterCutoff;
    case "day_off":
      return status.nextOpenDate ? `${t.dayOff} · ${t.openFor(dayLabel(status.nextOpenDate))}` : t.dayOff;
    case "paused":
      return status.message ? `${t.paused}: ${status.message}` : t.paused;
  }
}

const DOT: Record<OvenStatus["kind"], string> = {
  open: "bg-live live-dot",
  closing_soon: "bg-warn",
  sold_out: "bg-danger",
  after_cutoff: "bg-tertiary",
  day_off: "bg-tertiary",
  paused: "bg-warn",
};

export function OvenBarLive({ initial }: { initial: OvenSnapshot | null }) {
  const { snap: live, error } = useOven();
  const snap = live ?? initial;
  const { slot, days, segment } = useOrder();
  const cafe = segment === "cafe";
  const sentinel = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (initial) setSnapshot(initial);
    else void refreshOven();
    return startPolling();
  }, [initial]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setCollapsed(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    // Thu gọn thanh sticky không được đẩy nội dung bên dưới (CLS): bù phần chiều cao mất đi bằng margin-bottom.
    const b = bar.current;
    let expandedH = 0;
    const ro = new ResizeObserver(() => {
      if (!b) return;
      const h = b.offsetHeight;
      if (b.dataset.collapsed === undefined) {
        expandedH = h;
        b.style.marginBottom = "";
      } else {
        b.style.marginBottom = `${Math.max(0, expandedH - h)}px`;
      }
    });
    if (b) ro.observe(b);
    return () => {
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  const status = snap?.status;
  const cutoffMs = status && "nextCutoffAt" in status ? Date.parse(status.nextCutoffAt) : null;
  const probe = useClock(30_000);
  const near = cutoffMs !== null && probe > 0 && cutoffMs - probe < TEN_MIN;
  const fine = useClock(near ? 1000 : 30_000);
  const now = fine || probe;
  const passed = cutoffMs !== null && now > 0 && now >= cutoffMs;

  useEffect(() => {
    if (passed) void refreshOven();
  }, [passed]);

  const shownDays = live ? days : (initial?.days ?? []);
  const dayLabel = (d: string | null) => shownDays.find((x) => x.date === d)?.label ?? "";
  const cutoffLabel = cutoffMs !== null ? vnTimeLabel(new Date(cutoffMs)) : null;
  const remaining = cutoffMs !== null && now > 0 ? formatRemaining(cutoffMs - now) : null;
  const batchIndex = status && "batchIndex" in status ? status.batchIndex : 0;

  return (
    <>
      {/* Mốc thu gọn: 120px sau vị trí gốc của thanh (thanh nằm trong khu thực đơn, không ở đầu trang). */}
      <div aria-hidden className="relative h-0">
        <div ref={sentinel} className="pointer-events-none absolute top-[120px] h-px w-px" />
      </div>
      <section
        ref={bar}
        aria-label={cafe ? t.cafeRegion : t.regionLabel}
        data-collapsed={collapsed || undefined}
        className="oven-bar sticky top-0 z-30 border-b border-line bg-header backdrop-blur-xl"
      >
        <div className="mx-auto max-w-5xl px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
          {cafe && snap ? (
            <CafeBar slot={slot} dayLabel={dayLabel(slot?.date ?? null)} days={shownDays} />
          ) : status ? (
            <>
              <p className="sr-only" aria-live="polite">
                {headline(status, dayLabel)}
              </p>
              <div className="flex items-center gap-2.5">
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT[status.kind]}`} />
                <p aria-hidden className="min-w-0 flex-1 text-[15px] leading-snug font-semibold">
                  <span className="oven-full">{headline(status, dayLabel)}</span>
                  <span className="oven-mini">
                    {cutoffLabel ? `${t.collapsedCutoff(cutoffLabel)}${remaining ? ` · ${remaining}` : ""}` : headline(status, dayLabel)}
                  </span>
                </p>
                {slot ? (
                  <button
                    type="button"
                    onClick={() => window.scrollTo({ top: 0 })}
                    className="oven-mini min-h-9 shrink-0 rounded-full bg-elevated px-3 text-sm font-semibold tabular-nums"
                  >
                    {slot.readyLabel} ▾
                  </button>
                ) : null}
              </div>
              <div className="oven-more">
                <div className="min-h-0">
                  {cutoffLabel && batchIndex ? (
                    <p className="mt-1 pl-[1.125rem] text-sm text-secondary tabular-nums">
                      ⏳ {t.cutoff(batchIndex, cutoffLabel)}
                      {remaining ? <span className={status.kind === "closing_soon" ? "text-warn" : ""}> · {remaining}</span> : null}
                    </p>
                  ) : null}
                  {status.kind === "paused" ? (
                    <a
                      href={site.contact.phoneHref}
                      className="mt-2 inline-flex min-h-11 items-center rounded-full bg-elevated px-4 text-sm font-semibold"
                    >
                      {copy.store.callToOrder} · {site.contact.phoneDisplay}
                    </a>
                  ) : null}
                  {shownDays.length > 0 ? (
                    <div className="mt-2.5">
                      <SlotPicker days={shownDays} selected={slot} onSelect={(s) => chooseSlot(s)} />
                    </div>
                  ) : status.kind !== "paused" ? (
                    <p className="mt-1 text-sm text-secondary">{t.noDays}</p>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-secondary">{error || !initial ? t.unavailable : ""}</p>
          )}
        </div>
      </section>
    </>
  );
}

/** Thanh khung giao cà phê (M12): không đếm khay — chỉ khung giờ + giờ chốt. */
function CafeBar({ slot, dayLabel, days }: { slot: ReturnType<typeof useOrder>["slot"]; dayLabel: string; days: ReturnType<typeof useOrder>["days"] }) {
  const headline = slot ? t.cafeOpen(dayLabel.toLowerCase(), slot.readyLabel) : t.cafeNone;
  return (
    <>
      <p className="sr-only" aria-live="polite">
        {headline}
      </p>
      <div className="flex items-center gap-2.5">
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${slot ? "bg-live live-dot" : "bg-tertiary"}`} />
        <p aria-hidden className="min-w-0 flex-1 text-[15px] leading-snug font-semibold">
          {headline}
        </p>
      </div>
      <div className="oven-more">
        <div className="min-h-0">
          {slot ? <p className="mt-1 pl-[1.125rem] text-sm text-secondary tabular-nums">⏳ {t.cafeCutoff(vnTimeLabel(new Date(slot.cutoffAt)))}</p> : null}
          {days.length > 0 ? (
            <div className="mt-2.5">
              <SlotPicker days={days} selected={slot} onSelect={(s) => chooseSlot(s)} />
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
