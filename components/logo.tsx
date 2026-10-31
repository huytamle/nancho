import Image from "next/image";
import { site } from "@/data/site";

export function Logo({
  compact = false,
  className = "",
  priority = false,
}: {
  compact?: boolean;
  className?: string;
  priority?: boolean;
}) {
  const size = compact
    ? "h-9 w-16 object-contain"
    : "h-11 w-[5rem] object-contain";

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Image
        src="/images/brand/logo-mark.jpg"
        alt=""
        width={160}
        height={90}
        className={`${size} hidden dark:block`}
        priority={priority}
      />
      <span className="text-[0.95rem] font-semibold tracking-[0.14em]">
        {site.name}
      </span>
    </span>
  );
}
