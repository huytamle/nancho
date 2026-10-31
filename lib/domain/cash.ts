// Két & hộp chi (BLUEPRINT §17.3). Tiền là số nguyên VND; đếm theo số tờ từng mệnh giá.

export const DENOMINATIONS = [500_000, 200_000, 100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500] as const;
export type Denomination = (typeof DENOMINATIONS)[number];
/** Số tờ theo mệnh giá — khoá là chuỗi số (jsonb). Mệnh giá không có tờ nào thì bỏ khỏi object. */
export type CashCounts = Partial<Record<`${Denomination}`, number>>;

const MAX_PIECES = 10_000;
const KEYS = new Set<string>(DENOMINATIONS.map(String));

/** Chuẩn hoá dữ liệu đếm từ client: chỉ mệnh giá hợp lệ, số tờ nguyên 0…10.000; sai → null. */
export function normalizeCounts(raw: Record<string, unknown>): CashCounts | null {
  const out: CashCounts = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!KEYS.has(k) || typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_PIECES) return null;
    if (v > 0) out[k as `${Denomination}`] = v;
  }
  return out;
}

export function countTotal(counts: CashCounts): number {
  return DENOMINATIONS.reduce((sum, d) => sum + d * (counts[`${d}`] ?? 0), 0);
}

/** Két lúc đóng ca: đầu ca + tiền mặt café (Sapo) + COD pizza đã thu − tiền nộp về chủ. Chi phí không lấy từ két. */
export function registerExpected(p: { opening: number; cafeCash: number; codCollected: number; drops: number }): number {
  return p.opening + p.cafeCash + p.codCollected - p.drops;
}

export type VarianceLevel = "ok" | "minor" | "major";

/** Lệch = đếm thật − đáng có. 0 → ok; trong ngưỡng → minor; vượt → major. */
export function varianceLevel(variance: number, tolerance: number): VarianceLevel {
  if (variance === 0) return "ok";
  return Math.abs(variance) <= tolerance ? "minor" : "major";
}

/** Hộp chi định mức: tiền phải còn trong hộp = định mức − các khoản chi từ hộp chưa nạp bù. */
export const pettyExpected = (float: number, unreplenished: number) => float - unreplenished;
