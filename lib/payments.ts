// Thanh toán (§11): ảnh VietQR & đọc webhook SePay. Thuần — không đọc env, không DB → unit test được.

import * as z from "zod";

export type BankAccount = { bin: string; accountNo: string; accountName: string; bankName: string | null };

/**
 * Link ảnh "Quick Link" của VietQR (§11.1): `img.vietqr.io/image/<BIN>-<STK>-<template>.png?amount&addInfo&accountName`.
 * Tự dựng thay vì dùng gói `vietqr` trên npm: gói đó chỉ nối chuỗi y hệt nhưng kéo theo axios + API key.
 */
export function vietQrUrl(acc: BankAccount, amount: number, memo: string, template = "compact2"): string {
  const q = new URLSearchParams({ amount: String(amount), addInfo: memo, accountName: acc.accountName });
  return `https://img.vietqr.io/image/${encodeURIComponent(acc.bin)}-${encodeURIComponent(acc.accountNo)}-${template}.png?${q}`;
}

/** Thông tin chuyển khoản gửi cho khách (màn thành công & `/o/[token]`). Thiếu cấu hình → chỉ có số tiền + nội dung. */
export type TransferInfo = {
  amount: number;
  memo: string;
  qrUrl: string;
  bankName: string | null;
  accountNo: string | null;
  accountName: string | null;
};

export function transferInfo(acc: BankAccount | null, amount: number, memo: string): TransferInfo {
  return {
    amount,
    memo,
    qrUrl: acc ? vietQrUrl(acc, amount, memo) : "",
    bankName: acc?.bankName ?? null,
    accountNo: acc?.accountNo ?? null,
    accountName: acc?.accountName ?? null,
  };
}

/**
 * Payload webhook SePay (giao dịch ngân hàng). Tên trường theo tài liệu SePay "Tích hợp WebHooks":
 * id, gateway, transactionDate, accountNumber, code, content, transferType ("in"|"out"), transferAmount,
 * accumulated, subAccount, referenceCode, description. Giữ `loose` để SePay thêm trường không làm hỏng.
 */
export const SepayPayload = z.looseObject({
  id: z.union([z.number().int(), z.string().min(1).max(64)]).transform(String),
  gateway: z.string().nullish(),
  transactionDate: z.string().nullish(),
  accountNumber: z.string().nullish(),
  code: z.string().nullish(),
  content: z.string().nullish(),
  description: z.string().nullish(),
  referenceCode: z.string().nullish(),
  transferType: z.enum(["in", "out"]),
  transferAmount: z.coerce.number().int().nonnegative(),
});
export type SepayPayload = z.infer<typeof SepayPayload>;

/** Văn bản dùng để dò mã đơn: mã SePay tự nhận diện (nếu cấu hình) + nội dung + mô tả đầy đủ. */
export const sepayText = (p: SepayPayload) => [p.code, p.content, p.description].filter(Boolean).join(" ");

/** Header SePay gửi: `Authorization: Apikey <API_KEY>`. */
export const sepayAuthHeader = (key: string) => `Apikey ${key}`;
