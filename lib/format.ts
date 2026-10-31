import type { Lang } from "@/data/i18n";

export function formatPrice(amount: number, lang: Lang = "vi") {
  if (lang === "en") {
    return `${new Intl.NumberFormat("en-US").format(amount)} VND`;
  }
  return `${new Intl.NumberFormat("vi-VN").format(amount)}đ`;
}

export function formatVnd(amount: number) {
  return formatPrice(amount, "vi");
}
