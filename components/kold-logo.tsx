import Image from "next/image";

export function KoldLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex ${className}`}>
      <Image
        src="/images/brand/kold-lockup.jpg"
        alt="KOLD Gelato"
        width={640}
        height={360}
        className="h-24 w-auto max-w-sm object-contain object-left sm:h-28"
      />
    </span>
  );
}
