"use client";

import { useState, useTransition } from "react";
import { linkClerk, reviewStaffRequest, setStaffRoles, telegramLink } from "@/app/actions/ops";
import { useAdminAction } from "@/components/admin/use-admin";
import { box, h2, primaryBtn, secondaryBtn } from "@/components/ops/styles";
import { copy } from "@/data/copy";
import { opsCopy } from "@/data/copy-ops";
import { showToast } from "@/lib/client/toast-store";
import { clerkEnabled } from "@/lib/clerk-config";
import { canAssignRoles, ROLES, type Role } from "@/lib/domain/roles";
import { ROLE_LABEL } from "@/lib/ops-text";
import type { OpsView, StaffView } from "@/lib/server/dal/ops";

const t = opsCopy.staff;

export function StaffPanel({ view }: { view: OpsView }) {
  const me = view.staff.find((s) => s.id === view.viewer.id);
  const pending = view.staff.filter((s) => s.pending);
  const staff = view.staff.filter((s) => !s.pending);
  return (
    <div className="space-y-5">
      {view.viewer.canAssign && pending.length > 0 ? (
        <section className={`${box} border border-accent/40`} aria-labelledby="requests">
          <h2 id="requests" className={h2}>
            {t.requests(pending.length)}
          </h2>
          <p className="mt-1 text-sm text-secondary">{t.requestsHint}</p>
          <ul className="mt-2 divide-y divide-line">
            {pending.map((s) => (
              <RequestRow key={s.id} s={s} view={view} />
            ))}
          </ul>
        </section>
      ) : null}
      <TelegramLink linked={me?.telegram ?? false} configured={view.telegramBot !== null} />
      {clerkEnabled ? <ClerkLink linked={me?.clerk ?? false} /> : null}
      {view.viewer.canAssign ? (
        <section className={box} aria-labelledby="roles">
          <h2 id="roles" className={h2}>
            {t.title}
          </h2>
          <p className="mt-1 text-sm text-secondary">{t.hint}</p>
          <ul className="mt-2 divide-y divide-line">
            {staff.map((s) => (
              <RoleRow key={`${s.id}-${s.roles.join()}`} s={s} view={view} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function RoleRow({ s, view }: { s: StaffView; view: OpsView }) {
  const { pending, run } = useAdminAction();
  const [roles, setRoles] = useState<Role[]>(s.roles);
  const actor = { id: view.viewer.id, roles: view.viewer.roles };
  const dirty = roles.length !== s.roles.length || roles.some((r) => !s.roles.includes(r));
  // Ô bị khoá khi bật/tắt nó sẽ vi phạm quy tắc phân công (§17.2).
  const locked = (r: Role) => {
    const next = roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r];
    return next.length > 0 && !canAssignRoles(actor, s, next);
  };
  return (
    <li className="py-3">
      <p className="font-semibold">
        {s.name}
        {s.telegram ? <span className="ml-2 text-sm font-normal text-secondary">{t.linkedTag}</span> : null}
        {s.clerk ? <span className="ml-2 text-sm font-normal text-secondary">{t.clerkTag}</span> : null}
        {s.isActive ? null : <span className="ml-2 text-sm font-normal text-danger">{t.inactive}</span>}
      </p>
      <fieldset className="mt-2">
        <legend className="sr-only">
          {t.title}: {s.name}
        </legend>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => {
            const on = roles.includes(r);
            return (
              <label
                key={r}
                className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-[15px] font-semibold has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40 ${
                  on ? "bg-invert text-on-invert" : "bg-elevated text-secondary"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={on}
                  disabled={locked(r)}
                  onChange={() => setRoles(on ? roles.filter((x) => x !== r) : [...roles, r])}
                />
                {ROLE_LABEL[r]}
              </label>
            );
          })}
        </div>
      </fieldset>
      {dirty ? (
        <button type="button" disabled={pending || roles.length === 0} onClick={() => run(() => setStaffRoles({ staffId: s.id, roles }), copy.admin.saved)} className={`${secondaryBtn} mt-3`}>
          {t.save}
        </button>
      ) : null}
    </li>
  );
}

/** Yêu cầu vào nội bộ qua Clerk: quản lý duyệt vai nghiệp vụ, vai quản lý chỉ chủ quán duyệt (§17.2). */
function RequestRow({ s, view }: { s: StaffView; view: OpsView }) {
  const { pending, run } = useAdminAction();
  const actor = { id: view.viewer.id, roles: view.viewer.roles };
  const target = { id: s.id, roles: [] as Role[] };
  const [roles, setRoles] = useState<Role[]>(s.roles.filter((r) => canAssignRoles(actor, target, [r])));
  const canReview = canAssignRoles(actor, target, s.roles);
  return (
    <li className="py-3">
      <p className="font-semibold">
        {s.name} <span className="ml-1 text-sm font-normal text-secondary">{t.asked(s.roles.map((r) => ROLE_LABEL[r]).join(", "))}</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {ROLES.map((r) => {
          const on = roles.includes(r);
          const next = on ? roles.filter((x) => x !== r) : [...roles, r];
          return (
            <label
              key={r}
              className={`inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-[15px] font-semibold has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40 ${
                on ? "bg-invert text-on-invert" : "bg-elevated text-secondary"
              }`}
            >
              <input type="checkbox" className="sr-only" checked={on} disabled={next.length > 0 && !canAssignRoles(actor, target, next)} onChange={() => setRoles(next)} />
              {ROLE_LABEL[r]}
            </label>
          );
        })}
      </div>
      {canReview ? null : <p className="mt-2 text-sm text-warn">{t.ownerOnly}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || roles.length === 0}
          onClick={() => run(() => reviewStaffRequest({ staffId: s.id, decision: "approve", roles }), t.approved)}
          className={primaryBtn}
        >
          {t.approve}
        </button>
        <button
          type="button"
          disabled={pending || !canReview}
          onClick={() => run(() => reviewStaffRequest({ staffId: s.id, decision: "reject", roles: [] }), t.rejected)}
          className={secondaryBtn}
        >
          {t.reject}
        </button>
      </div>
    </li>
  );
}

/** Nhân viên cũ (PIN) gắn tài khoản Clerk để lần sau đăng nhập bằng Google/Facebook/email. */
function ClerkLink({ linked }: { linked: boolean }) {
  const { pending, run } = useAdminAction();
  return (
    <section className={box} aria-labelledby="clerk">
      <h2 id="clerk" className={h2}>
        {t.clerkTitle}
      </h2>
      <p className="mt-2 text-[15px]">{linked ? t.clerkLinked : t.clerkNot}</p>
      {linked ? null : (
        <button type="button" disabled={pending} onClick={() => run(() => linkClerk(), t.clerkDone)} className={`${primaryBtn} mt-3`}>
          {t.clerkBtn}
        </button>
      )}
    </section>
  );
}

function TelegramLink({ linked, configured }: { linked: boolean; configured: boolean }) {
  const [pending, start] = useTransition();
  return (
    <section className={box} aria-labelledby="tg">
      <h2 id="tg" className={h2}>
        {t.telegramTitle}
      </h2>
      <p className="mt-2 text-[15px]">{configured ? (linked ? t.telegramLinked : t.telegramNot) : t.telegramMissing}</p>
      {configured ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await telegramLink();
              if (res.ok) window.location.href = res.url;
              else showToast(copy.admin.errors[res.reason]);
            })
          }
          className={`${primaryBtn} mt-3`}
        >
          {linked ? t.telegramRelink : t.telegramBtn}
        </button>
      ) : null}
    </section>
  );
}
