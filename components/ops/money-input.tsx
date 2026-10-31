"use client";

import { opsCopy } from "@/data/copy-ops";
import { parseAmount } from "@/lib/domain/money-text";
import { formatPrice } from "@/lib/format";

/** Ô tiền gõ kiểu "150k", "1tr2", "85.000" — hiện số đã hiểu ngay dưới ô. Trả về số nguyên VND hoặc null. */
export function MoneyInput({
  id,
  label,
  text,
  onText,
  hint = opsCopy.expense.amountHint,
}: {
  id: string;
  label: string;
  text: string;
  onText: (text: string, amount: number | null) => void;
  hint?: string;
}) {
  const amount = text.trim() ? parseAmount(text) : null;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-secondary">
        {label}
      </label>
      <input
        id={id}
        inputMode="text"
        autoComplete="off"
        value={text}
        placeholder={hint}
        aria-invalid={text.trim() !== "" && amount === null ? true : undefined}
        aria-describedby={`${id}-read`}
        onChange={(e) => onText(e.target.value, e.target.value.trim() ? parseAmount(e.target.value) : null)}
        className="input tabular-nums"
      />
      <p id={`${id}-read`} className="mt-1 min-h-5 text-sm text-secondary tabular-nums" aria-live="polite">
        {amount !== null ? opsCopy.expense.amountRead(formatPrice(amount)) : ""}
      </p>
    </div>
  );
}

/** Số tiền nhập thuần số (doanh thu Sapo): chỉ chữ số, hiện dạng 1.200.000. */
export function PlainMoneyInput({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-secondary">
        {label}
      </label>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={value ? new Intl.NumberFormat("vi-VN").format(value) : ""}
        placeholder="0"
        onChange={(e) => onChange(Math.min(100_000_000, Number(e.target.value.replace(/\D/g, "") || 0)))}
        className="input tabular-nums"
      />
    </div>
  );
}
