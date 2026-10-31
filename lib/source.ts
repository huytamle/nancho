// Kênh marketing (`?src=`, §13.4 & MARKETING.md). Dùng chung proxy ↔ server ↔ client.

export const SRC_COOKIE = "th_src";
const SRC_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** Chuẩn hoá & lọc giá trị `src` (cookie do client gửi lên nên không tin): sai định dạng → null. */
export function cleanSource(raw: string | null | undefined): string | null {
  const v = raw?.trim().toLowerCase();
  return v && SRC_RE.test(v) ? v : null;
}
