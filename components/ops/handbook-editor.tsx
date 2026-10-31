"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveHandbookPage } from "@/app/actions/ops";
import { useAdminAction } from "@/components/admin/use-admin";
import { copy } from "@/data/copy";
import { opsCopy } from "@/data/copy-ops";
import { SLUG, slugify } from "@/lib/domain/checklist";
import { ROLES, type Role } from "@/lib/domain/roles";
import { ROLE_LABEL } from "@/lib/ops-text";
import type { HandbookKind, HandbookPageView } from "@/lib/server/dal/handbook";

const t = opsCopy.book;

/** Thêm / sửa trang sổ tay (owner, manager). Xem trước = lưu rồi xem (HTML chỉ dựng ở server). */
export function HandbookEditor({ page, products }: { page?: HandbookPageView; products: { id: string; name: string }[] }) {
  const router = useRouter();
  const { pending, run } = useAdminAction();
  const key = page?.id ?? "new";
  const [title, setTitle] = useState(page?.title ?? "");
  const [slug, setSlug] = useState(page?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!page);
  const [kind, setKind] = useState<HandbookKind>(page?.kind ?? "sop");
  const [roles, setRoles] = useState<Role[]>(page?.roles ?? []);
  const [productId, setProductId] = useState(page?.productId ?? "");
  const [body, setBody] = useState(page?.body ?? "");
  const effSlug = slugTouched ? slug : slugify(title);
  const ok = title.trim() !== "" && SLUG.test(effSlug) && roles.length > 0;

  return (
    <div className="mt-2 space-y-4">
      <div>
        <label htmlFor={`pg-${key}-title`} className="mb-1 block text-sm text-secondary">
          {t.title}
        </label>
        <input id={`pg-${key}-title`} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} className="input" />
      </div>
      <div>
        <label htmlFor={`pg-${key}-slug`} className="mb-1 block text-sm text-secondary">
          {t.slug}
        </label>
        <input
          id={`pg-${key}-slug`}
          value={effSlug}
          maxLength={60}
          autoCapitalize="off"
          aria-describedby={`pg-${key}-slug-hint`}
          aria-invalid={effSlug !== "" && !SLUG.test(effSlug)}
          onChange={(e) => (setSlugTouched(true), setSlug(e.target.value))}
          className="input"
        />
        <p id={`pg-${key}-slug-hint`} className="mt-1 text-xs text-secondary">
          {t.slugHint}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`pg-${key}-kind`} className="mb-1 block text-sm text-secondary">
            {t.kind}
          </label>
          <select id={`pg-${key}-kind`} value={kind} onChange={(e) => setKind(e.target.value as HandbookKind)} className="input">
            <option value="sop">{t.sop}</option>
            <option value="recipe">{t.recipe}</option>
          </select>
        </div>
        {kind === "recipe" ? (
          <div>
            <label htmlFor={`pg-${key}-product`} className="mb-1 block text-sm text-secondary">
              {t.product}
            </label>
            <select id={`pg-${key}-product`} value={productId} onChange={(e) => setProductId(e.target.value)} className="input">
              <option value="">{t.noProduct}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <fieldset>
        <legend className="mb-1 text-sm text-secondary">{t.roles}</legend>
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
      <div>
        <label htmlFor={`pg-${key}-body`} className="mb-1 block text-sm text-secondary">
          {t.body}
        </label>
        <textarea
          id={`pg-${key}-body`}
          value={body}
          maxLength={20_000}
          rows={14}
          onChange={(e) => setBody(e.target.value)}
          className="input min-h-64 py-3 font-mono text-[15px] leading-relaxed"
        />
      </div>
      <button
        type="button"
        disabled={pending || !ok}
        onClick={() =>
          run(
            () => saveHandbookPage({ id: page?.id, slug: effSlug, title, kind, roles, body, productId: kind === "recipe" && productId ? productId : null }),
            copy.admin.saved,
            (r) => {
              if (r.slug !== page?.slug) router.push(`/admin/van-hanh?tab=so-tay&trang=${r.slug}`);
            },
          )
        }
        className="min-h-14 w-full rounded-full bg-invert font-semibold text-on-invert disabled:opacity-50"
      >
        {t.save}
      </button>
    </div>
  );
}
