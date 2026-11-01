"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { submitFeedback } from "@/app/actions/feedback";
import { copy } from "@/data/copy";
import { COMMENT_MAX, FEEDBACK_TAGS, SCORE_EMOJI, SCORE_LABEL, SCORES, type Score } from "@/lib/domain/feedback";
import type { FeedbackView } from "@/lib/server/dal/orders";

const t = copy.receipt.rate;

/** Chấm điểm khẩu vị 1 chạm (§18.5): 😋 · 🙂 · 😕 mỗi món; 😕 → chip gợi ý theo loại món + góp ý ≤ 300 ký tự. */
export function FeedbackForm({ token, feedback: f }: { token: string; feedback: FeedbackView }) {
  const router = useRouter();
  const [ratings, setRatings] = useState<Record<string, Score>>(f.saved?.ratings ?? {});
  const [tags, setTags] = useState<Record<string, string[]>>(f.saved?.tags ?? {});
  const [comment, setComment] = useState(f.saved?.comment ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (!f.editable) {
    return (
      <section aria-labelledby="rate-h" className="rounded-tile bg-surface p-4">
        <h2 id="rate-h" className="font-semibold">
          {t.locked}
        </h2>
        <p className="mt-1 text-[15px] text-secondary">
          {f.items.map((i) => `${i.name} ${f.saved?.ratings[i.productId] ? SCORE_EMOJI[f.saved.ratings[i.productId]] : "—"}`).join(" · ")}
        </p>
      </section>
    );
  }

  function toggleTag(id: string, tag: string) {
    setTags((m) => {
      const cur = m[id] ?? [];
      return { ...m, [id]: cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag] };
    });
  }

  function send() {
    if (Object.keys(ratings).length === 0) {
      setMsg({ ok: false, text: t.pick });
      return;
    }
    setMsg(null);
    start(async () => {
      let res;
      try {
        res = await submitFeedback({ token, ratings, tags, comment });
      } catch {
        res = { ok: false as const, reason: "server_error" as const };
      }
      if (res.ok) {
        setMsg({ ok: true, text: res.voucher ? t.thanksVoucher(res.voucher) : t.thanks });
        router.refresh();
      } else setMsg({ ok: false, text: res.reason === "rate_limited" ? t.rateLimited : res.reason === "locked" ? t.locked : t.failed });
    });
  }

  return (
    <section aria-labelledby="rate-h" className="rounded-tile bg-surface p-4">
      <h2 id="rate-h" className="text-lg font-semibold">
        {t.title}
      </h2>
      <p className="mt-0.5 text-sm text-secondary">{t.hint}</p>
      <ul className="mt-3 space-y-4">
        {f.items.map((i) => {
          const chosen = ratings[i.productId];
          const options = FEEDBACK_TAGS[i.kind] ?? [];
          return (
            <li key={i.productId}>
              <p id={`rate-${i.productId}`} className="font-medium">
                {i.name}
              </p>
              <div role="radiogroup" aria-labelledby={`rate-${i.productId}`} className="mt-2 grid grid-cols-3 gap-2">
                {SCORES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={chosen === s}
                    onClick={() => setRatings((m) => ({ ...m, [i.productId]: s }))}
                    className={`chip flex min-h-14 flex-col items-center justify-center rounded-2xl text-sm font-semibold ${
                      chosen === s ? "bg-invert text-on-invert" : "bg-elevated text-secondary"
                    }`}
                  >
                    <span aria-hidden className="text-2xl leading-none">
                      {SCORE_EMOJI[s]}
                    </span>
                    {SCORE_LABEL[s]}
                  </button>
                ))}
              </div>
              {chosen === 1 && options.length > 0 ? (
                <div className="mt-2">
                  <p className="text-sm text-secondary">{t.what}</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {options.map((tag) => {
                      const on = tags[i.productId]?.includes(tag) ?? false;
                      return (
                        <button
                          key={tag}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleTag(i.productId, tag)}
                          className={`chip min-h-11 rounded-full px-4 text-sm font-medium ${on ? "bg-accent text-on-accent" : "bg-elevated text-secondary"}`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <label htmlFor="rate-comment" className="mt-4 mb-1 block text-sm text-secondary">
        {t.comment}
      </label>
      <textarea
        id="rate-comment"
        value={comment}
        maxLength={COMMENT_MAX}
        rows={2}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t.commentPlaceholder}
        className="input resize-none"
      />
      <button type="button" onClick={send} disabled={pending} className="mt-3 h-12 w-full rounded-full bg-accent font-semibold text-on-accent disabled:opacity-50">
        {pending ? t.sending : f.saved ? t.update : t.submit}
      </button>
      {msg ? (
        <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-live" : "text-danger"}`}>
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}
