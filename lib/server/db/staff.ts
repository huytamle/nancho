import "server-only";
import { closeDb } from "@/lib/server/db/client";
import { upsertStaff } from "@/lib/server/dal/staff";

// Thêm nhân viên / đặt lại PIN: `npm run staff -- "Tên" owner|kitchen|shipper 123456` (cần DATABASE_URL).
// Khoá nhân viên: đặt `is_active = false` trong Table Editor của Supabase.

const [name, role, pin] = process.argv.slice(2);
if (!name || (role !== "owner" && role !== "kitchen" && role !== "shipper") || !pin) {
  console.error('Cách dùng: npm run staff -- "Tên" owner|kitchen|shipper 123456');
  process.exit(1);
}

upsertStaff({ name, role, pin })
  .then((id) => console.info(`Đã lưu nhân viên #${id} · ${name} · ${role}`))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closeDb);
