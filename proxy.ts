import { NextResponse, type NextRequest } from "next/server";
import { SOURCE_COOKIE_DAYS } from "@/lib/privacy";
import { cleanSource, SRC_COOKIE } from "@/lib/source";

// 1) Gác /admin (§10.8): chỉ kiểm tra lạc quan — có cookie phiên hay không — để chuyển sớm về trang đăng nhập.
//    Kiểm tra thật (chữ ký JWT, nhân viên còn hoạt động, quyền) nằm ở requireStaff() trong mọi page/action admin.
// 2) Ghi kênh marketing `?src=` vào cookie `th_src` (last-touch, 30 ngày) → lưu vào đơn (§6.2 `orders.source`).
//    Matcher chỉ chạy proxy khi URL có `src` nên trang thường không tốn thêm gì.

const SESSION_COOKIE = "th_s"; // trùng lib/server/auth/session.ts (proxy không import code server-only)

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname.startsWith("/admin")) {
    // Trang đăng nhập luôn mở được: cookie hết hạn/bị thu hồi vẫn "có cookie" → không được đẩy qua lại.
    if (pathname === "/admin/login" || request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
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

export const config = {
  matcher: [
    "/admin/:path*",
    { source: "/((?!api|admin|_next|.*\\..*).*)", has: [{ type: "query", key: "src" }] },
  ],
};
