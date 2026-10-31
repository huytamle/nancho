import { connection } from "next/server";
import * as z from "zod";
import { currentStaff } from "@/lib/server/auth/session";
import { canSpend, loadFile } from "@/lib/server/dal/ops";

// Ảnh vận hành (báo cáo chốt ca Sapo, hoá đơn — §17.3–17.4): chỉ nhân viên đã đăng nhập; hoá đơn chỉ owner/manager
// (ảnh Sapo của ca cũng nằm trong bảng này — nhân viên xem lại ảnh mình vừa tải lên khi đóng ca).
export async function GET(_request: Request, ctx: RouteContext<"/api/ops/files/[id]">) {
  await connection();
  const staff = await currentStaff();
  if (!staff) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const file = await loadFile(id);
  if (!file || (!canSpend(staff) && file.createdBy !== staff.id)) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
