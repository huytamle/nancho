"use client";

import { useOptimistic, useState } from "react";
import { markChecklistItem } from "@/app/actions/ops";
import { useAdminAction } from "@/components/admin/use-admin";
import { ChecklistEditor } from "@/components/ops/checklist-editor";
import { PhotoInput } from "@/components/ops/photo-input";
import { box } from "@/components/ops/styles";
import { opsCopy } from "@/data/copy-ops";
import { showToast } from "@/lib/client/toast-store";
import type { ChecklistItemView, ChecklistRunView, WorkView } from "@/lib/server/dal/checklist";

const t = opsCopy.work;

// Tab "Việc" (§17.5): checklist theo vai trò của lượt hôm nay. Nhiều người cùng tick; dữ liệu mới sau mỗi thao tác (refresh()).
export function ChecklistPanel({ work }: { work: WorkView }) {
  return (
    <div className="space-y-5">
      {work.runs.length === 0 ? <p className={`${box} text-[15px] text-secondary`}>{t.empty}</p> : null}
      {work.runs.map((run) => (
        <RunCard key={run.templateId} run={run} />
      ))}
      {work.canEdit ? <ChecklistEditor templates={work.templates} /> : null}
    </div>
  );
}

function RunCard({ run }: { run: ChecklistRunView }) {
  const id = `run-${run.templateId}`;
  const pct = run.total ? Math.round((run.done / run.total) * 100) : 0;
  return (
    <section className={box} aria-labelledby={id}>
      <div className="flex items-baseline gap-2">
        <h2 id={id} className="mr-auto text-lg font-semibold">
          {run.title}
        </h2>
        <span className={`text-sm font-semibold tabular-nums ${run.complete ? "text-live" : "text-secondary"}`} data-testid={`${id}-progress`}>
          {run.complete ? t.complete : t.progress(run.done, run.total)}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-secondary">
        {t.moment[run.moment]}
        {run.moment === "weekly" ? ` · ${t.weekOf(`${run.date.slice(8)}/${run.date.slice(5, 7)}`)}` : ""}
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-elevated" aria-hidden>
        <div className={`h-full rounded-full transition-[width] duration-300 ${run.complete ? "bg-live" : "bg-accent"}`} style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-2 divide-y divide-line">
        {run.items.map((item) => (
          <li key={item.id} className="py-2">
            <ItemRow templateId={run.templateId} item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Meta({ item }: { item: ChecklistItemView }) {
  const m = item.mark;
  if (!m) return null;
  return (
    <p className="text-sm text-secondary tabular-nums">
      {m.value !== null ? (
        <strong className={m.out ? "text-danger" : "text-text"}>
          {String(m.value).replace(".", ",")}
          {item.value?.unit ? ` ${item.value.unit}` : ""}
          {m.out ? ` · ${t.outOfRange(item.range)}` : ""}
        </strong>
      ) : null}
      {m.value !== null ? " · " : ""}
      {t.by(m.by, m.at)}
      {m.photo ? (
        <>
          {" · "}
          <a href={`/api/ops/files/${m.photo}`} target="_blank" rel="noreferrer" className="underline">
            {opsCopy.expense.viewPhoto}
          </a>
        </>
      ) : null}
    </p>
  );
}

function ItemRow({ templateId, item }: { templateId: number; item: ChecklistItemView }) {
  const { pending, run } = useAdminAction();
  // Tick hiện ngay; server trả về (refresh) thì lấy trạng thái thật — lỗi thì tự quay lại.
  const [done, setDone] = useOptimistic(item.done);
  const fieldId = `ck-${templateId}-${item.id}`;
  const mark = (input: { value?: number; photo?: string | null; undo?: boolean }) =>
    run(
      () => {
        if (!item.value && !item.photo) setDone(!input.undo);
        return markChecklistItem({ templateId, itemId: item.id, ...input });
      },
      undefined,
      (r) => {
        if (r.out) showToast(t.outToast);
      },
    );

  if (item.value) return <ValueRow fieldId={fieldId} item={item} pending={pending} onSave={(value) => mark({ value, photo: item.mark?.photo })} />;

  if (item.photo && !item.done) {
    return (
      <div className="py-1">
        <p className="font-medium">{item.label}</p>
        <Meta item={item} />
        <div className="mt-2">
          <PhotoInput id={fieldId} label={t.needPhoto} value={null} onChange={(photo) => photo && mark({ photo })} />
        </div>
      </div>
    );
  }

  const locked = item.mark !== null && !item.mark.canUndo;
  return (
    <label className={`flex min-h-12 items-center gap-3 ${locked ? "" : "cursor-pointer"}`}>
      <input
        id={fieldId}
        type="checkbox"
        checked={done}
        disabled={pending || locked}
        onChange={() => mark(done ? { undo: true } : {})}
        className="size-6 shrink-0 accent-[var(--live)]"
      />
      <span className="min-w-0">
        <span className={`block font-medium ${done ? "text-secondary line-through decoration-1" : ""}`}>{item.label}</span>
        <Meta item={item} />
      </span>
    </label>
  );
}

/** Mục có số đo: nhập số (chấp nhận "4,5"; nút ± cho tủ đông vì bàn phím số iOS không có dấu trừ) → Lưu = đánh dấu. */
function ValueRow({ fieldId, item, pending, onSave }: { fieldId: string; item: ChecklistItemView; pending: boolean; onSave: (v: number) => void }) {
  const [text, setText] = useState("");
  const spec = item.value!;
  const negative = (spec.max ?? 1) <= 0 || (spec.min ?? 0) < 0;
  const parsed = text.trim() === "" ? null : Number(text.replace(",", ".").replace("−", "-"));
  const valid = parsed !== null && Number.isFinite(parsed);
  return (
    <div className="py-1">
      <label htmlFor={fieldId} className="flex items-baseline gap-2">
        <span className={`font-medium ${item.done ? "text-secondary" : ""}`}>
          {item.done ? "✓ " : ""}
          {item.label}
        </span>
        {item.range ? <span className="text-sm text-secondary">({item.range})</span> : null}
      </label>
      <Meta item={item} />
      <div className="mt-2 flex items-center gap-2">
        {negative ? (
          <button
            type="button"
            aria-label={t.sign}
            onClick={() => setText((s) => (s.startsWith("-") ? s.slice(1) : `-${s}`))}
            className="min-h-12 min-w-12 rounded-full bg-elevated text-lg font-semibold"
          >
            ±
          </button>
        ) : null}
        <input
          id={fieldId}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={text !== "" && !valid}
          className="input !w-28 tabular-nums"
        />
        <span className="text-secondary">{spec.unit}</span>
        <button
          type="button"
          disabled={pending || !valid}
          onClick={() => {
            onSave(parsed!);
            setText("");
          }}
          className="ml-auto min-h-12 rounded-full bg-invert px-5 font-semibold text-on-invert disabled:opacity-40"
        >
          {t.save}
          <span className="sr-only"> {item.label}</span>
        </button>
      </div>
    </div>
  );
}
