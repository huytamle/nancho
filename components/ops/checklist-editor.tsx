"use client";

import { useState } from "react";
import { saveChecklistTemplate } from "@/app/actions/ops";
import { useAdminAction } from "@/components/admin/use-admin";
import { box, h2, secondaryBtn } from "@/components/ops/styles";
import { copy } from "@/data/copy";
import { opsCopy } from "@/data/copy-ops";
import { CHECKLIST_MOMENTS, validItems, type ChecklistItem, type ChecklistMoment } from "@/lib/domain/checklist";
import { ROLES, type Role } from "@/lib/domain/roles";
import { ROLE_LABEL } from "@/lib/ops-text";
import type { TemplateView } from "@/lib/server/dal/checklist";

const t = opsCopy.work;

/** Sửa mẫu checklist (owner/manager). Mỗi mẫu một <details> để màn hình điện thoại gọn. */
export function ChecklistEditor({ templates }: { templates: TemplateView[] }) {
  const nextSort = Math.max(0, ...templates.map((x) => x.sort)) + 1;
  return (
    <section className={box} aria-labelledby="ck-templates">
      <h2 id="ck-templates" className={h2}>
        {t.templatesTitle}
      </h2>
      <ul className="mt-2 divide-y divide-line">
        {templates.map((tpl) => (
          <li key={tpl.id}>
            <details>
              <summary className="flex min-h-12 cursor-pointer items-center gap-2 py-2 text-[15px] font-semibold">
                <span className="mr-auto">{tpl.title}</span>
                <span className="text-sm font-normal text-secondary">
                  {t.moment[tpl.moment]}
                  {tpl.isActive ? "" : ` · ${t.inactive}`}
                </span>
              </summary>
              {/* key theo nội dung: lưu xong (refresh) → form nạp lại bản mới. */}
              <TemplateForm key={JSON.stringify(tpl)} initial={tpl} />
            </details>
          </li>
        ))}
        <li>
          <details>
            <summary className="flex min-h-12 cursor-pointer items-center py-2 text-[15px] font-semibold text-accent">+ {t.newTemplate}</summary>
            <TemplateForm key={`new-${templates.length}`} initial={{ title: "", roles: [], moment: "open", items: [], sort: nextSort, isActive: true }} />
          </details>
        </li>
      </ul>
    </section>
  );
}

type Draft = Omit<TemplateView, "id"> & { id?: number };
type ItemDraft = { id: string; label: string; photo: boolean; hasValue: boolean; unit: string; min: string; max: string };

const toDraft = (i: ChecklistItem): ItemDraft => ({
  id: i.id,
  label: i.label,
  photo: !!i.photo,
  hasValue: !!i.value,
  unit: i.value?.unit ?? "°C",
  min: i.value?.min?.toString() ?? "",
  max: i.value?.max?.toString() ?? "",
});

const num = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(",", ".")));

function toItem(d: ItemDraft): ChecklistItem {
  const item: ChecklistItem = { id: d.id, label: d.label.trim() };
  if (d.photo) item.photo = true;
  if (d.hasValue) {
    item.value = { unit: d.unit.trim() };
    const min = num(d.min);
    const max = num(d.max);
    if (min !== undefined) item.value.min = min;
    if (max !== undefined) item.value.max = max;
  }
  return item;
}

const newId = () => `i${Math.random().toString(36).slice(2, 9)}`;

function TemplateForm({ initial }: { initial: Draft }) {
  const { pending, run } = useAdminAction();
  const key = initial.id ?? "new";
  const [title, setTitle] = useState(initial.title);
  const [moment, setMoment] = useState<ChecklistMoment>(initial.moment);
  const [roles, setRoles] = useState<Role[]>(initial.roles);
  const [active, setActive] = useState(initial.isActive);
  const [items, setItems] = useState<ItemDraft[]>(() => (initial.items.length ? initial.items.map(toDraft) : [toDraft({ id: newId(), label: "" })]));

  const built = items.map(toItem);
  const numbersOk = items.every((d) => !d.hasValue || [d.min, d.max].every((s) => s.trim() === "" || Number.isFinite(num(s))));
  const ok = title.trim() !== "" && roles.length > 0 && numbersOk && validItems(built);
  const patch = (i: number, p: Partial<ItemDraft>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));

  return (
    <div className="space-y-4 pb-4">
      <div>
        <label htmlFor={`tpl-${key}-title`} className="mb-1 block text-sm text-secondary">
          {t.title}
        </label>
        <input id={`tpl-${key}-title`} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} className="input" />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={`tpl-${key}-moment`} className="mb-1 block text-sm text-secondary">
            {t.momentLabel}
          </label>
          <select id={`tpl-${key}-moment`} value={moment} onChange={(e) => setMoment(e.target.value as ChecklistMoment)} className="input !w-auto !pr-9">
            {CHECKLIST_MOMENTS.map((m) => (
              <option key={m} value={m}>
                {t.moment[m]}
              </option>
            ))}
          </select>
        </div>
        <label className="inline-flex min-h-12 items-center gap-2 text-[15px]">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-5" />
          {t.active}
        </label>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm text-secondary">{t.rolesLabel}</legend>
        <div className="flex flex-wrap gap-2">
          {ROLES.filter((r) => r !== "owner" && r !== "manager").map((r) => {
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

      <fieldset>
        <legend className="mb-1 text-sm text-secondary">{t.items}</legend>
        <ol className="space-y-3">
          {items.map((d, i) => (
            <li key={d.id} className="rounded-2xl bg-elevated p-3">
              <div className="flex items-center gap-2">
                <input
                  aria-label={t.itemLabel(i + 1)}
                  value={d.label}
                  maxLength={120}
                  onChange={(e) => patch(i, { label: e.target.value })}
                  className="input !bg-surface"
                />
                <button
                  type="button"
                  aria-label={t.removeItem(i + 1)}
                  disabled={items.length === 1}
                  onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                  className="min-h-12 min-w-12 rounded-full text-xl text-secondary disabled:opacity-30"
                >
                  ×
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4">
                <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" checked={d.photo} onChange={(e) => patch(i, { photo: e.target.checked })} className="size-5" />
                  {t.needPhoto}
                </label>
                <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" checked={d.hasValue} onChange={(e) => patch(i, { hasValue: e.target.checked })} className="size-5" />
                  {t.needValue}
                </label>
              </div>
              {d.hasValue ? (
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {(["unit", "min", "max"] as const).map((f) => (
                    <label key={f} className="text-xs text-secondary">
                      {t[f]}
                      <input
                        value={d[f]}
                        inputMode={f === "unit" ? "text" : "decimal"}
                        maxLength={10}
                        onChange={(e) => patch(i, { [f]: e.target.value })}
                        className="input !bg-surface mt-1"
                      />
                    </label>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
        <button type="button" disabled={items.length >= 40} onClick={() => setItems((xs) => [...xs, toDraft({ id: newId(), label: "" })])} className={`${secondaryBtn} mt-3`}>
          + {t.addItem}
        </button>
      </fieldset>

      <button
        type="button"
        disabled={pending || !ok}
        onClick={() =>
          run(
            () => saveChecklistTemplate({ id: initial.id, title, roles, moment, items: built, sort: initial.sort, isActive: active }),
            copy.admin.saved,
          )
        }
        className="min-h-12 w-full rounded-full bg-invert font-semibold text-on-invert disabled:opacity-50"
      >
        {t.saveTemplate}
      </button>
    </div>
  );
}
