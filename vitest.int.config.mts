import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration test với Postgres thật (BLUEPRINT §14). Cần TEST_DATABASE_URL — DB này bị XOÁ SẠCH mỗi lần chạy.
const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) throw new Error("Đặt TEST_DATABASE_URL (DB riêng cho test, sẽ bị xoá sạch)");

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // `server-only` ném lỗi ngoài React Server; test chạy trong Node thuần.
      "server-only": fileURLToPath(new URL("node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.int.test.ts"],
    globalSetup: ["lib/server/__tests__/global-setup.ts"],
    env: { DATABASE_URL: testDb },
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
