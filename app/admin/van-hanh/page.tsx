import type { Metadata } from "next";
import { Suspense } from "react";
import { HandbookPanel } from "@/components/ops/handbook-panel";
import { OpsDashboard } from "@/components/ops/ops-dashboard";
import { opsCopy, type OpsTab } from "@/data/copy-ops";
import { requireStaff } from "@/lib/server/auth/session";
import { serverNow } from "@/lib/server/clock";
import { loadWorkView } from "@/lib/server/dal/checklist";
import { loadHandbookView } from "@/lib/server/dal/handbook";
import { loadOpsView } from "@/lib/server/dal/ops";
import { loadOvenLock, SALE_DAY_ROLES } from "@/lib/server/dal/sale-day";
import { loadStockView } from "@/lib/server/dal/stock";
import { loadCafeView } from "@/lib/server/dal/cafe";
import { canSeeMetrics, loadMetricsView } from "@/lib/server/dal/metrics";
import { hasRole } from "@/lib/domain/roles";
import { loadPayrollView, loadTimeView } from "@/lib/server/dal/payroll";
import { isISODate } from "@/lib/domain/time";
import { isPeriod } from "@/lib/domain/worktime";
import { clientIp } from "@/lib/server/rate-limit";

export const metadata: Metadata = { title: opsCopy.metaTitle };

// Vận hành nội bộ (§17): mọi nhân viên đăng nhập đều vào được; quyền từng phần nằm ở DTO + DAL.
export default function OpsPage({ searchParams }: PageProps<"/admin/van-hanh">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Ops searchParams={searchParams} />
    </Suspense>
  );
}

async function Ops({ searchParams }: Pick<PageProps<"/admin/van-hanh">, "searchParams">) {
  const staff = await requireStaff();
  const { tab, trang, ky, tuan } = await searchParams;
  const actor = { id: staff.id, name: staff.name, roles: staff.roles };
  const now = serverNow();
  const initial = typeof tab === "string" && tab in opsCopy.tabs ? (tab as OpsTab) : "ca";
  // Chỉ dựng (và ghi log xem) trang sổ tay khi đang mở tab Sổ tay với `trang=`.
  const slug = initial === "so-tay" && typeof trang === "string" ? trang.slice(0, 60) : null;
  // `ky` = kỳ bảng công/lương (YYYY-MM), `tuan` = tuần lịch ca (một ngày bất kỳ trong tuần).
  const period = typeof ky === "string" && isPeriod(ky) ? ky : null;
  const week = typeof tuan === "string" && isISODate(tuan) ? tuan : null;
  const ip = await clientIp();
  const [view, work, book, time, payroll, lock, stock, metrics, cafe] = await Promise.all([
    loadOpsView(actor, now),
    loadWorkView(actor, now),
    loadHandbookView(actor, slug, now),
    loadTimeView(actor, now, { ip, period, week }),
    loadPayrollView(actor, now, { period }),
    hasRole(staff.roles, SALE_DAY_ROLES) ? loadOvenLock(now) : null,
    loadStockView(actor, now),
    // Chỉ số chỉ dựng khi mở tab (nhiều truy vấn tổng hợp); null nếu không có quyền.
    initial === "chi-so" ? loadMetricsView(actor, now, { period }) : null,
    loadCafeView(actor, now),
  ]);
  return (
    <OpsDashboard
      view={view}
      work={work}
      time={time}
      payroll={payroll}
      lock={lock}
      stock={stock}
      metrics={metrics}
      canMetrics={canSeeMetrics(actor)}
      cafe={cafe}
      handbook={<HandbookPanel view={book} now={now.toISOString()} />}
      bookPage={book.page?.slug ?? null}
      initialTab={initial}
      kitchen={staff.role !== null}
    />
  );
}

function Skeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pt-20" aria-hidden>
      <div className="h-36 animate-pulse rounded-tile bg-surface" />
      <div className="h-80 animate-pulse rounded-tile bg-surface" />
    </div>
  );
}
