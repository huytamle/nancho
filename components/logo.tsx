import Image from "next/image";
import { site } from "@/data/site";

export function Logo({
  compact = false,
  className = "",
  preload = false,
}: {
  compact?: boolean;
  className?: string;
  preload?: boolean;
}) {
  const size = compact ? "h-9 w-16 object-cover" : "h-11 w-[5rem] object-cover";

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {/* Logo nền đen = một "con tem" bo góc — hợp cả giao diện sáng lẫn tối. */}
      <Image src="/images/brand/logo-mark.jpg" alt="" width={160} height={90} className={`rounded-lg ${size}`} preload={preload} />
      <span className="text-[0.95rem] font-semibold tracking-[0.14em]">{site.name}</span>
    </span>
  );
}
