import { site } from "@/data/site";

// TODO(M6): bổ sung hasMenu từ catalog, địa chỉ bếp Rêu, potentialAction OrderAction.
export function JsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: site.name,
    description: site.description,
    url: site.url,
    telephone: site.contact.phoneHref.replace("tel:", ""),
    servesCuisine: ["Pizza", "BBQ"],
    areaServed: "Thăng Bình, Đà Nẵng",
    slogan: site.taglineEn,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
