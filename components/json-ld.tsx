import { copy } from "@/data/i18n";
import { menu } from "@/data/menu";
import { site } from "@/data/site";

export function JsonLd() {
  const vi = copy.vi;
  const data = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: site.name,
    description: site.description,
    servesCuisine: ["Café specialty", "Pizza", "BBQ", "Loaded fries", "Gelato"],
    address: {
      "@type": "PostalAddress",
      streetAddress: "162 Nguyễn Thuật",
      addressLocality: "Thăng Bình",
      addressRegion: "Đà Nẵng",
      addressCountry: "VN",
    },
    telephone: site.phoneHref.replace("tel:", ""),
    url: "https://theheat.vn",
    openingHours: "Mo-Su 06:00-21:30",
    acceptsReservations: true,
    hasMenu: menu.map((group) => ({
      "@type": "MenuSection",
      name: vi.menu.groups[group.id].title,
      hasMenuItem: group.items.map((item) => ({
        "@type": "MenuItem",
        name: vi.menu.items[item.id].name,
        description: vi.menu.items[item.id].description,
        image: item.image,
        offers: {
          "@type": "Offer",
          price: item.price,
          priceCurrency: "VND",
        },
      })),
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
