// Số di động Việt Nam ở dạng chuẩn "0xxxxxxxxx" (10 số, đầu 03/05/07/08/09).

const MOBILE_RE = /^0(3|5|7|8|9)\d{8}$/;

/** Bỏ khoảng trắng . - ( ), đổi "+84"/"84" thành "0"; trả null nếu không hợp lệ. */
export function normalizePhone(raw: string): string | null {
  let p = raw.replace(/[\s.\-()]/g, "");
  if (p.startsWith("+84")) p = `0${p.slice(3)}`;
  else if (p.startsWith("84") && p.length === 11) p = `0${p.slice(2)}`;
  return MOBILE_RE.test(p) ? p : null;
}

/** "0912345678" → "0912 345 678". */
export function formatPhone(p: string): string {
  return p.length === 10 ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : p;
}

/** Tên gọi để chào khách: "Nguyễn Văn Tuấn" → "Tuấn". */
export function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? "";
}
