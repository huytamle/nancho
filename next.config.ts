import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// CSP cơ bản không dùng nonce (02-guides/content-security-policy.md). img.vietqr.io cho mã QR (M6).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://img.vietqr.io",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  // Ảnh OG từng món đọc font + ảnh món bằng fs (đường dẫn động → tracing không tự thấy).
  outputFileTracingIncludes: {
    "/m/[slug]/opengraph-image": ["./assets/og/**", "./public/images/**"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
