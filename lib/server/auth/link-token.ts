import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Mã liên kết Telegram (§17.4): link `t.me/<bot>?start=<mã>` hết hạn sau 10 phút.
// Tham số start của Telegram chỉ nhận [A-Za-z0-9_-], ≤ 64 ký tự → mã = base64url(staffId·exp·HMAC 12 byte) = 27 ký tự.

const TTL_SEC = 600;
const DEV_SECRET = "dev-only-session-secret-change-me-0123456789";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET chưa đặt (≥ 32 ký tự)");
  return DEV_SECRET;
}

const mac = (payload: Buffer) => createHmac("sha256", secret()).update("tg-link:").update(payload).digest().subarray(0, 12);

export function createLinkToken(staffId: number, now: Date): string {
  const payload = Buffer.alloc(8);
  payload.writeUInt32BE(staffId, 0);
  payload.writeUInt32BE(Math.floor(now.getTime() / 1000) + TTL_SEC, 4);
  return Buffer.concat([payload, mac(payload)]).toString("base64url");
}

/** staffId nếu mã đúng chữ ký và còn hạn, ngược lại null. */
export function verifyLinkToken(token: string, now: Date): number | null {
  if (!/^[A-Za-z0-9_-]{27}$/.test(token)) return null;
  const raw = Buffer.from(token, "base64url");
  if (raw.length !== 20) return null;
  const payload = raw.subarray(0, 8);
  if (!timingSafeEqual(raw.subarray(8), mac(payload))) return null;
  if (payload.readUInt32BE(4) < Math.floor(now.getTime() / 1000)) return null;
  return payload.readUInt32BE(0);
}
