import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// App kết nối qua Supavisor transaction pooler (cổng 6543) → `prepare: false` (§5.2).
// Tạo lười để `next build` không cần DATABASE_URL; giữ trên globalThis để HMR không mở thêm pool.

export type Db = PostgresJsDatabase<typeof schema>;
/** Kiểu dùng chung cho `db` và `tx` trong `db.transaction()`. */
export type Executor = Pick<Db, "select" | "insert" | "update" | "delete" | "execute" | "query">;

const g = globalThis as unknown as { __heatSql?: postgres.Sql; __heatDb?: Db };

export function getDb(): Db {
  if (g.__heatDb) return g.__heatDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL chưa được đặt (xem .env.example)");
  g.__heatSql = postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
  g.__heatDb = drizzle(g.__heatSql, { schema, casing: "snake_case" });
  return g.__heatDb;
}

/** Đóng pool — chỉ cho script (seed) và test. */
export async function closeDb() {
  await g.__heatSql?.end({ timeout: 5 });
  g.__heatSql = undefined;
  g.__heatDb = undefined;
}
