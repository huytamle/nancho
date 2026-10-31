import type { MetadataRoute } from "next";
import { site } from "@/data/site";
import { getCatalog } from "@/lib/server/dal/catalog";

// §13.2: `/`, `/m/*`, `/chinh-sach` (+ `/tai-quan`).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { products } = await getCatalog();
  return [
    { url: site.url, changeFrequency: "daily", priority: 1 },
    ...products.map((p) => ({ url: `${site.url}/m/${p.id}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    { url: `${site.url}/tai-quan`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${site.url}/chinh-sach`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
