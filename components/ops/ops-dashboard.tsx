"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import { ExpensePanel } from "@/components/ops/expense-panel";
import { MetricsPanel } from "@/components/ops/metrics-panel";
import { ChecklistPanel } from "@/components/ops/checklist-panel";
import { PayrollPanel } from "@/components/ops/payroll-panel";
import { TimePanel } from "@/components/ops/time-panel";
import { ShiftPanel } from "@/components/ops/shift-panel";
import { StaffPanel } from "@/components/ops/staff-panel";
import { QuickCount, StockAlerts, StockPanel } from "@/components/ops/stock-panel";
import { Toaster } from "@/components/ui/toaster";
import { copy } from "@/data/copy";
import { opsCopy, type OpsTab } from "@/data/copy-ops";
import type { WorkView } from "@/lib/server/dal/checklist";
import type { OpsView } from "@/lib/server/dal/ops";
import type { PayrollView, TimeView } from "@/lib/server/dal/payroll";
import type { OvenLockView } from "@/lib/server/dal/sale-day";
import type { StockView } from "@/lib/server/dal/stock";
import type { CafeView } from "@/lib/server/dal/cafe";
import type { MetricsView } from "@/lib/server/dal/metrics";

const t = opsCopy;

/** Tab theo quyền: chi phí chỉ owner/manager, lương chỉ owner, kho cho owner/manager/bếp/pha chế (§17.2). */
export const opsTabsFor = (v: OpsView["viewer"], stock = false, metrics = false): OpsTab[] => {
  const tabs: OpsTab[] = v.isOwner
    ? ["ca", "viec", "cong", "chi", "luong", "so-tay", "nhan-vien"]
    : v.canSpend
      ? ["ca", "viec", "cong", "chi", "so-tay", "nhan-vien"]
      : ["ca", "viec", "cong", "so-tay", "nhan-vien"];
  if (stock) tabs.splice(tabs.indexOf("so-tay"), 0, "kho");
  if (metrics) tabs.splice(tabs.indexOf("so-tay"), 0, "chi-so");
  return tabs;
};

