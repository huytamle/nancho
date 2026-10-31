import Link from "next/link";
import { HandbookEditor } from "@/components/ops/handbook-editor";
import { box, h2 } from "@/components/ops/styles";
import { opsCopy } from "@/data/copy-ops";
import { vnDateOf } from "@/lib/domain/time";
import { ROLE_LABEL } from "@/lib/ops-text";
import type { HandbookPageView, HandbookView } from "@/lib/server/dal/handbook";

const t = opsCopy.book;
const href = (slug?: string) => `/admin/van-hanh?tab=so-tay${slug ? `&trang=${slug}` : ""}`;
const dm = (iso: string) => {
  const d = vnDateOf(new Date(iso));
  return `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
};

// Tab "Sổ tay" (§17.6) — Server Component: Markdown → HTML ở server, client không tải marked.
// Danh sách & nội dung chỉ gồm trang vai trò được xem (DTO `loadHandbookView`).
export function HandbookPanel({ view, now }: { view: HandbookView; now: string }) {
  if (view.page) return <PageView view={view} page={view.page} now={now} />;
  const groups = (["sop", "recipe"] as const).map((kind) => ({ kind, pages: view.pages.filter((p) => p.kind === kind) })).filter((g) => g.pages.length);
  return (
    <div className="space-y-5">
      {view.missing ? (
        <p role="alert" className="rounded-2xl bg-elevated p-4 text-[15px]">
          {t.missing}
        </p>
      ) : null}
      {groups.length === 0 ? <p className={`${box} text-[15px] text-secondary`}>{t.empty}</p> : null}
      {groups.map((g) => (
        <section key={g.kind} className={box} aria-labelledby={`book-${g.kind}`}>
          <h2 id={`book-${g.kind}`} className={h2}>
            {t[g.kind]}
          </h2>
          <ul className="mt-2 divide-y divide-line">
            {g.pages.map((p) => (
              <li key={p.slug}>
                <Link href={href(p.slug)} prefetch={false} className="flex min-h-14 items-center gap-2 py-2 text-[17px] font-semibold">
                  <span className="mr-auto">{p.title}</span>
                  {view.canEdit ? <span className="text-sm font-normal text-secondary">{p.roles.map((r) => ROLE_LABEL[r]).join(", ")}</span> : null}
                  <span aria-hidden className="text-secondary">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {view.canEdit ? (
        <section className={box}>
          <details>
            <summary className="flex min-h-12 cursor-pointer items-center text-[15px] font-semibold text-accent">+ {t.add}</summary>
            <HandbookEditor products={view.products} />
          </details>
        </section>
      ) : null}
    </div>
  );
}

function PageView({ view, page, now }: { view: HandbookView; page: HandbookPageView; now: string }) {
  const mark = t.watermark(view.viewer, dm(now));
  return (
    <div className="space-y-5">
      <Link href={href()} prefetch={false} className="inline-flex min-h-11 items-center text-[15px] font-semibold text-secondary hover:text-text">
        ‹ {t.back}
      </Link>
      <article className={`${box} relative overflow-hidden`} aria-labelledby="book-title">
        {/* In mờ tên người xem (§17.6) — có cả trên ảnh chụp màn hình và bản in. SVG để không thành chữ đọc được/chọn được. */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 size-full text-text opacity-[0.07] select-none print:opacity-20">
          <defs>
            <pattern id="book-wm" width="280" height="110" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">
              <text x="8" y="60" fill="currentColor" fontSize="14" fontWeight="600">
                {mark}
              </text>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#book-wm)" />
        </svg>
        <div className="relative">
          <h2 id="book-title" className="text-2xl font-bold">
            {page.title}
          </h2>
          <p className="mt-1 text-sm text-secondary">{t.meta(t[page.kind], page.version, page.updatedBy, dm(page.updatedAt))}</p>
          <div className="md mt-4" dangerouslySetInnerHTML={{ __html: page.html }} />
          {page.recipe ? (
            <div className="mt-6">
              <h3 className="font-semibold">{t.recipeTitle(page.recipe.product)}</h3>
              <table className="mt-2 w-full text-[15px] tabular-nums">
                <thead className="text-left text-sm text-secondary">
                  <tr>
                    <th scope="col" className="py-1.5 font-normal">
                      {t.ingredient}
                    </th>
                    <th scope="col" className="py-1.5 text-right font-normal">
                      {t.qty}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line border-t border-line">
                  {page.recipe.lines.map((l) => (
                    <tr key={l.label}>
                      <td className="py-2">{l.label}</td>
                      <td className="py-2 text-right font-semibold">
                        {String(l.qty).replace(".", ",")} {l.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p className="mt-6 text-xs text-secondary">{t.confidential}</p>
        </div>
      </article>
      {view.canEdit ? (
        <section className={box}>
          <details>
            <summary className="flex min-h-12 cursor-pointer items-center text-[15px] font-semibold">{t.edit}</summary>
            <HandbookEditor key={`${page.id}-${page.version}`} page={page} products={view.products} />
          </details>
        </section>
      ) : null}
    </div>
  );
}
