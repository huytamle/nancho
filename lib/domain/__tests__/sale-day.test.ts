import { describe, expect, it } from "vitest";
import { addonLetter, BOX_CODE_MAX, boxCode, circled } from "@/lib/domain/box-code";
import { isAffected, PAUSE_PRESETS, pauseCancelOf, pauseCancelReason, pauseMessage, pauseReasonOf } from "@/lib/domain/oven-lock";
import {
  averageScore,
  canEditFeedback,
  canRate,
  cleanFeedback,
  COMMENT_MAX,
  FEEDBACK_TAGS,
  ratableItems,
  SCORE_EMOJI,
  SCORE_LABEL,
  SCORES,
} from "@/lib/domain/feedback";
import { parseBotCommand } from "@/lib/domain/expense-command";
import type { ISODate } from "@/lib/domain/time";
import type { Kind } from "@/lib/domain/types";
import { DEFAULT_HOLD_MINUTES, holdLabel, holdUntil, isExpired, isHeld, needsHold } from "@/lib/domain/hold";

const at = (hhmm: string) => new Date(`2026-11-06T${hhmm}:00+07:00`);

describe("hold — giữ suất có hạn (§18.2)", () => {
  it("chỉ đơn khách tự đặt, CK, bị buộc trả trước", () => {
    expect(needsHold({ paymentMethod: "transfer", prepayRequired: true, byStaff: false })).toBe(true);
    expect(needsHold({ paymentMethod: "transfer", prepayRequired: false, byStaff: false })).toBe(false); // CK tự nguyện
    expect(needsHold({ paymentMethod: "cod", prepayRequired: true, byStaff: false })).toBe(false);
    expect(needsHold({ paymentMethod: "transfer", prepayRequired: true, byStaff: true })).toBe(false);
  });

  it("hạn = lúc đặt + số phút (mặc định 15, tối thiểu 1)", () => {
    expect(holdUntil(at("17:17"))).toEqual(at("17:32"));
    expect(DEFAULT_HOLD_MINUTES).toBe(15);
    expect(holdUntil(at("17:17"), 30)).toEqual(at("17:47"));
    expect(holdUntil(at("17:17"), 0)).toEqual(at("17:18"));
  });

  it("isHeld / isExpired: chỉ đơn placed + unpaid có hạn; đúng mốc chưa hết", () => {
    const o = { status: "placed" as const, paymentStatus: "unpaid" as const, holdUntil: at("17:32") };
    expect(isHeld(o)).toBe(true);
    expect(isExpired(o, at("17:32"))).toBe(false);
    expect(isExpired(o, new Date(at("17:32").getTime() + 1))).toBe(true);
    expect(isHeld({ ...o, holdUntil: null })).toBe(false);
    expect(isHeld({ ...o, status: "confirmed" })).toBe(false);
    expect(isExpired({ ...o, paymentStatus: "paid" }, at("18:00"))).toBe(false);
  });

  it("nhãn đếm ngược", () => {
    expect(holdLabel(at("17:32"), at("17:20"))).toEqual({ until: "17:32", remaining: "còn 12 phút", short: "chờ CK · còn 12 phút", expired: false });
    expect(holdLabel(at("17:32"), new Date(at("17:32").getTime() - 250_000)).remaining).toBe("còn 04:10");
    expect(holdLabel(at("17:32"), at("17:40"))).toMatchObject({ remaining: "hết giờ", expired: true });
  });
});

