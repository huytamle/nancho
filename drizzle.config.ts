import { defineConfig } from "drizzle-kit";

// Migration dùng kết nối trực tiếp/session (DIRECT_URL, cổng 5432) — BLUEPRINT §5.2, §5.6.
// Schema được thêm ở M2.
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DIRECT_URL ?? "",
  },
  casing: "snake_case",
  strict: true,
});
