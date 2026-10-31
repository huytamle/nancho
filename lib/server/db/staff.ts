import "server-only";
import { isRole, ROLES, type Role } from "@/lib/domain/roles";
import { closeDb } from "@/lib/server/db/client";
import { upsertStaff } from "@/lib/server/dal/staff";

// Thêm nhân viên / đặt lại PIN: `npm run staff -- "Tên" owner,barista 123456` (cần DATABASE_URL).
// Nhiều vai trò cách nhau bằng dấu phẩy. Sau đó owner/manager phân công trong app (/admin/van-hanh?tab=nhan-vien).
// Khoá nhân viên: đặt `is_active = false` trong Table Editor của Supabase.

const [name, rolesArg, pin] = process.argv.slice(2);
const roles = (rolesArg ?? "").split(",").map((r) => r.trim());
if (!name || !pin || roles.length === 0 || !roles.every(isRole)) {
  console.error(`Cách dùng: npm run staff -- "Tên" ${ROLES.join("|")}[,…] 123456`);
  process.exit(1);
}

upsertStaff({ name, roles: roles as Role[], pin })
  .then((id) => console.info(`Đã lưu nhân viên #${id} · ${name} · ${roles.join(", ")}`))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closeDb);
