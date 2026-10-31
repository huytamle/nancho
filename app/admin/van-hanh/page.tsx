import type { Metadata } from "next";
import { Suspense } from "react";
import { OpsDashboard } from "@/components/ops/ops-dashboard";
import { opsCopy, type OpsTab } from "@/data/copy-ops";
import { requireStaff } from "@/lib/server/auth/session";
import { serverNow } from "@/lib/server/clock";
import { loadOpsView } from "@/lib/server/dal/ops";

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
  const tab = (await searchParams).tab;
  const view = await loadOpsView({ id: staff.id, name: staff.name, roles: staff.roles }, serverNow());
  const initial = typeof tab === "string" && tab in opsCopy.tabs ? (tab as OpsTab) : "ca";
  return <OpsDashboard view={view} initialTab={initial} kitchen={staff.role !== null} />;
}

function Skeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pt-20" aria-hidden>
      <div className="h-36 animate-pulse rounded-tile bg-surface" />
      <div className="h-80 animate-pulse rounded-tile bg-surface" />
    </div>
  );
}
