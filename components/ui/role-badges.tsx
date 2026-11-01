import type { Role } from "@/lib/domain/roles";
import { ROLE_LABEL } from "@/lib/ops-text";

// Badge vai trò nội bộ (M12): chủ quán/quản lý nổi bật, vai nghiệp vụ trung tính.
const TONE: Partial<Record<Role, string>> = { owner: "bg-accent text-on-accent", manager: "bg-invert text-on-invert" };

export function RoleBadges({ roles }: { roles: readonly Role[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {roles.map((r) => (
        <span key={r} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[r] ?? "bg-elevated text-secondary"}`}>
          {ROLE_LABEL[r]}
        </span>
      ))}
    </span>
  );
}
