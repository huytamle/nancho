import { ProductTile, type TileShape } from "@/components/store/product-tile";
import type { StoreProduct } from "@/components/store/store-provider";
import { copy } from "@/data/copy";

// Bento "Ít mà Chất" (§9.4): Combo (hero) → pizza → BBQ → add-on. Thứ tự theo products.sort.
const SHAPE_OF: Record<StoreProduct["kind"], TileShape> = { combo: "hero", pizza: "tall", bbq: "wide", addon: "small" };

export function BentoMenu({ products }: { products: StoreProduct[] }) {
  const mains = products.filter((p) => p.kind !== "addon");
  const addons = products.filter((p) => p.kind === "addon");
  const heroId = mains.find((p) => p.kind === "combo")?.id ?? mains[0]?.id;

  return (
    <section aria-labelledby="thuc-don">
      <h2 id="thuc-don" className="sr-only">
        {copy.store.menuTitle}
      </h2>
      <div className="grid grid-flow-dense grid-cols-2 gap-3 lg:auto-rows-[200px] lg:grid-cols-4">
        {mains.map((p) => (
          <ProductTile key={p.id} product={p} shape={SHAPE_OF[p.kind]} preload={p.id === heroId} />
        ))}
      </div>
      {addons.length > 0 ? (
        <>
          <h2 className="mt-7 mb-3 text-[11px] font-medium tracking-[0.22em] text-secondary uppercase">{copy.store.addonsTitle}</h2>
          <div className="grid grid-cols-3 gap-x-3 gap-y-4 lg:grid-cols-6">
            {addons.map((p) => (
              <ProductTile key={p.id} product={p} shape="small" />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
