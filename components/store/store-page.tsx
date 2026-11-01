import { Suspense } from "react";
import { BentoMenu } from "@/components/store/bento-menu";
import { CartBar } from "@/components/store/cart-bar";
import { OrderPanel } from "@/components/store/order-panel";
import { OvenBarServer, OvenBarSkeleton } from "@/components/store/oven-bar-server";
import { StoreFooter } from "@/components/store/store-footer";
import { StoreProvider, type StoreCatalog } from "@/components/store/store-provider";
import { StoreSheets } from "@/components/store/store-sheets";
import { StoreJsonLd } from "@/components/json-ld";
import { Faq, Hero, Journey, MemberPerks, MenuIntro, OrderSection, SiteHeader, Story } from "@/components/landing";
import { Toaster } from "@/components/ui/toaster";
import type { Catalog } from "@/lib/server/dal/catalog";

// Landing + app đặt món một trang (§9.2, M12), dùng chung cho `/` và `/m/[slug]` (sheet món mở sẵn theo đường dẫn).
// 01 Câu chuyện · 02 Thực đơn (Oven Bar dính + Bento) · 03 Đặt hàng · 04 Ưu đãi · 05 Hành trình · 06 Hỏi đáp.
export function StorePage({ catalog: c }: { catalog: Catalog }) {
  const catalog: StoreCatalog = { products: c.products, zones: c.zones, pickup: c.pickupPoints[0] ?? null };

  return (
    <StoreProvider catalog={catalog}>
      <StoreJsonLd catalog={c} />
      <SiteHeader />
      <main id="noi-dung">
        <Hero />
        <Story />
        <section id="thuc-don" aria-labelledby="thuc-don-title" className="relative scroll-mt-0 border-t border-line pb-32">
          <div className="mx-auto max-w-5xl px-4 pt-20 pb-8 sm:pt-28">
            <MenuIntro />
          </div>
          <Suspense fallback={<OvenBarSkeleton />}>
            <OvenBarServer />
          </Suspense>
          <div className="mx-auto max-w-5xl px-4 pt-8">
            <BentoMenu products={c.products} />
          </div>
        </section>
        <OrderSection panel={<OrderPanel />} />
        <MemberPerks />
        <Journey />
        <Faq />
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
