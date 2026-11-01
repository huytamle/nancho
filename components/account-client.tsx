"use client";

import { SignIn } from "@clerk/nextjs";
import { useState, useTransition } from "react";
import { redeemPoints } from "@/app/actions/promo";
import { copy } from "@/data/copy";
import { clerkEnabled } from "@/lib/clerk-config";

const t = copy.account;

export function SignInPanel() {
  if (!clerkEnabled) {
    return <p className="rounded-tile bg-surface p-6 text-[15px] text-secondary">{t.signedOut.disabled}</p>;
  }
  return (
    <div className="flex justify-center">
      <SignIn routing="hash" forceRedirectUrl="/tai-khoan" signUpForceRedirectUrl="/tai-khoan" />
    </div>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function CopyCode({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => setDone(await copyText(code))}
      className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-elevated px-4 text-sm font-semibold tracking-wider tabular-nums"
    >
      {code}
      <span className="font-normal tracking-normal text-secondary">{done ? `· ${t.copied}` : `· ${t.copy}`}</span>
    </button>
  );
}

export function ShareReferral({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  async function share() {
    const text = t.shareText(code);
    if (navigator.share) {
      try {
        await navigator.share({ text, url: location.origin });
        return;
      } catch {}
    }
    setDone(await copyText(`${text} ${location.origin}`));
  }
  return (
    <button type="button" onClick={share} className="inline-flex min-h-11 items-center rounded-full bg-invert px-5 text-sm font-semibold text-on-invert">
      {done ? t.copied : t.share}
    </button>
  );
}

export function RedeemButton({ balance, cost, label }: { balance: number; cost: number; label: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="text-right">
      <button
        type="button"
        disabled={balance < cost || pending}
        onClick={() =>
          start(async () => {
            const r = await redeemPoints().catch(() => ({ ok: false as const, reason: "server_error" as const }));
            setMsg(r.ok ? t.redeemed(r.code) : r.reason === "not_enough" ? t.notEnough : t.failed);
          })
        }
        className="inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-black transition active:scale-[0.98] disabled:opacity-40"
      >
        {pending ? "…" : label}
      </button>
      {msg ? (
        <p role="status" className="mt-2 text-sm text-white/80">
          {msg}
        </p>
      ) : balance < cost ? (
        <p className="mt-2 text-sm text-white/60">{t.needMore(cost - balance)}</p>
      ) : null}
    </div>
  );
}
