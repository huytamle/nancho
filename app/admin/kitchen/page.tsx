import { Suspense } from "react";
import { KitchenDashboard } from "@/components/admin/kitchen-dashboard";
import { copy, type KitchenTab } from "@/data/copy";
import { isISODate, vnDateOf } from "@/lib/domain/time";
import { requireKitchenStaff } from "@/lib/server/auth/session";
import { serverNow } from "@/lib/server/clock";
import { loadKitchenDay } from "@/lib/server/dal/kitchen";
import { loadOvenLock } from "@/lib/server/dal/sale-day";

// Kitchen Dashboard (§10): một màn hình, 5 tab; `?ngay=YYYY-MM-DD&tab=…` (link trong tin Telegram dùng đúng dạng này).
// Động hoàn toàn, không cache dữ liệu admin (§5.3); phiên đọc trong <Suspense>.
export default function KitchenPage({ searchParams }: PageProps<"/admin/kitchen">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Kitchen searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Kitchen({ searchParams }: Pick<PageProps<"/admin/kitchen">, "searchParams">) {
  const staff = await requireKitchenStaff();
  const sp = await searchParams;
  const now = serverNow();
  const ngay = one(sp.ngay);
  const tab = one(sp.tab);
  const date = ngay && isISODate(ngay) ? ngay : vnDateOf(now);
  // Khoá lò (§18.1) luôn nói về hôm nay, bất kể ngày đang xem; shipper không thấy.
  const [day, lock] = await Promise.all([loadKitchenDay(date, now), staff.role === "shipper" ? null : loadOvenLock(now)]);
  return (
    <KitchenDashboard
      day={day}
      lock={lock}
      staff={{ name: staff.name, role: staff.role, orderRoles: staff.orderRoles, roles: staff.roles }}
      initialTab={tab && tab in copy.admin.tabs ? (tab as KitchenTab) : "chuan-bi"}
    />
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pt-20" aria-hidden>
      <div className="h-36 animate-pulse rounded-tile bg-surface" />
      <div className="h-80 animate-pulse rounded-tile bg-surface" />
    </div>
  );
}
