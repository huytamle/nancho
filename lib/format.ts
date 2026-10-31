const vnd = new Intl.NumberFormat("vi-VN");

/** 159000 → "159.000đ". Tiền luôn là số nguyên VND. */
export function formatPrice(amount: number) {
  return `${vnd.format(amount)}đ`;
}
