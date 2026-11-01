"use client";

import { SignIn } from "@clerk/nextjs";
import { useState, useTransition } from "react";
import { requestStaffAccess } from "@/app/actions/ops";
import { copy } from "@/data/copy";
import { ROLES, type Role } from "@/lib/domain/roles";
import { ROLE_LABEL } from "@/lib/ops-text";

const t = copy.admin.clerk;
// Mọi vai trừ chủ quán (khớp REQUESTABLE ở dal/ops).
const ASKABLE = ROLES.filter((r) => r !== "owner");

export function StaffSignIn() {
  return (
    <div className="flex justify-center">
      <SignIn routing="hash" forceRedirectUrl="/admin/login" signUpForceRedirectUrl="/admin/login" />
    </div>
  );
}

/** Đã đăng nhập Clerk nhưng chưa là nhân viên → xin vào nội bộ (quản lý/chủ quán duyệt). */
export function StaffRequestForm({ defaultName }: { defaultName: string }) {
  const [name, setName] = useState(defaultName);
  const [roles, setRoles] = useState<Role[]>([]);
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const valid = name.trim().length >= 2 && roles.length > 0 && /^\d{6}$/.test(pin);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        start(async () => {
          const r = await requestStaffAccess({ name: name.trim(), roles, pin }).catch(() => ({ ok: false as const, reason: "server_error" as const }));
          setMsg(r.ok ? null : r.reason === "duplicate" ? t.duplicate : (copy.admin.errors[r.reason as keyof typeof copy.admin.errors] ?? copy.admin.errors.server_error));
        });
      }}
    >
      <div>
        <label htmlFor="rq-name" className="mb-1.5 block text-sm font-medium">
          {t.name}
        </label>
        <input id="rq-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className="input" autoComplete="name" />
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{t.roles}</legend>
        <div className="flex flex-wrap gap-2">
          {ASKABLE.map((r) => {
            const on = roles.includes(r);
            return (
              <label
                key={r}
                className={`inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-[15px] font-semibold ${on ? "bg-invert text-on-invert" : "bg-elevated text-secondary"}`}
              >
                <input type="checkbox" className="sr-only" checked={on} onChange={() => setRoles(on ? roles.filter((x) => x !== r) : [...roles, r])} />
                {ROLE_LABEL[r]}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div>
        <label htmlFor="rq-pin" className="mb-1.5 block text-sm font-medium">
          {t.pin}
        </label>
        <input
          id="rq-pin"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="input tracking-[0.5em] tabular-nums"
        />
        <p className="mt-1.5 text-sm text-secondary">{t.pinHint}</p>
      </div>
      {msg ? (
        <p role="alert" className="text-sm text-danger">
          {msg}
        </p>
      ) : null}
      <button type="submit" disabled={!valid || pending} className="h-12 w-full rounded-full bg-accent font-semibold text-on-accent disabled:opacity-40">
        {pending ? "…" : t.submit}
      </button>
    </form>
  );
}
