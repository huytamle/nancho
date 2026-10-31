import { Suspense } from "react";
import { BentoMenu } from "@/components/store/bento-menu";
import { BrandStrip } from "@/components/store/brand-strip";
import { CartBar } from "@/components/store/cart-bar";
import { OvenBarServer, OvenBarSkeleton } from "@/components/store/oven-bar-server";
import { StoreFooter } from "@/components/store/store-footer";
import { StoreProvider, type StoreCatalog } from "@/components/store/store-provider";
import { StoreSheets } from "@/components/store/store-sheets";
import { Toaster } from "@/components/ui/toaster";
import { getCatalog } from "@/lib/server/dal/catalog";

// App đặt món một trang (§9.2). Shell tĩnh (catalog `'use cache'`) + Oven Bar động stream trong <Suspense>.
export default async function Home() {
  const { products, zones, pickupPoints } = await getCatalog();
  const catalog: StoreCatalog = { products, zones, pickup: pickupPoints[0] ?? null };

  return (
    <StoreProvider catalog={catalog}>
      <Suspense fallback={<OvenBarSkeleton />}>
        <OvenBarServer />
      </Suspense>
      <main id="noi-dung" className="mx-auto max-w-5xl px-4">
        <BrandStrip />
        <BentoMenu products={products} />
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
