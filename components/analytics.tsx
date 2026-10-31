"use client";

import { Analytics as VercelAnalytics } from "@vercel/analytics/next";
import { redactUrl } from "@/lib/client/analytics";

// Chỉ render khi chạy trên Vercel (layout kiểm tra) — tự host thì không tải script.
export function Analytics() {
  return <VercelAnalytics beforeSend={(e) => ({ ...e, url: redactUrl(e.url) })} />;
}
