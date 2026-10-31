import type { MetadataRoute } from "next";
import { site } from "@/data/site";

// §12: /admin, /o (biên nhận có token) không được lập chỉ mục.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/o/", "/api/"] },
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
