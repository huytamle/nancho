import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StorePage } from "@/components/store/store-page";
import { site } from "@/data/site";
import { formatPrice } from "@/lib/format";
import { getCatalog } from "@/lib/server/dal/catalog";

// Link chia sẻ từng món (§5.4): render CÙNG trang đặt món, sheet món mở sẵn — không redirect HTTP để crawler
// Facebook/Zalo đọc OG của chính URL này. canonical = "/"; đóng sheet → URL về "/" (lib/client/sheet-url.ts).

export async function generateStaticParams() {
  const { products } = await getCatalog();
  return products.map((p) => ({ slug: p.id }));
}

async function productOf(slug: string) {
  const { products } = await getCatalog();
  return products.find((p) => p.id === slug) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/m/[slug]">): Promise<Metadata> {
  const p = await productOf((await params).slug);
  if (!p) return {};
  const title = `${p.name} · ${formatPrice(p.price)}`;
  const description = p.description ?? site.description;
  return {
    title,
    description,
    alternates: { canonical: "/" },
    openGraph: { type: "website", locale: "vi_VN", siteName: site.name, url: `/m/${p.id}`, title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ProductPage({ params }: PageProps<"/m/[slug]">) {
  const { slug } = await params;
  const catalog = await getCatalog();
  if (!catalog.products.some((p) => p.id === slug)) notFound();
  return <StorePage catalog={catalog} />;
}
