import { Suspense } from "react";
import { BentoMenu } from "@/components/store/bento-menu";
import { BrandStrip } from "@/components/store/brand-strip";
import { CartBar } from "@/components/store/cart-bar";
import { OvenBarServer, OvenBarSkeleton } from "@/components/store/oven-bar-server";
import { StoreFooter } from "@/components/store/store-footer";
import { StoreProvider, type StoreCatalog } from "@/components/store/store-provider";
import { StoreSheets } from "@/components/store/store-sheets";
import { StoreJsonLd } from "@/components/json-ld";
import { Toaster } from "@/components/ui/toaster";
import type { Catalog } from "@/lib/server/dal/catalog";

// App đặt món một trang (§9.2), dùng chung cho `/` và `/m/[slug]` (sheet món mở sẵn theo đường dẫn).
// Shell tĩnh (catalog `'use cache'`) + Oven Bar động stream trong <Suspense>.
export function StorePage({ catalog: c }: { catalog: Catalog }) {
  const catalog: StoreCatalog = { products: c.products, zones: c.zones, pickup: c.pickupPoints[0] ?? null };

  return (
    <StoreProvider catalog={catalog}>
      <StoreJsonLd catalog={c} />
      <Suspense fallback={<OvenBarSkeleton />}>
        <OvenBarServer />
      </Suspense>
      <main id="noi-dung" className="mx-auto max-w-5xl px-4">
        <BrandStrip />
        <BentoMenu products={c.products} />
      </main>
      <StoreFooter pickup={catalog.pickup} />
      <CartBar />
      <Toaster />
      <Suspense fallback={null}>
        <StoreSheets />
      </Suspense>
    </StoreProvider>
  );
}
