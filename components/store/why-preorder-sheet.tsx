"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { copy } from "@/data/copy";

const t = copy.why;

export function WhyPreorder() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex size-11 items-center justify-center rounded-full text-secondary hover:text-text"
      >
        <span className="sr-only">{copy.store.whyButton}</span>
        <svg aria-hidden viewBox="0 0 24 24" className="size-6">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="12" cy="16.9" r="1" fill="currentColor" />
        </svg>
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t.title}
        closeLabel={copy.item.close}
        footer={
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-12 w-full rounded-full bg-invert font-semibold text-on-invert"
          >
            {t.ok}
          </button>
        }
      >
        <div className="space-y-3 pb-5 text-[15px] leading-relaxed text-secondary">
          {t.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </Sheet>
    </>
  );
}
