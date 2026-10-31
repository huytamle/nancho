import { connection } from "next/server";
import { OvenBarLive } from "@/components/store/oven-bar-live";
import type { OvenSnapshot } from "@/lib/domain/oven-status";
import { serverNow } from "@/lib/server/clock";
import { getOvenSnapshot } from "@/lib/server/dal/schedule";

// Động, stream trong <Suspense> (§5.3). DB lỗi → vẫn hiện thanh lò (báo "chưa xem được"), không sập trang.
export async function OvenBarServer() {
  await connection();
  let initial: OvenSnapshot | null = null;
  try {
    initial = await getOvenSnapshot(serverNow());
  } catch (err) {
    console.error("oven snapshot failed", err);
  }
  return <OvenBarLive initial={initial} />;
}

/** Fallback cùng chiều cao với thanh mở rộng → CLS = 0. */
export function OvenBarSkeleton() {
  return (
    <div className="oven-bar sticky top-0 z-30 border-b border-line bg-header backdrop-blur-xl">
      <div className="mx-auto max-w-5xl px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <div className="h-5 w-64 max-w-full animate-pulse rounded-full bg-elevated" />
        <div className="mt-2 h-4 w-48 animate-pulse rounded-full bg-elevated" />
        <div className="mt-3 flex gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-11 w-32 animate-pulse rounded-full bg-elevated" />
          ))}
        </div>
      </div>
    </div>
  );
}
