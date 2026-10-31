"use client";

import Link from "next/link";
import { useState } from "react";
import { logout } from "@/app/actions/auth";
import { ExpensePanel } from "@/components/ops/expense-panel";
import { ShiftPanel } from "@/components/ops/shift-panel";
import { StaffPanel } from "@/components/ops/staff-panel";
import { Toaster } from "@/components/ui/toaster";
import { copy } from "@/data/copy";
import { opsCopy, type OpsTab } from "@/data/copy-ops";
import type { OpsView } from "@/lib/server/dal/ops";

const t = opsCopy;

/** Tab theo quyền: chi phí chỉ owner/manager (§17.2). */
export const opsTabsFor = (v: OpsView["viewer"]): OpsTab[] => (v.canSpend ? ["ca", "chi", "nhan-vien"] : ["ca", "nhan-vien"]);

// Màn Vận hành (§17): Ca & két · Chi phí · Nhân viên. Dữ liệu từ server; mutation gọi refresh() nên không cần poll.
export function OpsDashboard({ view, initialTab, kitchen }: { view: OpsView; initialTab: OpsTab; kitchen: boolean }) {
  const tabs = opsTabsFor(view.viewer);
  const [tab, setTab] = useState<OpsTab>(tabs.includes(initialTab) ? initialTab : "ca");

  function switchTab(next: OpsTab) {
    setTab(next);
    window.history.replaceState(null, "", `/admin/van-hanh?tab=${next}`);
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
            <li key={k} className="flex-1">
              <button
                type="button"
                onClick={() => switchTab(k)}
                aria-current={tab === k ? "page" : undefined}
                className={`flex min-h-16 w-full items-center justify-center px-0.5 text-sm font-semibold whitespace-nowrap lg:justify-start lg:rounded-2xl lg:px-4 ${
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
          {tab === "ca" ? <ShiftPanel view={view} /> : tab === "chi" ? <ExpensePanel view={view} /> : <StaffPanel view={view} />}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
