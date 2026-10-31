import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { clerkEnabled } from "@/lib/clerk-config";
import { SOURCE_COOKIE_DAYS } from "@/lib/privacy";
import { cleanSource, SRC_COOKIE } from "@/lib/source";

// 1) Gác /admin (§10.8): chỉ kiểm tra lạc quan — có phiên PIN (cookie) hoặc phiên Clerk (M12) — để chuyển sớm về
//    trang đăng nhập. Kiểm tra thật (chữ ký, nhân viên còn hoạt động & đã duyệt, quyền) ở requireStaff().
// 2) Ghi kênh marketing `?src=` vào cookie `th_src` (last-touch, 30 ngày) → lưu vào đơn (§6.2 `orders.source`).
// 3) Có khoá Clerk → bọc clerkMiddleware để `auth()` dùng được ở page/Server Action (matcher phủ mọi trang).

const SESSION_COOKIE = "th_s"; // trùng lib/server/auth/session.ts (proxy không import code server-only)

function handle(request: NextRequest, signedIn: boolean) {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname.startsWith("/admin")) {
    // Trang đăng nhập luôn mở được: cookie hết hạn/bị thu hồi vẫn "có cookie" → không được đẩy qua lại.
    if (pathname === "/admin/login" || signedIn || request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const res = NextResponse.next();
  const src = cleanSource(searchParams.get("src"));
  if (src) {
    // Không httpOnly: client đọc để gắn `src` vào sự kiện analytics. Không phải dữ liệu nhạy cảm.
    res.cookies.set(SRC_COOKIE, src, { path: "/", maxAge: SOURCE_COOKIE_DAYS * 86_400, sameSite: "lax", secure: request.nextUrl.protocol === "https:" });
  }
  return res;
}

export const proxy = clerkEnabled
  ? clerkMiddleware(async (auth, request) => handle(request, !!(await auth()).userId))
  : (request: NextRequest) => handle(request, request.cookies.has("th_e2e_user"));

export const config = {
  // Mẫu matcher của Clerk: mọi trang + API, bỏ file tĩnh.
  matcher: ["/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|avif|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
