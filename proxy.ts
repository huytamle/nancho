import { NextResponse, type NextRequest } from "next/server";

// Gác /admin (§10.8): chỉ kiểm tra lạc quan — có cookie phiên hay không — để chuyển sớm về trang đăng nhập.
// Kiểm tra thật (chữ ký JWT, nhân viên còn hoạt động, quyền) nằm ở requireStaff() trong mọi page/action admin.

const SESSION_COOKIE = "th_s"; // trùng lib/server/auth/session.ts (proxy không import code server-only)

export function proxy(request: NextRequest) {
  // Trang đăng nhập luôn mở được: cookie hết hạn/bị thu hồi vẫn "có cookie" → không được đẩy qua lại.
  if (request.nextUrl.pathname === "/admin/login" || request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

export const config = {
  matcher: ["/admin/:path*"],
};
