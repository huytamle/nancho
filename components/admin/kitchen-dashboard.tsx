"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { logout } from "@/app/actions/auth";
import { BatchBoard } from "@/components/admin/batch-board";
import { DeliveryBoard } from "@/components/admin/delivery-board";
import { OrderDetailSheet } from "@/components/admin/order-detail-sheet";
import { OrderList } from "@/components/admin/order-list";
import { PrepBoard } from "@/components/admin/prep-board";
import { QuickOrderSheet } from "@/components/admin/quick-order-sheet";
import { SettingsPanel } from "@/components/admin/settings-panel";
import { ding, KitchenContext, unlockAudio, useNow, type KitchenCtx } from "@/components/admin/use-admin";
import { WakeLockButton } from "@/components/admin/wake-lock";
import { Toaster } from "@/components/ui/toaster";
import { copy, type KitchenTab } from "@/data/copy";
import { showToast } from "@/lib/client/toast-store";
import type { StaffRole } from "@/lib/domain/order-status";
import type { KitchenDay } from "@/lib/server/dal/kitchen";

const t = copy.admin;
const REFRESH_MS = 20_000;

export const TABS_FOR: Record<StaffRole, KitchenTab[]> = {
  owner: ["chuan-bi", "me", "don", "giao", "cai-dat"],
  kitchen: ["chuan-bi", "me", "don", "giao"],
  shipper: ["giao"],
};

// Lúc client nhận bản dữ liệu mới nhất (để hiện "Cập nhật x giây trước"). Store ngoài React: ghi trong effect.
let received = { key: "", at: 0 };
const receivedSubs = new Set<() => void>();
function markReceived(key: string) {
  if (received.key === key) return;
  received = { key, at: Date.now() };
  receivedSubs.forEach((l) => l());
}
const subscribeReceived = (l: () => void) => {
  receivedSubs.add(l);
  return () => receivedSubs.delete(l);
};

// Mạng (§10.1): banner ngoại tuyến.
const subscribeOnline = (l: () => void) => {
  window.addEventListener("online", l);
  window.addEventListener("offline", l);
  return () => {
    window.removeEventListener("online", l);
    window.removeEventListener("offline", l);
  };
};

