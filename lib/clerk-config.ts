// Clerk (M12): đăng nhập Google · Facebook · email cho khách (tuỳ chọn) và nhân viên.
// Chưa có khoá → app chạy như cũ (khách đặt bằng SĐT, nhân viên đăng nhập PIN) — dev/CI/e2e không cần Clerk.
// NEXT_PUBLIC_* được nhúng lúc build nên dùng được cả ở client.

export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/** Cookie giả danh tài khoản cho e2e (chỉ khi không phải production, hoặc bản build e2e `E2E=1`). */
export const TEST_USER_COOKIE = "th_e2e_user";
