import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { REMEMBER_DAYS } from "@/lib/privacy";

// Token ký HMAC cho khách (§7.7): cookie "ghi nhớ" `th_c` (180 ngày) và `savedAddressToken` (30 phút).
// Dạng `<payload base64url>.<sig base64url>`; `purpose` nằm trong chữ ký → không dùng lẫn token loại này cho loại kia.

export const CUSTOMER_COOKIE = "th_c";
export { REMEMBER_DAYS };
const ADDRESS_TTL_SEC = 30 * 60;

const DEV_SECRET = "dev-only-customer-cookie-secret-change-me";

function secret(): string {
  const s = process.env.CUSTOMER_COOKIE_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("CUSTOMER_COOKIE_SECRET chưa đặt (≥ 32 ký tự)");
  return DEV_SECRET;
}

type Purpose = "remember" | "address";

const mac = (purpose: Purpose, body: string) => createHmac("sha256", secret()).update(`${purpose}.${body}`).digest("base64url");

function sign(purpose: Purpose, payload: object, expSec: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: expSec })).toString("base64url");
  return `${body}.${mac(purpose, body)}`;
}

function verify<T>(purpose: Purpose, token: string | undefined, now: Date): T | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(mac(purpose, body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp: number };
    return typeof data.exp === "number" && data.exp * 1000 > now.getTime() ? data : null;
  } catch {
    return null;
  }
}

const sec = (d: Date) => Math.floor(d.getTime() / 1000);

/** Giá trị cookie `th_c`: chỉ chứa id khách — dữ liệu thật luôn đọc từ DB. */
export function signRemember(customerId: string, now: Date): string {
  return sign("remember", { c: customerId }, sec(now) + REMEMBER_DAYS * 86_400);
}

export function verifyRemember(token: string | undefined, now: Date): string | null {
  return verify<{ c: string }>("remember", token, now)?.c ?? null;
}

/** Token "giao tới địa chỉ lần trước": trỏ tới đơn giao gần nhất của khách, hết hạn 30 phút. */
export function signAddress(customerId: string, orderId: string, now: Date): string {
  return sign("address", { c: customerId, o: orderId }, sec(now) + ADDRESS_TTL_SEC);
}

export function verifyAddress(token: string | undefined, now: Date): { customerId: string; orderId: string } | null {
  const data = verify<{ c: string; o: string }>("address", token, now);
  return data ? { customerId: data.c, orderId: data.o } : null;
}

export const rememberCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: REMEMBER_DAYS * 86_400,
};
