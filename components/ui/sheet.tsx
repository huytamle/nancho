"use client";

import { useEffect, useId, useRef, type PointerEvent, type ReactNode } from "react";

// Bottom sheet trên <dialog> + showModal() (§9.9): focus trap, Esc, nền inert có sẵn.
// Mở/đóng do `open` điều khiển (thường lấy từ URL); đóng bằng tay gọi onClose — trang đổi URL rồi `open` tắt.
// Khoá cuộn nền bằng CSS `html:has(dialog[open])`. Bàn phím ảo: biến --kb đẩy sheet lên trên bàn phím.

const CLOSE_MS = 300;
const DRAG_CLOSE_PX = 120;
const DRAG_CLOSE_VELOCITY = 0.5;

export function Sheet({
  open,
  onClose,
  title,
  hideTitle = false,
  closeLabel,
  snap = "auto",
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  hideTitle?: boolean;
  closeLabel: string;
  snap?: "auto" | "tall";
  footer?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) {
      if (!d.open) d.showModal();
      void d.offsetHeight; // áp trạng thái đóng trước khi chuyển sang mở → có transition
      d.dataset.state = "open";
      return;
    }
    if (!d.open) return;
    d.dataset.state = "closed";
    const t = setTimeout(() => {
      d.close();
      panel.current?.style.removeProperty("transform");
    }, CLOSE_MS);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    const vv = window.visualViewport;
    const d = ref.current;
    if (!open || !vv || !d) return;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      d.style.setProperty("--kb", `${Math.round(kb)}px`);
    };
    update();
    vv.addEventListener("resize", update);
    return () => vv.removeEventListener("resize", update);
  }, [open]);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = { y: e.clientY, t: e.timeStamp, dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const s = drag.current;
    const p = panel.current;
    if (!s || !p) return;
    s.dy = Math.max(0, e.clientY - s.y);
    p.style.transition = "none";
    p.style.transform = `translateY(${s.dy}px)`;
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const s = drag.current;
    const p = panel.current;
    drag.current = null;
    if (!s || !p) return;
    p.style.removeProperty("transition");
    const velocity = s.dy / Math.max(1, e.timeStamp - s.t);
    if (s.dy > DRAG_CLOSE_PX || (s.dy > 24 && velocity > DRAG_CLOSE_VELOCITY)) {
      p.style.transform = "translateY(100%)";
      onClose();
    } else {
      p.style.removeProperty("transform");
    }
  }

  return (
    <dialog
      ref={ref}
      className="sheet"
      data-state="closed"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={panel} className={`sheet-panel ${snap === "tall" ? "sheet-tall" : ""}`}>
        <div
          className="relative shrink-0 cursor-grab touch-none px-5 pt-2 pb-1 select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div aria-hidden className="mx-auto h-1.5 w-10 rounded-full bg-white/25" />
          <div className="flex min-h-11 items-center justify-between gap-3">
            <h2 id={titleId} className={hideTitle ? "sr-only" : "text-lg font-semibold tracking-tight"}>
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 ml-auto inline-flex size-11 items-center justify-center rounded-full text-secondary hover:text-text"
            >
              <span className="sr-only">{closeLabel}</span>
              <svg aria-hidden viewBox="0 0 24 24" className="size-7">
                <circle cx="12" cy="12" r="11" fill="currentColor" opacity=".18" />
                <path d="M8.5 8.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-line px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
