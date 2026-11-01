import { ClerkProvider } from "@clerk/nextjs";
import { viVN } from "@clerk/localizations";
import type { ReactNode } from "react";
import { clerkEnabled } from "@/lib/clerk-config";

// Clerk chỉ nạp ở route cần đăng nhập (M12 S1) — trang chủ/bếp không tải clerk-js.
const appearance = {
  variables: { colorPrimary: "#ff3d00", colorTextOnPrimaryBackground: "#000000", borderRadius: "14px", fontFamily: "var(--font-be-vietnam)" },
} as const;

export default function Layout({ children }: { children: ReactNode }) {
  return clerkEnabled ? (
    <ClerkProvider localization={viVN} appearance={appearance}>
      {children}
    </ClerkProvider>
  ) : (
    children
  );
}
