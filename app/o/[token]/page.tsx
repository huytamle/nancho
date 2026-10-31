import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { OrderReceipt, ReceiptSkeleton } from "@/components/store/order-receipt";
import { copy } from "@/data/copy";
import { site } from "@/data/site";
import { serverNow } from "@/lib/server/clock";
import { getOrderView } from "@/lib/server/dal/orders";

// Biên nhận & theo dõi đơn (§9.8). Token ngẫu nhiên 128-bit là chìa khoá duy nhất; noindex.
// Động trong <Suspense>: shell (header) tĩnh, đơn stream theo request.
export const metadata: Metadata = {
  title: copy.receipt.metaTitle,
  robots: { index: false, follow: false },
};

export default function OrderPage({ params }: PageProps<"/o/[token]">) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-header pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <Link href="/" aria-label={site.name}>
            <Logo compact />
          </Link>
          <Link href="/" className="inline-flex h-11 items-center rounded-full bg-elevated px-4 text-sm font-medium">
            {copy.receipt.back}
          </Link>
        </div>
      </header>
      <main id="noi-dung" className="mx-auto max-w-xl px-4 pt-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
        <Suspense fallback={<ReceiptSkeleton />}>
          <Receipt params={params} />
        </Suspense>
      </main>
    </>
  );
}

async function Receipt({ params }: Pick<PageProps<"/o/[token]">, "params">) {
  const { token } = await params;
  const view = await getOrderView(token, serverNow());
  if (!view) notFound();
  return <OrderReceipt token={token} view={view} />;
}
