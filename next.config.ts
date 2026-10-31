import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Clerk (M12): khoá publishable = "pk_<env>_" + base64("<frontend-api-host>$") → tên miền phải mở trong CSP
// (theo hướng dẫn CSP của Clerk: FAPI cho script/connect, img.clerk.com cho ảnh đại diện, Turnstile chống bot).
const clerkPk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const clerkFapi = clerkPk ? `https://${Buffer.from(clerkPk.split("_")[2] ?? "", "base64").toString().replace(/\$$/, "")}` : "";
const clerk = clerkPk ? ` ${clerkFapi} https://challenges.cloudflare.com` : "";

// CSP cơ bản không dùng nonce (02-guides/content-security-policy.md). img.vietqr.io cho mã QR (M6).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${clerk}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: https://img.vietqr.io${clerkPk ? " https://img.clerk.com" : ""}`,
  "font-src 'self'",
  `connect-src 'self'${clerk}`,
  `frame-src ${clerkPk ? "https://challenges.cloudflare.com" : "'none'"}`,
  "worker-src 'self' blob:",
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
