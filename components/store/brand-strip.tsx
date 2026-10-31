import { Logo } from "@/components/logo";
import { WhyPreorder } from "@/components/store/why-preorder-sheet";
import { copy } from "@/data/copy";

export function BrandStrip() {
  return (
    <header className="flex items-start justify-between gap-3 pt-5 pb-4">
      <div className="min-w-0">
        <Logo compact />
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-balance">{copy.store.tagline}</h1>
        <p className="mt-0.5 text-sm text-secondary">{copy.store.kicker}</p>
      </div>
      <WhyPreorder />
    </header>
  );
}
