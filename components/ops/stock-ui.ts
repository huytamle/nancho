// Tiện ích dùng chung của tab Kho (client).

export const chip = (on: boolean) => `min-h-11 rounded-full px-4 text-[15px] font-semibold ${on ? "bg-invert text-on-invert" : "bg-elevated text-secondary"}`;
export const label = "mb-1 block text-sm text-secondary";

/** Số lượng gõ tay: "4,5" · "0.5" · "1.500,5" → số; rỗng/sai → null. */
export const parseQty = (s: string): number | null => {
  const raw = s.trim();
  if (!raw) return null;
  const v = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
  return Number.isFinite(v) ? v : null;
};
