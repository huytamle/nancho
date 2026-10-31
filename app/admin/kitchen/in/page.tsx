import type { Metadata } from "next";
import { Suspense } from "react";
import { PrintButton } from "@/components/admin/print-button";
import { copy } from "@/data/copy";
import { isISODate, vnDateOf, vnTimeLabel } from "@/lib/domain/time";
import { batchMains, ingredientDetail, ingredientQty, longDate, warningText } from "@/lib/kitchen-text";
import { requireStaff } from "@/lib/server/auth/session";
import { serverNow } from "@/lib/server/clock";
import { loadKitchenDay } from "@/lib/server/dal/kitchen";

export const metadata: Metadata = { title: copy.admin.print.metaTitle };

const t = copy.admin.print;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Bản in Bảng Tổng Hợp (§10.7): chữ đen trên trắng, A5 hoặc giấy nhiệt 80 mm (`?kho=80`).
export default function PrintPage({ searchParams }: PageProps<"/admin/kitchen/in">) {
  return (
    <Suspense fallback={null}>
      <PrintSheet searchParams={searchParams} />
    </Suspense>
  );
}

async function PrintSheet({ searchParams }: Pick<PageProps<"/admin/kitchen/in">, "searchParams">) {
  await requireStaff(["owner", "kitchen"]);
  const sp = await searchParams;
  const now = serverNow();
  const ngay = one(sp.ngay);
  const thermal = one(sp.kho) === "80";
  const date = ngay && isISODate(ngay) ? ngay : vnDateOf(now);
  const day = await loadKitchenDay(date, now);
  const { prep } = day;
  const lastCutoff = day.batches.reduce((m, b) => (b.cutoffAt > m ? b.cutoffAt : m), "");
  const base = `/admin/kitchen/in?ngay=${date}`;

  return (
    <div className={`print-sheet min-h-dvh bg-white text-black ${thermal ? "print-80" : "print-a5"}`}>
      <style>{thermal ? "@page { size: 80mm auto; margin: 4mm }" : "@page { size: A5; margin: 10mm }"}</style>
      <nav className="no-print flex flex-wrap gap-2 border-b border-black/10 p-4">
        <PrintButton label={t.print} />
        <a href={base} aria-current={!thermal ? "page" : undefined} className="min-h-11 rounded-full border border-black/20 px-4 leading-[2.75rem]">
          {t.a5}
        </a>
        <a href={`${base}&kho=80`} aria-current={thermal ? "page" : undefined} className="min-h-11 rounded-full border border-black/20 px-4 leading-[2.75rem]">
          {t.thermal}
        </a>
        <a href={`/admin/kitchen?ngay=${date}`} className="ml-auto min-h-11 px-2 leading-[2.75rem] underline">
          {t.back}
        </a>
      </nav>
      <main id="noi-dung" className="mx-auto max-w-[148mm] p-4 text-[13px] leading-snug print:p-0">
        <h1 className="text-lg font-bold">
          THE HEAT · BẾP · {longDate(date)}
        </h1>
        <p className="font-semibold">
          {prep.isFinal && lastCutoff ? `ĐÃ CHỐT SỔ ${vnTimeLabel(new Date(lastCutoff))}` : "TẠM TÍNH"} · {prep.orderCount} đơn
        </p>
        <p className="mt-1 text-2xl font-bold">{copy.admin.prep.mains(prep.totals.mains.pizza, prep.totals.mains.bbq)}</p>

        <h2 className="mt-3 border-b border-black font-bold uppercase">{copy.admin.prep.pull}</h2>
        <table className="w-full">
          <tbody>
            {prep.totals.ingredients.map((i) => {
              const detail = ingredientDetail(i);
              return (
                <tr key={i.ingredientId} className="border-b border-dotted border-black/40 align-top">
                  <td className="py-0.5 pr-2">
                    ☐ {i.label}
                    {detail ? <span className="block pl-4 text-[11px]">{detail}</span> : null}
                  </td>
                  <td className="py-0.5 text-right font-semibold whitespace-nowrap">{ingredientQty(i)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <h2 className="mt-3 border-b border-black font-bold uppercase">{copy.admin.prep.byBatch}</h2>
        {prep.batches.map((b) => (
          <section key={b.batchId} className="mt-2 break-inside-avoid">
            <h3 className="font-bold">▸ {copy.admin.prep.batchLine(b.ovenLabel, b.readyLabel, batchMains(b))}</h3>
            {[...b.pizza, ...b.bbq, ...b.addons].length > 0 ? (
              <p className="pl-3">{[...b.pizza, ...b.bbq, ...b.addons].map((x) => `${x.qty} ${x.name}`).join(" · ")}</p>
            ) : null}
            {b.routes.map((r) => (
              <div key={r.routeId} className="pl-3">
                <p className="font-semibold">🛵 {r.routeName}</p>
                <ol className="pl-4">
                  {r.stops.map((s) => (
                    <li key={s.code}>
                      #{s.seq} {s.name} · {s.zone} · {s.collect > 0 ? `THU ${s.collect.toLocaleString("vi-VN")}đ` : "ĐÃ CK"}
                      {s.note ? <span className="block font-semibold">📝 {s.note}</span> : null}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            {b.pickups.map((p) => (
              <p key={p.pointName} className="pl-3">
                ☕ {p.pointName}: {p.orders.map((o) => `#${o.seq} ${o.name}`).join(" · ")}
              </p>
            ))}
          </section>
        ))}

        {prep.warnings.length > 0 ? (
          <>
            <h2 className="mt-3 border-b border-black font-bold uppercase">{copy.admin.prep.warnings}</h2>
            <ul>
              {prep.warnings.map((w) => (
                <li key={`${w.kind}-${w.orderCode}`}>⚠ {warningText(w)}</li>
              ))}
            </ul>
          </>
        ) : null}
      </main>
    </div>
  );
}
