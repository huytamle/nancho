"use client";

import { useState } from "react";
import { copy } from "@/data/copy";
import { formatPrice } from "@/lib/format";
import type { TransferInfo } from "@/lib/payments";

const t = copy.success;

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {}
      }}
      className="min-h-11 rounded-full bg-bg px-4 text-sm font-medium"
    >
      {copied ? t.copied : label}
    </button>
  );
}

/**
 * Khối chuyển khoản (§11.1): ảnh VietQR + số tiền + nội dung + [Lưu mã QR] [Sao chép STK] [Sao chép nội dung].
 * Dùng chung cho màn thành công và trang `/o/[token]`. Không cấu hình tài khoản → chỉ số tiền + nội dung.
 */
export function TransferBox({ info, className = "" }: { info: TransferInfo; className?: string }) {
  return (
    <section aria-label={t.transferTitle} className={`rounded-tile bg-elevated p-4 text-left text-sm ${className}`}>
      <p className="font-semibold">{t.transferTitle}</p>
      {info.qrUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh QR động từ img.vietqr.io (không qua tối ưu ảnh)
        <img src={info.qrUrl} alt={t.qrAlt(formatPrice(info.amount))} width={240} height={240} className="mx-auto mt-3 size-60 rounded-2xl bg-white p-2" />
      ) : null}
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {info.accountNo ? (
          <>
            <dt className="text-secondary">{t.account}</dt>
            <dd className="font-semibold tabular-nums">
              {info.accountNo}
              {info.bankName ? <span className="font-normal text-secondary"> · {info.bankName}</span> : null}
            </dd>
            <dt className="text-secondary">{t.accountName}</dt>
            <dd className="font-semibold">{info.accountName}</dd>
          </>
        ) : null}
        <dt className="text-secondary">{t.amount}</dt>
        <dd className="font-semibold tabular-nums">{formatPrice(info.amount)}</dd>
        <dt className="text-secondary">{t.memo}</dt>
        <dd className="font-semibold tracking-wider">{info.memo}</dd>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        {info.qrUrl ? (
          // Ảnh khác origin: thuộc tính `download` bị trình duyệt bỏ qua → mở ảnh để khách nhấn giữ "Lưu ảnh".
          <a href={info.qrUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-full bg-bg px-4 text-sm font-medium">
            {t.saveQr}
          </a>
        ) : null}
        {info.accountNo ? <CopyButton text={info.accountNo} label={t.copyAccount} /> : null}
        <CopyButton text={info.memo} label={t.copyMemo} />
      </div>
      <p className="mt-3 text-xs text-secondary">{t.transferHint}</p>
    </section>
  );
}