describe("box-code — mã nắp hộp (§18.3)", () => {
  it("số khoanh tròn", () => {
    expect(circled(1)).toBe("①");
    expect(circled(12)).toBe("⑫");
    expect(circled(20)).toBe("⑳");
    expect(circled(21)).toBe("㉑");
    expect(circled(35)).toBe("㉟");
    expect(circled(36)).toBe("㊱");
    expect(circled(50)).toBe("㊿");
    expect(circled(51)).toBe("(51)");
    expect(circled(0)).toBe("(0)");
  });

  it("chữ tắt add-on bỏ từ chỉ vật chứa", () => {
    expect(addonLetter("Hũ Sốt Bơ Tỏi chấm viền bánh")).toBe("S");
    expect(addonLetter("Hũ Sốt BBQ khói")).toBe("S");
    expect(addonLetter("Chai Cà phê ủ lạnh Rêu")).toBe("C");
    expect(addonLetter("Đá viên")).toBe("D");
    expect(addonLetter("Hũ")).toBe("H");
    expect(addonLetter("")).toBe("?");
  });

  it("ví dụ Blueprint: ⑫ T289 +2S · ⑦ CK", () => {
    expect(
      boxCode({ seq: 12, collect: 289_000, fulfillment: "delivery", addons: [{ name: "Hũ Sốt Bơ Tỏi", qty: 1 }, { name: "Hũ Sốt BBQ khói", qty: 1 }], units: 2 }),
    ).toEqual({ code: "⑫ T289 +2S", parts: ["⑫", "T289", "+2S"], boxes: 2, labels: ["1/2", "2/2"] });
    expect(boxCode({ seq: 7, collect: 0, fulfillment: "delivery", addons: [], units: 1 })).toEqual({ code: "⑦ CK", parts: ["⑦", "CK"], boxes: 1, labels: [] });
  });

  it("nhận tại Rêu: R ở cuối; số lẻ nghìn; 0 hộp vẫn là 1", () => {
    expect(boxCode({ seq: 3, collect: 159_000, fulfillment: "pickup", addons: [], units: 0 }).code).toBe("③ T159 R");
    expect(boxCode({ seq: 3, collect: 159_500, fulfillment: "pickup", addons: [], units: 1 }).code).toBe("③ T159,5 R");
    expect(boxCode({ seq: 3, collect: 0, fulfillment: "pickup", addons: [{ name: "Hũ Sốt", qty: 0 }], units: 0 }).boxes).toBe(1);
  });

  it("nhiều loại add-on: +2S1C; quá 12 ký tự → gộp thành tổng; vẫn quá → bỏ add-on", () => {
    const addons = [
      { name: "Hũ Sốt Bơ Tỏi", qty: 2 },
      { name: "Chai Cà phê", qty: 1 },
    ];
    expect(boxCode({ seq: 4, collect: 289_000, fulfillment: "delivery", addons, units: 3 })).toMatchObject({ code: "④ T289 +2S1C", labels: ["1/3", "2/3", "3/3"] });
    expect(boxCode({ seq: 4, collect: 1_289_000, fulfillment: "pickup", addons, units: 3 }).code).toBe("④ T1289 +3 R");
    expect(boxCode({ seq: 51, collect: 1_289_500, fulfillment: "pickup", addons, units: 3 }).code).toBe("(51) T1289,5 R");
    for (const seq of [1, 12, 49, 99]) {
      const c = boxCode({ seq, collect: 2_345_000, fulfillment: "pickup", addons, units: 1 }).code;
      expect([...c].length).toBeLessThanOrEqual(BOX_CODE_MAX); // "(99) T2345 R" = 12
    }
  });
});

describe("oven-lock — khoá lò (§18.1)", () => {
  it("lời nhắn ↔ lý do", () => {
    expect(pauseMessage("Mất điện")).toBe("Quán tạm ngưng nhận đơn — Mất điện. Xin lỗi bạn!");
    expect(pauseMessage(" Lò hỏng! ")).toBe("Quán tạm ngưng nhận đơn — Lò hỏng. Xin lỗi bạn!");
    expect(pauseMessage("")).toBe("Quán tạm ngưng nhận đơn. Xin lỗi bạn!");
    for (const r of [...PAUSE_PRESETS, "Khác"]) expect(pauseReasonOf(pauseMessage(r))).toBe(r);
    expect(pauseReasonOf(pauseMessage(""))).toBe("");
    expect(pauseReasonOf("Lò bảo trì")).toBe("Lò bảo trì");
    expect(pauseReasonOf(null)).toBe("");
  });

  it("lý do huỷ có tiền tố để trang đơn nhận ra", () => {
    expect(pauseCancelReason("Mất điện")).toBe("Quán tạm ngưng: Mất điện");
    expect(pauseCancelOf(pauseCancelReason("Mất điện"))).toBe("Mất điện");
    expect(pauseCancelOf(pauseCancelReason(" "))).toBe("");
    expect(pauseCancelOf("Khách đổi ý")).toBeNull();
    expect(pauseCancelOf(null)).toBeNull();
  });

  it("đơn bị ảnh hưởng = chưa kết thúc", () => {
    expect(isAffected("placed")).toBe(true);
    expect(isAffected("delivering")).toBe(true);
    expect(isAffected("completed")).toBe(false);
    expect(isAffected("cancelled")).toBe(false);
    expect(isAffected("no_show")).toBe(false);
  });
});

