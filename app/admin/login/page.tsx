import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/admin/login-form";
import { StaffRequestForm, StaffSignIn } from "@/components/admin/staff-request";
import { Logo } from "@/components/logo";
import { copy } from "@/data/copy";
import { clerkEnabled } from "@/lib/clerk-config";
import { clerkUserId } from "@/lib/server/auth/clerk";
import { currentStaff } from "@/lib/server/auth/session";
import { staffRequestState } from "@/lib/server/dal/ops";
import { listStaffNames } from "@/lib/server/dal/staff";

export const metadata: Metadata = { title: copy.admin.login.metaTitle };

const t = copy.admin.clerk;

// Đăng nhập (§10.8, M12): tài khoản Clerk (Google/Facebook/email) là chính — chưa là nhân viên thì xin vào,
// quản lý/chủ quán duyệt. Chọn tên + PIN vẫn giữ cho máy chung ở bếp.
export default function LoginPage() {
  return (
    <main id="noi-dung" className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-8">
      <Logo compact />
      <h1 className="mt-10 text-3xl font-semibold tracking-tight">{copy.admin.login.title}</h1>
      <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-tile bg-surface" />}>
        <StaffPicker />
      </Suspense>
    </main>
  );
}

async function StaffPicker() {
  if (await currentStaff()) redirect("/admin/kitchen");
  const uid = await clerkUserId();
  const state = uid ? await staffRequestState(uid) : null;
  const names = await listStaffNames();

  return (
    <>
      {clerkEnabled || uid ? (
        <section aria-labelledby="clerk-h" className="mt-8">
          <h2 id="clerk-h" className="mb-3 text-[11px] font-medium tracking-[0.22em] text-secondary uppercase">
            {t.title}
          </h2>
          {!uid ? (
            <StaffSignIn />
          ) : state?.status === "pending" ? (
            <p role="status" className="rounded-tile bg-surface p-4 text-[15px]">
              ⏳ {t.pending(state.name)}
            </p>
          ) : state?.status === "linked" ? (
            <p role="status" className="rounded-tile bg-surface p-4 text-[15px]">
              {t.locked}
            </p>
          ) : (
            <div className="rounded-tile bg-surface p-4">
              <p className="mb-4 text-[15px] text-secondary">{t.requestHint}</p>
              <StaffRequestForm defaultName="" />
            </div>
          )}
        </section>
      ) : null}
      <section aria-labelledby="pin-h" className="mt-8">
        {clerkEnabled || uid ? (
          <h2 id="pin-h" className="mb-1 text-[11px] font-medium tracking-[0.22em] text-secondary uppercase">
            {t.pinTitle}
          </h2>
        ) : null}
        <LoginForm staff={names} />
      </section>
    </>
  );
}
