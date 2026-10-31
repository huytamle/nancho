"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { copy } from "@/data/copy";
import { useClock } from "@/lib/client/use-clock";
import { holdLabel } from "@/lib/domain/hold";
import { vnTimeLabel } from "@/lib/domain/time";

/**
 * "Giữ suất đến 17:32 · còn 12 phút" (§18.2). Hết giờ → làm mới trang để server huỷ đơn & hiện "Hết thời gian giữ suất".
 * `refreshOnExpire` = false ở màn thành công (sheet trên trang đặt món).
 */
export function HoldCountdown({ until, refreshOnExpire = true, className = "" }: { until: string; refreshOnExpire?: boolean; className?: string }) {
  const router = useRouter();
  const now = useClock(1000);
  const end = new Date(until);
  const label = now ? holdLabel(end, new Date(now)) : null;
  const expired = label?.expired ?? false;
  useEffect(() => {
    if (!expired || !refreshOnExpire) return;
    // Server chỉ huỷ khi đã quá hạn → chờ thêm 2 giây cho chắc rồi mới làm mới.
    const id = setTimeout(() => router.refresh(), 2000);
    return () => clearTimeout(id);
  }, [expired, refreshOnExpire, router]);

  return (
    <div role="status" className={`rounded-field border-2 border-warn/70 bg-warn/10 px-4 py-3 text-left ${className}`}>
      <p className="font-semibold tabular-nums">⏳ {copy.receipt.hold(vnTimeLabel(end), label?.remaining ?? "")}</p>
      <p className="mt-1 text-sm text-secondary">{copy.receipt.holdHint}</p>
    </div>
  );
}
