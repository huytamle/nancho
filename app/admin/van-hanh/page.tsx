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
  const { tab, trang } = await searchParams;
  const actor = { id: staff.id, name: staff.name, roles: staff.roles };
  const now = serverNow();
  const initial = typeof tab === "string" && tab in opsCopy.tabs ? (tab as OpsTab) : "ca";
  // Chỉ dựng (và ghi log xem) trang sổ tay khi đang mở tab Sổ tay với `trang=`.
  const slug = initial === "so-tay" && typeof trang === "string" ? trang.slice(0, 60) : null;
  const [view, work, book] = await Promise.all([loadOpsView(actor, now), loadWorkView(actor, now), loadHandbookView(actor, slug, now)]);
  return (
    <OpsDashboard
      view={view}
      work={work}
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
