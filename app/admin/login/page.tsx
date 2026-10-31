import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/admin/login-form";
import { Logo } from "@/components/logo";
import { copy } from "@/data/copy";
import { currentStaff } from "@/lib/server/auth/session";
import { listStaffNames } from "@/lib/server/dal/staff";

export const metadata: Metadata = { title: copy.admin.login.metaTitle };

// Đăng nhập (§10.8): chọn tên → PIN 6 số trên bàn phím số lớn.
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
  return <LoginForm staff={await listStaffNames()} />;
}
