"use client";

import { useEffect, useRef, useState } from "react";
import { copy } from "@/data/copy";
import { showToast } from "@/lib/client/toast-store";

const t = copy.admin;

// "Chế độ bếp" (§10.1): Screen Wake Lock giữ màn hình sáng; trình duyệt nhả khoá khi ẩn tab → xin lại khi hiện.
export function WakeLockButton() {
  const [on, setOn] = useState(false);
  const lock = useRef<WakeLockSentinel | null>(null);

  async function acquire() {
    try {
      lock.current = await navigator.wakeLock.request("screen");
      return true;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    if (!on) return;
    const again = () => {
      if (document.visibilityState === "visible" && (!lock.current || lock.current.released)) void acquire();
    };
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, [on]);

  useEffect(() => () => void lock.current?.release(), []);

  async function toggle() {
    if (on) {
      await lock.current?.release();
      lock.current = null;
      setOn(false);
      return;
    }
    if (!("wakeLock" in navigator) || !(await acquire())) {
      showToast(t.wakeUnsupported);
      return;
    }
    setOn(true);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      className={`min-h-11 rounded-full px-3 text-sm font-semibold ${on ? "bg-live text-black" : "bg-elevated text-secondary"}`}
    >
      {on ? "☀ " : ""}
      {t.wakeOff}
      <span className="sr-only">{on ? `: ${t.wakeOn}` : ""}</span>
    </button>
  );
}
