import "server-only";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb, type Executor } from "@/lib/server/db/client";
import { rateLimits } from "@/lib/server/db/schema";

// Rate-limit bằng chính Postgres (§12): cửa sổ cố định, một UPSERT nguyên tử mỗi luật.
// Bản ghi cũ được dọn trong cron hằng ngày (M5).

export type Rule = { key: string; limit: number; windowSec: number };

/** Tăng bộ đếm của mọi luật; trả false nếu có luật vượt giới hạn. */
export async function rateLimit(rules: Rule[], now: Date, db: Executor = getDb()): Promise<boolean> {
  const counts = await Promise.all(
    rules.map(async (r) => {
      const windowMs = r.windowSec * 1000;
      const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
      const [row] = await db
        .insert(rateLimits)
        .values({ key: r.key, windowStart, count: 1 })
        .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: sql`${rateLimits.count} + 1` } })
        .returning({ count: rateLimits.count });
      return row.count <= r.limit;
    }),
  );
  return counts.every(Boolean);
}

/** IP khách: Vercel/nginx ghi đè `x-forwarded-for`, lấy phần tử đầu. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export const MIN = 60;
export const HOUR = 3600;
export const DAY = 86_400;
