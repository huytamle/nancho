// Ưu đãi thành viên & mã giảm giá (BLUEPRINT §19, M12). Thuần — tiền là int VND.
//
// Nguyên tắc (chủ quán chốt 31/10/2026): không thưởng cho đánh giá Google/Facebook (vi phạm chính sách của họ);
// thưởng cho đánh giá món ngay trong app + mã giới thiệu (chỉ trả khi có đơn thật). Giảm số tiền cố định,
// mỗi đơn một mã, không cộng dồn. Điểm chỉ cho khách đăng nhập.

export type VoucherKind = "welcome" | "review" | "referral" | "points";

export const PROMO = {
  /** Quà chào mừng khi tạo tài khoản — chỉ dùng cho đơn đầu tiên của SĐT. */
  welcome: { amount: 15_000, minSubtotal: 150_000, days: 30 },
  /** Đánh giá món trong app (đơn đã hoàn tất) → mã cho đơn sau, ≈ một lon nước. */
  review: { amount: 10_000, minSubtotal: 100_000, days: 21 },
  /** Bạn mới dùng mã giới thiệu ở đơn đầu tiên. */
  referralFriend: { amount: 20_000, minSubtotal: 150_000 },
  /** Người giới thiệu nhận khi đơn của bạn mới hoàn tất; tối đa `monthlyCap` lần/tháng. */
  referral: { amount: 20_000, minSubtotal: 150_000, days: 30, monthlyCap: 5 },
  /** 1 điểm mỗi 10.000đ đơn hoàn tất; đổi 50 điểm → mã 20.000đ (≈ 4% hoàn lại). */
  points: { per: 10_000, cost: 50, amount: 20_000, minSubtotal: 0, days: 60 },
} as const;

export type VoucherLike = {
  kind: VoucherKind;
  amount: number;
  minSubtotal: number;
  expiresAt: Date;
  usedOrderId: string | null;
};

export type PromoError = "not_found" | "expired" | "used" | "min_subtotal" | "first_order_only" | "own_code" | "not_yours";

export type PromoCheck = { ok: true; amount: number } | { ok: false; reason: PromoError; minSubtotal?: number };

/** Mã chỉ dành cho đơn đầu tiên của một SĐT (chặn tạo nhiều tài khoản để lấy quà chào mừng). */
const firstOrderOnly = (kind: VoucherKind) => kind === "welcome";

export function checkVoucher(v: VoucherLike, ctx: { subtotal: number; now: Date; firstOrder: boolean }): PromoCheck {
  if (v.usedOrderId) return { ok: false, reason: "used" };
  if (ctx.now.getTime() >= v.expiresAt.getTime()) return { ok: false, reason: "expired" };
  if (firstOrderOnly(v.kind) && !ctx.firstOrder) return { ok: false, reason: "first_order_only" };
  if (ctx.subtotal < v.minSubtotal) return { ok: false, reason: "min_subtotal", minSubtotal: v.minSubtotal };
  return { ok: true, amount: Math.min(v.amount, ctx.subtotal) };
}

export function checkReferral(ctx: { subtotal: number; firstOrder: boolean; ownCode: boolean }): PromoCheck {
  if (ctx.ownCode) return { ok: false, reason: "own_code" };
  if (!ctx.firstOrder) return { ok: false, reason: "first_order_only" };
  const r = PROMO.referralFriend;
  if (ctx.subtotal < r.minSubtotal) return { ok: false, reason: "min_subtotal", minSubtotal: r.minSubtotal };
  return { ok: true, amount: Math.min(r.amount, ctx.subtotal) };
}

/** Điểm của một đơn hoàn tất: tính trên số khách thật trả (sau giảm, gồm ship). */
export const pointsFor = (total: number) => Math.max(0, Math.floor(total / PROMO.points.per));

/** Hạng thành viên theo tổng điểm từng tích (không trừ điểm đã đổi) — chỉ để hiển thị & tạo động lực. */
export const TIERS = [
  { key: "ember", label: "Than hồng", from: 0 },
  { key: "flame", label: "Ngọn lửa", from: 100 },
  { key: "blaze", label: "Lò rực", from: 300 },
] as const;

export function tierOf(earned: number) {
  const i = TIERS.findLastIndex((t) => earned >= t.from);
  const tier = TIERS[Math.max(0, i)];
  const next = TIERS[i + 1] ?? null;
  return { tier, next, toNext: next ? next.from - earned : 0 };
}

export const normalizeCode = (raw: string) => raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

// Bảng chữ không có 0/O/1/I/L để đọc qua điện thoại không nhầm.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Mã ngẫu nhiên `PREFIX` + `n` ký tự. `rand` trả số nguyên 0..255 (crypto ở server, cố định trong test). */
export function makeCode(prefix: string, n: number, rand: () => number): string {
  let out = prefix;
  for (let i = 0; i < n; i++) out += ALPHABET[rand() % ALPHABET.length];
  return out;
}

export const addDaysTo = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);
