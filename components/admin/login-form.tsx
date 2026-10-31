"use client";

import { useState, useTransition } from "react";
import { login } from "@/app/actions/auth";
import { copy } from "@/data/copy";
import type { LoginResult } from "@/lib/admin-contract";

const t = copy.admin.login;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

export function LoginForm({ staff }: { staff: { id: number; name: string }[] }) {
  const [picked, setPicked] = useState<{ id: number; name: string } | null>(staff.length === 1 ? staff[0] : null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<LoginResult["reason"] | null>(null);
  const [pending, startTransition] = useTransition();

  if (staff.length === 0) return <p className="mt-8 text-secondary">{t.empty}</p>;

  function update(next: string) {
    const digits = next.replace(/\D/g, "").slice(0, 6);
    setPin(digits);
    setError(null);
    if (digits.length === 6 && picked) {
      startTransition(async () => {
        const res = await login({ staffId: picked.id, pin: digits });
        // Thành công thì server redirect; tới đây nghĩa là lỗi.
        setError(res.reason);
        setPin("");
      });
    }
  }

  if (!picked) {
    return (
      <section className="mt-8" aria-labelledby="pick-name">
        <h2 id="pick-name" className="text-secondary">
          {t.pickName}
        </h2>
        <ul className="mt-4 grid grid-cols-2 gap-3">
          {staff.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setPicked(s)}
                className="flex min-h-16 w-full items-center justify-center rounded-tile bg-surface px-4 text-lg font-semibold active:scale-[0.98]"
              >
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="mt-8" aria-labelledby="pin-label">
      <div className="flex items-center justify-between gap-3">
        <label id="pin-label" htmlFor="pin" className="text-lg font-medium">
          {t.pinFor(picked.name)}
        </label>
        {staff.length > 1 ? (
          <button
            type="button"
            onClick={() => {
              setPicked(null);
              setPin("");
              setError(null);
            }}
            className="min-h-11 px-2 text-secondary underline"
          >
            {t.back}
          </button>
        ) : null}
      </div>
      <input
        id="pin"
        type="password"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={6}
        value={pin}
        onChange={(e) => update(e.target.value)}
        disabled={pending}
        aria-invalid={error ? true : undefined}
        aria-describedby="pin-msg"
        placeholder={t.pinHint}
        className="input mt-3 h-16 text-center text-3xl tracking-[0.5em] tabular-nums"
      />
      <p id="pin-msg" role="alert" className="mt-2 min-h-6 text-sm text-danger">
        {error ? t.errors[error] : null}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-3" aria-hidden>
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            tabIndex={-1}
            disabled={pending}
            onClick={() => update(k === "clear" ? "" : k === "back" ? pin.slice(0, -1) : pin + k)}
            className={`flex h-16 items-center justify-center rounded-tile text-2xl font-semibold active:scale-95 disabled:opacity-40 ${
              k === "clear" || k === "back" ? "text-base text-secondary" : "bg-surface"
            }`}
          >
            {k === "clear" ? t.clear : k === "back" ? "⌫" : k}
          </button>
        ))}
      </div>
    </section>
  );
}
