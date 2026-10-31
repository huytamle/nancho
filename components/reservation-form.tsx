"use client";

import { useActionState, useEffect, useState } from "react";
import { createReservation, type ReservationState } from "@/app/actions/reservation";
import { useLanguage } from "@/components/language-provider";

const initial: ReservationState = { ok: false, status: "", errors: {} };

const fieldClass =
  "mt-2 h-12 w-full rounded-2xl border border-line bg-bg px-4 text-text outline-none transition focus:border-text/40";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-accent">{message}</p>;
}

export function ReservationForm() {
  const { t } = useLanguage();
  const [state, action, pending] = useActionState(createReservation, initial);
  const [minDateTime, setMinDateTime] = useState("");

  useEffect(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setMinDateTime(now.toISOString().slice(0, 16));
  }, []);

  const statusMessage =
    state.status === "success"
      ? t.form.success
      : state.status === "invalid"
        ? t.form.invalid
        : "";

  return (
    <form action={action} className="space-y-5" noValidate>
      {statusMessage ? (
        <p
          role="status"
          className={`rounded-2xl px-4 py-3 text-sm ${
            state.ok ? "bg-elevated text-text" : "bg-accent/15 text-text"
          }`}
        >
          {statusMessage}
        </p>
      ) : null}

      <div>
        <label htmlFor="name" className="text-sm text-secondary">
          {t.form.name}
        </label>
        <input
          id="name"
          name="name"
          required
          autoComplete="name"
          className={fieldClass}
        />
        <FieldError message={state.errors.name ? t.form.errors[state.errors.name] : undefined} />
      </div>

      <div>
        <label htmlFor="phone" className="text-sm text-secondary">
          {t.form.phone}
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          required
          autoComplete="tel"
          placeholder="0922 662 669"
          className={fieldClass}
        />
        <FieldError message={state.errors.phone ? t.form.errors[state.errors.phone] : undefined} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="guests" className="text-sm text-secondary">
            {t.form.guests}
          </label>
          <input
            id="guests"
            name="guests"
            type="number"
            min={1}
            max={20}
            defaultValue={2}
            required
            className={fieldClass}
          />
          <FieldError message={state.errors.guests ? t.form.errors[state.errors.guests] : undefined} />
        </div>
        <div>
          <label htmlFor="datetime" className="text-sm text-secondary">
            {t.form.datetime}
          </label>
          <input
            id="datetime"
            name="datetime"
            type="datetime-local"
            min={minDateTime || undefined}
            required
            className={fieldClass}
          />
          <FieldError
            message={state.errors.datetime ? t.form.errors[state.errors.datetime] : undefined}
          />
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="text-sm text-secondary">
          {t.form.notes}
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={300}
          placeholder={t.form.notesPlaceholder}
          className="mt-2 w-full rounded-2xl border border-line bg-bg px-4 py-3 text-text outline-none transition focus:border-text/40"
        />
        <FieldError message={state.errors.notes ? t.form.errors[state.errors.notes] : undefined} />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center rounded-full bg-invert px-6 text-sm font-medium text-on-invert transition-opacity hover:opacity-80 disabled:opacity-50 sm:w-auto"
      >
        {pending ? t.form.pending : t.form.submit}
      </button>
    </form>
  );
}
