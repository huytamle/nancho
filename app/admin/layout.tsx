import type { Metadata, Viewport } from "next";
import { copy } from "@/data/copy";

// Khu nhân viên (§10): không index. Không đọc phiên ở đây — mỗi page tự gọi requireStaff() trong <Suspense>
// để layout không chặn cả segment (02-guides/authentication-with-cache-components.md).
export const metadata: Metadata = {
  title: copy.admin.metaTitle,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#000000" };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
