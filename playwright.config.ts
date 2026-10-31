import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = `http://localhost:${PORT}`;

// Chạy trên bản build (`npm run build` trước). Mobile trước: iPhone 13 & Pixel 7 (BLUEPRINT §14).
// Các thiết bị đều chạy trên Chromium để CI chỉ cần cài một trình duyệt.
// workers: 1 — test đặt đơn ghi DB thật (suất lò dùng chung) nên chạy tuần tự, mỗi test tự dọn DB (e2e/db.ts).
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "iphone-13", use: { ...devices["iPhone 13"], browserName: "chromium" } },
    { name: "pixel-7", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `npm run start -- --port ${PORT}`,
    // Mốc giờ cố định (Thứ Sáu 06/11/2026 10:00 VN). DB phải seed với cùng TEST_NOW.
    env: {
      E2E: "1",
      TEST_NOW: process.env.TEST_NOW ?? "2026-11-06T10:00:00+07:00",
      CUSTOMER_COOKIE_SECRET: process.env.CUSTOMER_COOKIE_SECRET ?? "e2e-only-customer-cookie-secret-0123456789",
      SESSION_SECRET: process.env.SESSION_SECRET ?? "e2e-only-session-secret-0123456789-abcdef",
    },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
