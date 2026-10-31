"use client";

import { useActionState } from "react";
import { createReservation, type ReservationState } from "@/app/actions/reservation";
import { copy } from "@/data/copy";
import { toVnLocal } from "@/lib/domain/time";

const initial: ReservationState = { ok: false, status: "", errors: {} };
const t = copy.reservationForm;

const fieldClass =
  "mt-2 h-12 w-full rounded-2xl border border-line bg-bg px-4 text-text outline-none transition focus:border-text/40";

function FieldError({ id, error }: { id: string; error?: keyof typeof t.errors }) {
  if (!error) return null;
  return (
    <p id={id} className="mt-1 text-sm text-danger">
      {t.errors[error]}
    </p>
  );
}

export function ReservationForm() {
  const [state, action, pending] = useActionState(createReservation, initial);

  const statusMessage =
    state.status === "success" ? t.success : state.status === "invalid" ? t.invalid : "";

  return (
    <form action={action} className="space-y-5" noValidate>
      <p
        role="status"
        aria-live="polite"
        className={
          statusMessage
            ? `rounded-2xl px-4 py-3 text-sm ${state.ok ? "bg-elevated text-text" : "bg-danger/15 text-text"}`
            : "sr-only"
        }
      >
        {statusMessage}
      </p>

      <div>
        <label htmlFor="name" className="text-sm text-secondary">
          {t.name}
        </label>
        <input
          id="name"
          name="name"
          required
          autoComplete="name"
          aria-invalid={!!state.errors.name}
          aria-describedby={state.errors.name ? "name-error" : undefined}
          className={fieldClass}
        />
        <FieldError id="name-error" error={state.errors.name} />
      </div>

      <div>
        <label htmlFor="phone" className="text-sm text-secondary">
          {t.phone}
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          required
          autoComplete="tel"
          placeholder="0912 345 678"
          aria-invalid={!!state.errors.phone}
          aria-describedby={state.errors.phone ? "phone-error" : undefined}
          className={fieldClass}
        />
        <FieldError id="phone-error" error={state.errors.phone} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="guests" className="text-sm text-secondary">
            {t.guests}
          </label>
          <input
            id="guests"
            name="guests"
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            defaultValue={2}
            required
            aria-invalid={!!state.errors.guests}
            aria-describedby={state.errors.guests ? "guests-error" : undefined}
            className={fieldClass}
          />
          <FieldError id="guests-error" error={state.errors.guests} />
        </div>
        <div>
          <label htmlFor="datetime" className="text-sm text-secondary">
            {t.datetime}
          </label>
          <input
            id="datetime"
            name="datetime"
            type="datetime-local"
            required
            // Giới hạn theo giờ VN; đặt lúc focus để không đọc đồng hồ khi render.
            onFocus={(e) => {
              e.currentTarget.min = toVnLocal(new Date());
            }}
            aria-invalid={!!state.errors.datetime}
            aria-describedby={state.errors.datetime ? "datetime-error" : undefined}
            className={fieldClass}
          />
          <FieldError id="datetime-error" error={state.errors.datetime} />
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="text-sm text-secondary">
          {t.notes}
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={300}
          placeholder={t.notesPlaceholder}
          aria-invalid={!!state.errors.notes}
          aria-describedby={state.errors.notes ? "notes-error" : undefined}
          className="mt-2 w-full rounded-2xl border border-line bg-bg px-4 py-3 text-text outline-none transition focus:border-text/40"
        />
        <FieldError id="notes-error" error={state.errors.notes} />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-invert px-6 text-sm font-medium text-on-invert transition-opacity hover:opacity-80 disabled:opacity-50 sm:w-auto"
      >
        {pending ? t.pending : t.submit}
      </button>
    </form>
  );
}
