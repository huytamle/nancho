import { connection } from "next/server";
import { serverNow } from "@/lib/server/clock";
import { getOvenSnapshot } from "@/lib/server/dal/schedule";

// Trạng thái lò cho client poll (§5.3, §8.2). Public; CDN giữ 10 s để 100 khách cùng mở không dồn về DB.
export async function GET() {
  await connection();
  const snapshot = await getOvenSnapshot(serverNow());
  return Response.json(snapshot, {
    headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" },
  });
}