export function KitchenDashboard({ day, staff, initialTab }: { day: KitchenDay; staff: { name: string; role: StaffRole }; initialTab: KitchenTab }) {
  const router = useRouter();
  const tabs = TABS_FOR[staff.role];
  const [tab, setTab] = useState<KitchenTab>(tabs.includes(initialTab) ? initialTab : tabs[0]);
  const [detail, setDetail] = useState<{ id: string | null; open: boolean }>({ id: null, open: false });
  const [quickOpen, setQuickOpen] = useState(false);
  const newest = day.orders.reduce((m, o) => (o.createdAt > m ? o.createdAt : m), "");
  const [seenAt, setSeenAt] = useState(newest);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const receivedAt = useSyncExternalStore(subscribeReceived, () => received.at, () => 0);
  const now = useNow(1000);
  const last = useRef({ date: day.date, newest });

  // Tự làm mới mỗi 20 s khi tab hiển thị + ngay khi quay lại tab / có mạng lại.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [router]);

  useEffect(() => {
    document.addEventListener("pointerdown", unlockAudio, { once: true });
    return () => document.removeEventListener("pointerdown", unlockAudio);
  }, []);

  useEffect(() => markReceived(day.serverNow), [day.serverNow]);

  // Có đơn mới (cùng ngày đang xem) → toast + ding.
  useEffect(() => {
    const prev = last.current;
    if (prev.date === day.date && newest > prev.newest) {
      const fresh = day.orders.filter((o) => o.createdAt > prev.newest);
      showToast(t.newOrderToast(fresh[fresh.length - 1].seq));
      ding();
    }
    last.current = { date: day.date, newest };
  }, [day.date, day.orders, newest]);

  const unseen = tab === "don" ? 0 : day.orders.filter((o) => o.createdAt > seenAt && o.status !== "cancelled").length;

  function urlFor(date: string, next: KitchenTab) {
    return `/admin/kitchen?ngay=${date}&tab=${next}`;
  }

  function switchTab(next: KitchenTab) {
    if (tab === "don" || next === "don") setSeenAt(newest);
    setTab(next);
    window.history.replaceState(null, "", urlFor(day.date, next));
  }

  const ctx: KitchenCtx = {
    day,
    role: staff.role,
    goTo(next, opts) {
      switchTab(next);
      if (opts?.batchId) setTimeout(() => document.getElementById(`me-${opts.batchId}`)?.scrollIntoView({ block: "start" }), 50);
      else window.scrollTo({ top: 0 });
    },
    openOrder: (id) => setDetail({ id, open: true }),
    openQuickOrder: () => setQuickOpen(true),
  };

  const ageSec = receivedAt && now ? Math.max(0, Math.round((now - receivedAt) / 1000)) : 0;
  const detailOrder = day.orders.find((o) => o.id === detail.id) ?? null;

  return (
    <KitchenContext value={ctx}>
      <div className="lg:grid lg:min-h-dvh lg:grid-cols-[13rem_1fr]">
        <nav
          aria-label={t.tabsLabel}
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] lg:sticky lg:top-0 lg:h-dvh lg:border-t-0 lg:border-r lg:pt-20 lg:pb-0"
        >
          <ul className="mx-auto flex max-w-3xl lg:flex-col lg:gap-1 lg:px-3">
            {tabs.map((k) => (
              <li key={k} className="flex-1">
                <button
                  type="button"
                  onClick={() => switchTab(k)}
                  aria-current={tab === k ? "page" : undefined}
                  className={`relative flex min-h-16 w-full items-center justify-center px-0.5 text-sm font-semibold whitespace-nowrap lg:justify-start lg:rounded-2xl lg:px-4 ${
                    tab === k ? "text-accent lg:bg-elevated lg:text-text" : "text-secondary"
                  }`}
                >
                  {t.tabs[k]}
                  {k === "don" && unseen > 0 ? (
                    <span className="ml-1.5 inline-flex min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs leading-6 text-on-accent tabular-nums">
                      <span className="sr-only">{t.newOrders(unseen)}: </span>
                      {unseen}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-line bg-header pt-[env(safe-area-inset-top)] backdrop-blur-xl">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 py-2">
              <p className="mr-auto text-sm font-semibold tracking-[0.12em]">{t.brand}</p>
              <label className="sr-only" htmlFor="kitchen-day">
                {t.day}
              </label>
              <select
                id="kitchen-day"
                value={day.date}
                onChange={(e) => router.push(urlFor(e.target.value, tab))}
                className="input min-h-11 !w-auto appearance-none bg-[length:12px] bg-[right_0.75rem_center] bg-no-repeat !pr-9 text-[15px] font-semibold"
              >
                {day.days.some((d) => d.date === day.date) ? null : <option value={day.date}>{day.dayLabel}</option>}
                {day.days.map((d) => (
                  <option key={d.date} value={d.date}>
                    {d.label} · {d.date.slice(8)}/{d.date.slice(5, 7)}
                  </option>
                ))}
              </select>
              <WakeLockButton />
              <form action={logout}>
                <button type="submit" className="min-h-11 rounded-full px-3 text-sm text-secondary hover:text-text">
                  {t.logout} <span className="sr-only">({staff.name})</span>
                </button>
              </form>
            </div>
            <p className="mx-auto max-w-3xl px-4 pb-1.5 text-xs text-secondary" aria-live="off">
              {staff.name} · {t.updated(ageSec)}
            </p>
            {online ? null : (
              <p role="status" className="bg-warn px-4 py-2 text-center text-sm font-semibold text-black">
                {t.offline}
              </p>
            )}
          </header>

          <main id="noi-dung" className="mx-auto max-w-3xl px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-10">
            <h1 className="sr-only">{t.tabs[tab]}</h1>
            {tab === "chuan-bi" ? <PrepBoard /> : null}
            {tab === "me" ? <BatchBoard /> : null}
            {tab === "don" ? <OrderList /> : null}
            {tab === "giao" ? <DeliveryBoard /> : null}
            {tab === "cai-dat" ? <SettingsPanel /> : null}
          </main>
        </div>
      </div>

      <OrderDetailSheet order={detailOrder} open={detail.open} onClose={() => setDetail((d) => ({ ...d, open: false }))} />
      {staff.role !== "shipper" ? <QuickOrderSheet open={quickOpen} onClose={() => setQuickOpen(false)} /> : null}
      <Toaster />
    </KitchenContext>
  );
}
