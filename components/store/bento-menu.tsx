"use client";

import { ProductTile, type TileShape } from "@/components/store/product-tile";
import type { StoreProduct } from "@/components/store/store-provider";
import { useOrder } from "@/components/store/use-order";
import { WhyPreorder } from "@/components/store/why-preorder-sheet";
import { copy } from "@/data/copy";
import { dispatch } from "@/lib/client/cart-store";
import type { Segment } from "@/lib/domain/types";

// Bento "Ít mà Chất" (§9.4) chia 2 tab (M12): Pizza & BBQ (mẻ T6–CN) · Cà phê (giao theo khung mỗi ngày).
// Thứ tự theo products.sort. Sốt chấm & nước lon nằm dưới tab pizza (chỉ bán kèm).
const SHAPE_OF: Record<StoreProduct["kind"], TileShape> = { combo: "hero", pizza: "tall", bbq: "wide", addon: "small", drink: "small", cafe: "tall" };
const t = copy.menu;

export function BentoMenu({ products }: { products: StoreProduct[] }) {
  const { cart, segment: orderSegment, count } = useOrder();
  const tab = cart.segment;
  const mains = products.filter((p) => p.kind === "combo" || p.kind === "pizza" || p.kind === "bbq");
  const sauces = products.filter((p) => p.kind === "addon");
  const drinks = products.filter((p) => p.kind === "drink");
  const cafe = products.filter((p) => p.kind === "cafe");
  const other = count > 0 && orderSegment !== tab;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div role="tablist" aria-label={t.tabsLabel} className="inline-flex rounded-full bg-elevated p-1">
          {(["pizza", "cafe"] as Segment[]).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              id={`tab-${s}`}
              aria-selected={tab === s}
              aria-controls={`panel-${s}`}
              onClick={() => dispatch({ type: "segment", segment: s })}
              className={`min-h-11 rounded-full px-5 text-sm font-semibold transition ${tab === s ? "bg-invert text-on-invert shadow" : "text-secondary hover:text-text"}`}
            >
              {t.tabs[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-start gap-1">
        <p className="max-w-2xl flex-1 text-[15px] leading-relaxed text-secondary">{t.tabNote[tab]}</p>
        {tab === "pizza" ? <WhyPreorder /> : null}
      </div>
      {other ? (
        <p role="status" className="mt-3 rounded-field border border-warn/40 px-3 py-2 text-sm">
          {t.otherCart(orderSegment)}
        </p>
      ) : null}

      <div id="panel-pizza" role="tabpanel" aria-labelledby="tab-pizza" hidden={tab !== "pizza"} className="mt-6">
        <div className="grid grid-flow-dense grid-cols-2 gap-3 lg:auto-rows-[200px] lg:grid-cols-4">
          {mains.map((p) => (
            <ProductTile key={p.id} product={p} shape={SHAPE_OF[p.kind]} />
          ))}
        </div>
        {sauces.length > 0 ? (
          <SmallGrid id="sot-cham" title={t.sauces} note={t.saucesNote} products={sauces} />
        ) : null}
        {drinks.length > 0 ? <SmallGrid id="nuoc-lanh" title={t.drinks} note={t.drinksNote} products={drinks} /> : null}
      </div>

      <div id="panel-cafe" role="tabpanel" aria-labelledby="tab-cafe" hidden={tab !== "cafe"} className="mt-6">
        <div className="grid grid-cols-2 gap-3 lg:auto-rows-[190px] lg:grid-cols-3">
          {cafe.map((p) => (
            <ProductTile key={p.id} product={p} shape="tall" />
          ))}
        </div>
      </div>
    </div>
  );
}

function SmallGrid({ id, title, note, products }: { id: string; title: string; note: string; products: StoreProduct[] }) {
  return (
    <div className="mt-10" aria-labelledby={id}>
      <h3 id={id} className="text-xl font-semibold tracking-tight">
        {title}
      </h3>
      <p className="mt-1 mb-4 text-sm text-secondary">{note}</p>
      <div className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
        {products.map((p) => (
          <ProductTile key={p.id} product={p} shape="small" />
        ))}
      </div>
    </div>
  );
}
