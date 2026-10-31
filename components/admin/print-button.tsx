"use client";

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="min-h-11 rounded-full bg-black px-5 font-semibold text-white">
      🖨 {label}
    </button>
  );
}
