import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { clerkEnabled, TEST_USER_COOKIE } from "@/lib/clerk-config";
import { serverNow } from "@/lib/server/clock";
import { ensureMember, type Member } from "@/lib/server/dal/promo";

// Tài khoản Clerk của request (M12). `auth()` chỉ chạy khi có khoá Clerk (proxy.ts bọc clerkMiddleware).
// E2E không gọi được Clerk thật → cookie `th_e2e_user` thay thế, bị khoá ở production (giống TEST_NOW).

const testMode = process.env.NODE_ENV !== "production" || process.env.E2E === "1";

export const clerkUserId = cache(async (): Promise<string | null> => {
  if (testMode) {
    const fake = (await cookies()).get(TEST_USER_COOKIE)?.value;
    if (fake && /^user_[\w-]{3,40}$/.test(fake)) return fake;
  }
  if (!clerkEnabled) return null;
  const { auth } = await import("@clerk/nextjs/server");
  return (await auth()).userId;
});

async function profileOf(userId: string): Promise<{ name: string; email: string | null }> {
  if (!clerkEnabled) return { name: "Khách thử", email: null };
  const { currentUser } = await import("@clerk/nextjs/server");
  const u = await currentUser();
  const email = u?.primaryEmailAddress?.emailAddress ?? null;
  return { name: u?.firstName ?? u?.fullName ?? email?.split("@")[0] ?? "Bạn", email };
}

/** Thành viên đang đăng nhập (tạo ở lần đầu + quà chào mừng); null = khách vãng lai. */
export const currentMember = cache(async (): Promise<Member | null> => {
  const id = await clerkUserId();
  if (!id) return null;
  return ensureMember({ clerkUserId: id, ...(await profileOf(id)) }, serverNow());
});
