import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Migration dùng kết nối trực tiếp/session (DIRECT_URL, cổng 5432) — BLUEPRINT §5.2, §5.6.
// drizzle-kit không tự đọc .env.local; biến môi trường thật (CI/Vercel) được ưu tiên.
if (!process.env.DIRECT_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");

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