// Màn Vận hành (§17): Ca & két · Việc · Chi phí · Sổ tay · Nhân viên. Dữ liệu từ server; mutation gọi refresh() nên không cần poll.
// Sổ tay là Server Component dựng sẵn (`handbook`) — Markdown không xuống client.
export function OpsDashboard({
  view,
  work,
  time,
  payroll,
  lock,
  stock,
  metrics,
  canMetrics,
  cafe,
  handbook,
  bookPage,
  initialTab,
  kitchen,
}: {
  view: OpsView;
  work: WorkView;
  time: TimeView;
  payroll: PayrollView | null;
  /** Khoá lò (§18.1) — chỉ owner/manager/kitchen. */
  lock: OvenLockView | null;
  /** Kho (§17.8) — null nếu không có vai trò kho. */
  stock: StockView | null;
  /** Chỉ số (§17.10) — chỉ dựng khi mở tab `chi-so` (owner/manager). */
  metrics: MetricsView | null;
  canMetrics: boolean;
  /** Kho café (M11) — owner/manager/pha chế. */
  cafe: CafeView | null;
  handbook: ReactNode;
  bookPage: string | null;
  initialTab: OpsTab;
  kitchen: boolean;
}) {
  const tabs = opsTabsFor(view.viewer, stock !== null, canMetrics);
  const [tab, setTab] = useState<OpsTab>(tabs.includes(initialTab) ? initialTab : "ca");
  const router = useRouter();

  function switchTab(next: OpsTab) {
    setTab(next);
    // Sổ tay giữ `trang=` đang xem — nội dung `handbook` đã dựng ở server cho đúng trang đó.
    let page = next === "so-tay" && bookPage ? `&trang=${encodeURIComponent(bookPage)}` : "";
    // Chỉ số dựng ở server khi mở tab → điều hướng thật (giữ kỳ đang xem).
    if (next === "chi-so" && !metrics) {
      const q = new URLSearchParams(window.location.search);
      router.push(`/admin/van-hanh?tab=chi-so${q.get("ky") ? `&ky=${encodeURIComponent(q.get("ky")!)}` : ""}`);
      setTab(next);
      return;
    }
    // Công/Lương giữ kỳ (`ky`) và tuần lịch ca (`tuan`) đang xem — dữ liệu đã dựng theo chúng.
    if (next === "cong" || next === "luong") {
      const q = new URLSearchParams(window.location.search);
      for (const k of ["ky", "tuan"]) if (q.get(k)) page += `&${k}=${encodeURIComponent(q.get(k)!)}`;
    }
    window.history.replaceState(null, "", `/admin/van-hanh?tab=${next}${page}`);
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[13rem_1fr]">
      <nav
        aria-label={t.tabsLabel}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] lg:sticky lg:top-0 lg:h-dvh lg:border-t-0 lg:border-r lg:pt-20 lg:pb-0"
      >
        <ul className="mx-auto flex max-w-3xl lg:flex-col lg:gap-1 lg:px-3">
          {tabs.map((k) => (
            <li key={k} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => switchTab(k)}
                aria-current={tab === k ? "page" : undefined}
                // > 5 tab trên điện thoại (owner/manager): chữ nhỏ hơn, cho xuống 2 dòng thay vì tràn ngang.
                className={`flex min-h-16 w-full items-center justify-center px-0.5 text-center font-semibold lg:justify-start lg:rounded-2xl lg:px-4 lg:text-sm lg:whitespace-nowrap ${
                  tabs.length > 7 ? "text-[12px] leading-tight" : tabs.length > 5 ? "text-[13px] leading-tight" : "text-sm whitespace-nowrap"
                } ${
                  tab === k ? "text-accent lg:bg-elevated lg:text-text" : "text-secondary"
                }`}
              >
                {t.tabs[k]}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-line bg-header pt-[env(safe-area-inset-top)] backdrop-blur-xl">
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2">
            <p className="mr-auto text-sm font-semibold tracking-[0.12em]">{t.brand}</p>
            {kitchen ? (
              <Link href="/admin/kitchen" className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-secondary hover:text-text">
                {t.kitchenLink}
              </Link>
            ) : null}
            <form action={logout}>
              <button type="submit" className="min-h-11 rounded-full px-3 text-sm text-secondary hover:text-text">
                {copy.admin.logout} <span className="sr-only">({view.viewer.name})</span>
              </button>
            </form>
          </div>
          <p className="mx-auto max-w-3xl px-4 pb-1.5 text-xs text-secondary">{view.viewer.name}</p>
        </header>

        <main id="noi-dung" className="mx-auto max-w-3xl px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-10">
          <h1 className="sr-only">
            {t.metaTitle} — {t.tabs[tab]}
          </h1>
          {tab === "ca" ? (
            <ShiftPanel view={view} work={work} lock={lock} />
          ) : tab === "viec" ? (
            <div className="space-y-5">
              {stock ? <StockAlerts stock={stock} /> : null}
              <ChecklistPanel work={work} />
              {stock ? <QuickCount stock={stock} /> : null}
            </div>
          ) : tab === "kho" && stock ? (
            <StockPanel stock={stock} cafe={cafe} />
          ) : tab === "chi-so" ? (
            metrics ? <MetricsPanel view={metrics} /> : <div className="h-80 animate-pulse rounded-tile bg-surface" aria-busy />
          ) : tab === "cong" ? (
            <TimePanel time={time} />
          ) : tab === "chi" ? (
            <ExpensePanel view={view} />
          ) : tab === "luong" && payroll ? (
            <PayrollPanel view={payroll} />
          ) : tab === "so-tay" ? (
            handbook
          ) : (
            <StaffPanel view={view} />
          )}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
