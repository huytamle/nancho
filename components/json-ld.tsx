import { site } from "@/data/site";
import type { Catalog } from "@/lib/server/dal/catalog";

// JSON-LD `Restaurant` (§13.2): địa chỉ bếp Rêu, khu vực phục vụ, thực đơn từ catalog, OrderAction.
// Trường địa chỉ còn "TODO" (chờ chủ quán) thì bỏ khỏi dữ liệu thay vì phát thông tin sai cho Google.

const known = (v: string | null | undefined) => (v && !v.startsWith("TODO") ? v : undefined);

export function storeJsonLd({ products, zones }: Pick<Catalog, "products" | "zones">) {
  const sections = [
    { name: "Pizza & Combo", kinds: ["combo", "pizza"] },
    { name: "BBQ sous-vide", kinds: ["bbq"] },
    { name: "Thêm cho ngon", kinds: ["addon"] },
  ];
  const [lat, lng] = site.kitchen.coords?.split(",").map(Number) ?? [];
  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": `${site.url}/#restaurant`,
    name: site.name,
    description: site.description,
    url: site.url,
    image: `${site.url}/opengraph-image.jpg`,
    logo: `${site.url}/icons/icon-512.png`,
    telephone: site.contact.phoneHref.replace("tel:", ""),
    servesCuisine: ["Pizza", "BBQ"],
    priceRange: "₫₫",
    slogan: site.taglineEn,
    sameAs: Object.values(site.social),
    address: {
      "@type": "PostalAddress",
      streetAddress: known(site.kitchen.address),
      addressLocality: "Thăng Bình",
      addressRegion: "Đà Nẵng",
      addressCountry: "VN",
    },
    ...(Number.isFinite(lat) && Number.isFinite(lng) ? { geo: { "@type": "GeoCoordinates", latitude: lat, longitude: lng } } : {}),
    areaServed: zones.length > 0 ? zones.map((z) => ({ "@type": "Place", name: z.name })) : "Thăng Bình, Đà Nẵng",
    hasMenu: {
      "@type": "Menu",
      name: "Thực đơn THE HEAT PIZZA",
      hasMenuSection: sections
        .map((s) => ({
          "@type": "MenuSection",
          name: s.name,
          hasMenuItem: products
            .filter((p) => s.kinds.includes(p.kind))
            .map((p) => ({
              "@type": "MenuItem",
              name: p.name,
              ...(p.description ? { description: p.description } : {}),
              image: `${site.url}${p.image}`,
              url: `${site.url}/m/${p.id}`,
              offers: { "@type": "Offer", price: p.price, priceCurrency: "VND", availability: "https://schema.org/PreOrder" },
            })),
        }))
        .filter((s) => s.hasMenuItem.length > 0),
    },
    potentialAction: {
      "@type": "OrderAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${site.url}/?src=google`,
        actionPlatform: ["https://schema.org/MobileWebPlatform", "https://schema.org/DesktopWebPlatform"],
        inLanguage: "vi",
      },
      deliveryMethod: ["http://purl.org/goodrelations/v1#DeliveryModeOwnFleet", "http://purl.org/goodrelations/v1#DeliveryModePickUp"],
    },
  };
}

export function StoreJsonLd({ catalog }: { catalog: Pick<Catalog, "products" | "zones"> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(storeJsonLd(catalog)).replace(/</g, "\\u003c") }}
    />
  );
}
