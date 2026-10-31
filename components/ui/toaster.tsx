"use client";

import { copy } from "@/data/copy";
import { dismissToast, useToast } from "@/lib/client/toast-store";

export function Toaster() {
  const toast = useToast();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={copy.toastRegion}
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4"
    >
      {toast ? (
        <div
          key={toast.id}
          className="toast-in pointer-events-auto flex min-h-11 items-center gap-3 rounded-full border border-line bg-surface py-1.5 pr-1.5 pl-4 text-sm shadow-lg shadow-black/50"
        >
          <span>{toast.text}</span>
          {toast.action ? (
            <button
              type="button"
              className="min-h-9 rounded-full px-3 font-semibold text-accent"
              onClick={() => {
                toast.action?.run();
                dismissToast();
              }}
            >
              {toast.action.label}
            </button>
          ) : (
            <span className="w-2" />
          )}
        </div>
      ) : null}
    </div>
  );
}
