import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CopyCode, RedeemButton, ShareReferral, SignInPanel } from "@/components/account-client";
import { Journey, SiteHeader } from "@/components/landing";
import { copy } from "@/data/copy";
import { PROMO } from "@/lib/domain/promo";
import { formatPrice } from "@/lib/format";
import { currentMember } from "@/lib/server/auth/clerk";
import { serverNow } from "@/lib/server/clock";
import { loadAccount, type AccountView } from "@/lib/server/dal/promo";

// Trang thành viên (M12): điểm, hạng, ví mã, đơn đang chạy, lịch sử, mã giới thiệu. Động trong <Suspense>.
export const metadata: Metadata = {
  title: copy.account.metaTitle,
  robots: { index: false, follow: false },
};

const t = copy.account;
const dateLabel = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" });

export default function AccountPage() {
  return (
    <>
      <SiteHeader />
      <main id="noi-dung" className="mx-auto max-w-3xl px-4 pt-8 pb-16">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-tile bg-surface" />}>
          <Account />
        </Suspense>
      </main>
      <Journey />
    </>
  );
}

async function Account() {
  await connection(); // luôn theo request (cookie/phiên), kể cả khi chưa bật Clerk
  const member = await currentMember();
  if (!member) return <SignedOut />;
  return <Dashboard v={await loadAccount(member, serverNow())} />;
}

function SignedOut() {
  return (
    <div className="grid gap-8 md:grid-cols-2 md:items-start">
      <div>
        <p className="text-[12px] font-semibold tracking-[0.22em] text-accent uppercase">{t.kicker}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance">{t.signedOut.title}</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-secondary">{t.signedOut.body}</p>
        <ul className="mt-6 space-y-3 text-[15px]">
          {t.signedOut.perks.map((p) => (
            <li key={p} className="flex gap-3">
              <span aria-hidden className="text-live">
                ✓
              </span>
              {p}
            </li>
          ))}
        </ul>
      </div>
      <SignInPanel />
    </div>
  );
}

function Dashboard({ v }: { v: AccountView }) {
  const usable = v.vouchers.filter((x) => x.usable);
  const past = v.vouchers.filter((x) => !x.usable);
  const active = v.orders.filter((o) => o.active);
  const history = v.orders.filter((o) => !o.active);
  const { tier, next, toNext } = v.tier;
  const progress = next ? Math.min(100, Math.round(((v.points.earned - tier.from) / (next.from - tier.from)) * 100)) : 100;

  return (
    <div className="space-y-6">
      {/* Thẻ thành viên */}
      <section aria-labelledby="me" className="relative overflow-hidden rounded-tile bg-black p-6 text-white sm:p-8">
        <div aria-hidden className="absolute -top-24 -right-24 size-72 rounded-full bg-[#ff3d00]/35 blur-3xl" />
        <p className="text-sm text-white/70">{t.hello}</p>
        <h1 id="me" className="mt-1 text-3xl font-semibold tracking-tight">
          {v.name}
        </h1>
        <p className="mt-3 inline-flex rounded-full bg-white/12 px-3 py-1 text-sm font-semibold ring-1 ring-white/20">🔥 {tier.label}</p>
        <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-white/70">{t.points}</p>
            <p className="text-5xl font-semibold tracking-tight tabular-nums">{v.points.balance}</p>
          </div>
          <RedeemButton balance={v.points.balance} cost={PROMO.points.cost} label={t.redeem(PROMO.points.cost, formatPrice(PROMO.points.amount))} />
        </div>
        <div className="mt-6">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={t.tierProgress}>
            <div className="h-full rounded-full bg-[#ff3d00]" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-sm text-white/70">{next ? t.toNext(toNext, next.label) : t.topTier}</p>
        </div>
      </section>

      {active.length > 0 ? (
        <Card title={t.active}>
          <ul className="divide-y divide-line">
            {active.map((o) => (
              <li key={o.code} className="flex items-center gap-3 py-3">
                <span aria-hidden className="size-2 shrink-0 rounded-full bg-live live-dot" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{copy.receipt.stages[o.stage]}</p>
                  <p className="truncate text-sm text-secondary">
                    {o.segment === "cafe" ? "☕" : "🍕"} {o.dayLabel} · {o.timeLabel} · {o.summary}
                  </p>
                </div>
                <Link href={o.trackingPath} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-invert px-4 text-sm font-semibold text-on-invert">
                  {t.track}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title={t.wallet}>
        {usable.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {usable.map((x) => (
              <li key={x.code} className="rounded-field border border-dashed border-accent p-4">
                <p className="text-2xl font-semibold tracking-tight tabular-nums">−{formatPrice(x.amount)}</p>
                <p className="mt-0.5 text-sm text-secondary">
                  {t.kinds[x.kind]} · {x.minSubtotal > 0 ? t.min(formatPrice(x.minSubtotal)) : t.noMin} · {t.until(dateLabel.format(new Date(x.expiresAt)))}
                </p>
                <CopyCode code={x.code} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-secondary">{t.noVouchers}</p>
        )}
        {past.length > 0 ? (
          <details className="mt-4 text-sm text-secondary">
            <summary className="min-h-11 cursor-pointer py-2">{t.pastVouchers(past.length)}</summary>
            <ul className="space-y-1">
              {past.map((x) => (
                <li key={x.code} className="tabular-nums">
                  <s>{x.code}</s> · −{formatPrice(x.amount)} · {x.usedAt ? t.used : t.expired}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Card>

      <Card title={t.referral}>
        <p className="text-[15px] leading-relaxed text-secondary">
          {t.referralBody(formatPrice(PROMO.referralFriend.amount), formatPrice(PROMO.referral.amount))}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="rounded-field bg-elevated px-4 py-2.5 text-xl font-semibold tracking-[0.2em] tabular-nums">{v.referralCode}</p>
          <ShareReferral code={v.referralCode} />
        </div>
        {v.referrals.completed > 0 ? <p className="mt-3 text-sm text-live">{t.referred(v.referrals.completed)}</p> : null}
      </Card>

      <Card title={t.history}>
        {history.length > 0 ? (
          <ul className="divide-y divide-line">
            {history.map((o) => (
              <li key={o.code}>
                <Link href={o.trackingPath} className="flex min-h-14 items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">{o.summary || o.code}</p>
                    <p className="text-sm text-secondary">
                      {o.dayLabel} · {copy.receipt.stages[o.stage]}
                      {o.points > 0 ? ` · +${o.points} điểm` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">{formatPrice(o.total)}</span>
                  <span aria-hidden className="text-secondary">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-secondary">
            {t.noOrders}{" "}
            <Link href="/#thuc-don" className="font-medium text-text underline underline-offset-4">
              {t.orderNow}
            </Link>
          </p>
        )}
      </Card>

      <Card title={t.promos}>
        <ul className="space-y-3">
          {t.promoList.map((p) => (
            <li key={p.title} className="rounded-field bg-elevated px-4 py-3">
              <p className="font-semibold">{p.title}</p>
              <p className="mt-0.5 text-sm text-secondary">{p.body}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-tile bg-surface p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}
