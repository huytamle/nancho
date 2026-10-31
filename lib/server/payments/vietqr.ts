import "server-only";
import { transferInfo, type BankAccount, type TransferInfo } from "@/lib/payments";

// Tài khoản nhận tiền từ env (§5.6). Thiếu một trong ba biến bắt buộc → không có QR (khách vẫn thấy số tiền + nội dung).

export function bankAccount(): BankAccount | null {
  const bin = process.env.VIETQR_BANK_BIN?.trim();
  const accountNo = process.env.VIETQR_ACCOUNT_NO?.trim();
  const accountName = process.env.VIETQR_ACCOUNT_NAME?.trim();
  if (!bin || !accountNo || !accountName) return null;
  return { bin, accountNo, accountName, bankName: process.env.VIETQR_BANK_NAME?.trim() || null };
}

export const transferFor = (amount: number, memo: string): TransferInfo => transferInfo(bankAccount(), amount, memo);