describe("feedback — chấm điểm khẩu vị (§18.5)", () => {
  const products = new Map<string, { name: string; kind: Kind }>([
    ["pep", { name: "Pepperoni", kind: "pizza" }],
    ["ribs", { name: "Sườn", kind: "bbq" }],
    ["combo", { name: "Combo", kind: "combo" }],
    ["sauce", { name: "Sốt", kind: "addon" }],
  ]);
  const item = (productId: string, over: Partial<{ isGift: boolean; parentId: number | null; comboChoices: Record<string, string> | null }> = {}) => ({
    productId,
    isGift: false,
    parentId: null,
    comboChoices: null,
    ...over,
  });

  it("món chấm: combo tách pizza + BBQ (pizza trước), bỏ add-on/quà/trùng/không rõ", () => {
    expect(
      ratableItems(
        [
          item("combo", { comboChoices: { bbq: "ribs", pizza: "pep" } }),
          item("pep"),
          item("sauce", { parentId: 1 }),
          item("sauce", { isGift: true }),
          item("sauce"),
          item("ghost"),
        ],
        products,
      ),
    ).toEqual([
      { productId: "pep", name: "Pepperoni", kind: "pizza" },
      { productId: "ribs", name: "Sườn", kind: "bbq" },
    ]);
  });

  it("mở trong 7 ngày khi completed; sửa trong 24 giờ", () => {
    const d = "2026-11-06" as ISODate;
    expect(canRate("completed", d, d)).toBe(true);
    expect(canRate("completed", d, "2026-11-13" as ISODate)).toBe(true);
    expect(canRate("completed", d, "2026-11-14" as ISODate)).toBe(false);
    expect(canRate("delivering", d, d)).toBe(false);
    expect(canEditFeedback(at("10:00"), new Date(at("10:00").getTime() + 24 * 3_600_000))).toBe(true);
    expect(canEditFeedback(at("10:00"), new Date(at("10:00").getTime() + 24 * 3_600_000 + 1))).toBe(false);
  });

  it("làm sạch: chỉ món của đơn, điểm 1–3; chip chỉ cho 😕 & đúng loại; góp ý cắt 300 ký tự", () => {
    const items = ratableItems([item("pep"), item("ribs")], products);
    expect(
      cleanFeedback(
        {
          ratings: { pep: 1, ribs: 2, ghost: 3, sauce: 1 },
          tags: { pep: ["ít dầu", "ít dầu", "cay hơn"], ribs: ["ngọt hơn"] },
          comment: `  ${"a".repeat(400)} `,
        },
        items,
      ),
    ).toEqual({ ratings: { pep: 1, ribs: 2 }, tags: { pep: ["ít dầu"] }, comment: "a".repeat(COMMENT_MAX) });
    expect(cleanFeedback({ ratings: { pep: 4, ribs: 0 }, tags: {}, comment: "" }, items)).toBeNull();
    expect(cleanFeedback({ ratings: { ribs: 1 }, tags: {}, comment: "  " }, items)).toEqual({ ratings: { ribs: 1 }, tags: {}, comment: null });
    expect(cleanFeedback({ ratings: { x: 1 }, tags: {}, comment: "" }, [{ productId: "x", name: "X", kind: "addon" }])).toEqual({
      ratings: { x: 1 },
      tags: {},
      comment: null,
    });
  });

  it("điểm trung bình & nhãn", () => {
    expect(averageScore([])).toBeNull();
    expect(averageScore([3, 2, 2])).toBe(2.3);
    expect(SCORES.map((s) => `${SCORE_EMOJI[s]} ${SCORE_LABEL[s]}`)).toEqual(["😋 Ngon", "🙂 Được", "😕 Chưa hợp"]);
    expect(FEEDBACK_TAGS.bbq).toContain("ngọt hơn");
  });
});

describe("lệnh /khoalo /molo", () => {
  it("đọc lý do (tối đa 80 ký tự)", () => {
    expect(parseBotCommand("/khoalo mất điện cả khu")).toEqual({ kind: "pause", reason: "mất điện cả khu" });
    expect(parseBotCommand("/khoalo@TheHeatBot", "TheHeatBot")).toEqual({ kind: "pause", reason: "" });
    expect(parseBotCommand(`/khoalo ${"x".repeat(100)}`)).toEqual({ kind: "pause", reason: "x".repeat(80) });
    expect(parseBotCommand("/molo")).toEqual({ kind: "resume" });
    expect(parseBotCommand("/molo@KhacBot", "TheHeatBot")).toBeNull();
  });
});
