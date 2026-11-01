"use client";

import Image from "next/image";
import { useCatalog, type StoreProduct } from "@/components/store/store-provider";
import { addToCart, productAvailability, useOrder } from "@/components/store/use-order";
import { copy } from "@/data/copy";
import { openSheet } from "@/lib/client/sheet-url";
import { isExtra, segmentOf } from "@/lib/domain/types";
import { formatPrice } from "@/lib/format";

export type TileShape = "hero" | "tall" | "wide" | "small";

const SHAPE: Record<TileShape, { box: string; sizes: string }> = {
  hero: { box: "col-span-2 aspect-[16/10] lg:row-span-2 lg:aspect-auto", sizes: "(min-width: 1024px) 496px, calc(100vw - 32px)" },
  tall: { box: "aspect-[3/4] lg:row-span-2 lg:aspect-auto", sizes: "(min-width: 1024px) 240px, calc(50vw - 22px)" },
  wide: { box: "col-span-2 aspect-[2/1] lg:aspect-auto", sizes: "(min-width: 1024px) 496px, calc(100vw - 32px)" },
  small: { box: "", sizes: "(min-width: 1024px) 160px, calc(33vw - 16px)" },
};

export function ProductTile({ product, shape, preload = false }: { product: StoreProduct; shape: TileShape; preload?: boolean }) {
  const { cart, slot, req, segment } = useOrder();
  const { byId } = useCatalog();
  const t = copy.product;
  const inCart = cart.items.reduce(
    (n, i) => n + (i.productId === product.id ? i.qty : 0) + i.addons.reduce((m, a) => m + (a.productId === product.id ? a.qty : 0), 0),
    0,
  );
  // Chưa có dữ liệu lò (đang stream) → không vội báo hết. Món khác segment với giỏ: chỉ báo hết món, không xét mẻ.
  const sameSegment = isExtra(product.kind) || segmentOf(product.kind) === segment;
  const avail =
    slot && sameSegment ? productAvailability(product, slot, req) : product.isAvailable ? null : productAvailability(product, null, req);
  const blocked = avail !== null && !avail.ok;
  const label = blocked ? (avail.reason === "sold_out" ? t.soldOutToday : t.noRoom(slot?.readyLabel ?? "")) : null;
  const quick = product.kind !== "combo";
  const small = shape === "small";

  function quickAdd() {
    if (!quick || blocked) return openSheet({ mon: product.id });
    addToCart(product, { productId: product.id, qty: 1, addons: [] }, byId);
  }

  const plus = (
    <button
      type="button"
      onClick={quickAdd}
      aria-label={t.add(product.name)}
      className="pointer-events-auto relative inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-lg shadow-black/30 transition active:scale-95"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-5">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      {inCart > 0 ? (
        <span className="absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-on-accent tabular-nums">
          <span className="sr-only">{t.inCart(inCart)}</span>
          <span aria-hidden>{inCart}</span>
        </span>
      ) : null}
    </button>
  );

  if (small) {
    return (
      <article className="group relative">
        <div className="relative aspect-square overflow-hidden rounded-3xl bg-surface">
          <Image
            src={product.image}
            unoptimized={product.image.endsWith(".svg")}
            alt={product.name}
            fill
            sizes={SHAPE.small.sizes}
            className={`object-cover transition duration-500 ease-[var(--ease-out)] group-hover:scale-[1.04] ${blocked ? "opacity-70 grayscale-[60%]" : ""}`}
          />
          <button
            type="button"
            onClick={() => openSheet({ mon: product.id })}
            className="absolute inset-0 z-10 rounded-3xl"
            aria-label={t.open(product.name)}
          />
          <div className="absolute right-1.5 bottom-1.5 z-20">{plus}</div>
        </div>
        <h3 className="mt-2 line-clamp-2 text-[13px] leading-snug font-medium">{product.name}</h3>
        <p className="text-[13px] font-semibold tabular-nums">
          {formatPrice(product.price)}
          {product.listPrice && product.listPrice > product.price ? (
            <>
              {" "}
              <s className="font-normal text-secondary">
                <span className="sr-only">{t.listPrice} </span>
                {formatPrice(product.listPrice)}
              </s>
            </>
          ) : null}
        </p>
        {label ? <p className="text-[12px] font-medium text-warn">{label}</p> : null}
      </article>
    );
  }

  const showGinger = (product.kind === "combo" || product.kind === "bbq") && shape !== "tall";

  return (
    <article className={`tile group relative overflow-hidden rounded-tile bg-surface ${SHAPE[shape].box}`}>
      <Image
        src={product.image}
        unoptimized={product.image.endsWith(".svg")}
        alt={product.name}
        fill
        preload={preload}
        fetchPriority={preload ? "high" : undefined}
        sizes={SHAPE[shape].sizes}
        className={`object-cover transition duration-500 ease-[var(--ease-out)] group-hover:scale-[1.04] ${blocked ? "grayscale-[60%] opacity-70" : ""}`}
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
      {shape === "hero" ? <div aria-hidden className="absolute -inset-x-10 -bottom-24 h-48 bg-accent-glow blur-3xl" /> : null}

      <button
        type="button"
        onClick={() => openSheet({ mon: product.id })}
        className="absolute inset-0 z-10 rounded-tile"
        aria-label={t.open(product.name)}
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end gap-2 p-4">
        <div className="min-w-0 flex-1">
          {product.badge || showGinger ? (
            <p className="mb-1.5 flex flex-wrap gap-1.5">
              {product.badge ? (
                <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-on-accent">{product.badge}</span>
              ) : null}
              {showGinger ? (
                <span className="rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white backdrop-blur">{t.ginger}</span>
              ) : null}
            </p>
          ) : null}
          {/* Chữ trên ảnh luôn trắng (nền gradient đen) — đúng cho cả giao diện sáng. */}
          <h3 className="text-[17px] leading-tight font-semibold text-balance text-white">{product.name}</h3>
          {shape !== "tall" ? <p className="mt-0.5 line-clamp-1 text-[13px] text-white/75">{product.short}</p> : null}
          <p className="mt-1 text-[15px] font-semibold text-white tabular-nums">{formatPrice(product.price)}</p>
          {label ? <p className="mt-1 text-[12px] font-medium text-amber-300">{label}</p> : null}
        </div>
        {plus}
      </div>
    </article>
  );
}
