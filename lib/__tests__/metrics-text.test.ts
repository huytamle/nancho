import { describe, expect, it } from "vitest";
import { buildPnl } from "@/lib/domain/metrics";
import { dayReportText, eveningReportText, feedbackDigestText, marketText, pnlText, scheduleText } from "@/lib/metrics-text";
import type { ISODate } from "@/lib/domain/time";

const D = (s: string) => s as ISODate;

describe("metrics-text (M11)", () => {
  it("báo cáo tối pizza", () => {
    const text = eveningReportText({
      date: D("2026-11-13"),
      orders: 10,
      revenue: 3_200_000,
      transferPaid: 2_000_000,
      cod: 1_200_000,
      collected: 3_000_000,
      cancelled: 1,
      noShow: 1,
      handover: { expected: 1_000_000, received: 980_000, pending: 200_000 },
      taste: { count: 4, avg: 2.5, low: ["BBQ"] },
      stockA: [{ label: "Đế Pan", onHand: 4, unit: "đế" }],
      next: D("2026-11-14"),
      shopping: [{ label: "Mozzarella", need: 1500, unit: "g", buy: { qty: 2, unit: "kg" } }],
    });
    expect(text).toContain("🍕 Báo cáo tối pizza · T6 13/11");
    expect(text).toContain("Doanh thu: 3.200.000đ · 10 đơn");
    expect(text).toContain("Huỷ 1 · bom 1");
    expect(text).toContain("Bàn giao COD: nhận 980.000đ/1.000.000đ (−20.000đ ⚠) · còn chưa giao 200.000đ");
    expect(text).toContain("Khẩu vị: 4 lượt · TB 2,5/3 · cần xem: BBQ");
    expect(text).toContain("Tồn nhóm A: Đế Pan 4 đế");
    expect(text).toContain("🛒 Cần đặt cho T7 14/11:\n• Mozzarella: thiếu 1.500 g → mua 2 kg");
    const quiet = eveningReportText({
      date: D("2026-11-13"),
      orders: 0,
      revenue: 0,
      transferPaid: 0,
      cod: 0,
      collected: 0,
      cancelled: 0,
      noShow: 0,
      handover: { expected: 0, received: 0, pending: 0 },
      taste: { count: 0, avg: null, low: [] },
      stockA: [],
      next: null,
      shopping: [],
    });
    expect(quiet).toContain("chưa có lượt chấm");
    expect(quiet).toContain("✅ Kho đủ mức tối thiểu.");
    expect(quiet).not.toContain("Bàn giao");
  });

  it("báo cáo cả ngày", () => {
    const text = dayReportText({
      date: D("2026-11-13"),
      cafe: { cash: 1_000_000, transfer: 500_000, other: 0 },
      pizza: 2_000_000,
      shifts: [
        { by: "Lan", counted: 1_500_000, expected: 1_500_000 },
        { by: "Vy", counted: 1_450_000, expected: 1_500_000 },
      ],
      petty: { counted: 990_000, expected: 1_000_000 },
      checklists: [{ title: "Đóng ca", done: 5, total: 6, photos: 1 }],
      quick: [
        { label: "Sữa tươi", diffPct: -12.5, over: true },
        { label: "Hạt", diffPct: 0, over: false },
      ],
      expenses: { total: 150_000, count: 2 },
      tolerance: 20_000,
    });
    expect(text).toContain("Doanh thu: 3.500.000đ (café 1.500.000đ · pizza 2.000.000đ)");
    expect(text).toContain("Két (Lan): khớp ✅");
    expect(text).toContain("Két (Vy): lệch −50.000đ ⚠");
    expect(text).toContain("Hộp chi: lệch −10.000đ");
    expect(text).toContain("Đóng ca 5/6 (📷 1) ⚠");
    expect(text).toContain("Kiểm nhanh: 1/2 món lệch ⚠ — Sữa tươi -12.5%");
    expect(text).toContain("Chi trong ngày: 150.000đ · 2 chứng từ");
    const none = dayReportText({
      date: D("2026-11-13"),
      cafe: { cash: 0, transfer: 0, other: 10_000 },
      pizza: 0,
      shifts: [],
      petty: { counted: 1, expected: 1 },
      checklists: [],
      quick: [{ label: "Hạt", diffPct: null, over: false }],
      expenses: { total: 0, count: 0 },
      tolerance: 20_000,
    });
    expect(none).toContain("khác 10.000đ");
    expect(none).toContain("Hộp chi: khớp ✅");
    expect(none).toContain("Kiểm nhanh: 1 món khớp ✅");
    expect(dayReportText({ ...{ date: D("2026-11-13"), cafe: { cash: 0, transfer: 0, other: 0 }, pizza: 0, shifts: [], petty: null, checklists: [], quick: [], expenses: { total: 0, count: 0 }, tolerance: 0 } })).toContain(
      "Kiểm nhanh: chưa làm",
    );
  });

  it("/lich, /pl, đi chợ, góp ý tuần", () => {
    expect(scheduleText("tuần này", [{ date: D("2026-11-09"), slots: [{ name: "Lan", start: "16:00", end: "22:00" }] }, { date: D("2026-11-10"), slots: [] }])).toBe(
      "🗓 Lịch ca tuần này\nT2 09/11: Lan 16:00–22:00\nT3 10/11: —",
    );
    expect(scheduleText("tuần sau", [{ date: D("2026-11-16"), slots: [] }])).toContain("Chưa xếp lịch");

    const p = buildPnl({
      revenue: { pizza: 1_000_000, cafe: 0 },
      stock: { pizza: { opening: 0, purchases: 300_000, closing: 0 }, cafe: { opening: 0, purchases: 0, closing: 0 } },
      shrink: { pizza: 0, cafe: 0 },
      expenses: { "dien-nuoc": 100_000, "bao-bi": 50_000 },
      unstockedBills: 0,
      labor: 200_000,
    });
    const pl = pnlText("11/2026", p);
    expect(pl).toContain("• Pizza: 1.000.000đ − giá vốn 300.000đ (30%) = 700.000đ");
    expect(pl).toContain("• Café: 0đ − giá vốn 0đ (—) = 0đ");
    expect(pl).toContain("Bao bì & hàng nợ chưa nhập kho: 50.000đ");
    expect(pl).toContain("Chi phí vận hành: 100.000đ — Gas/điện/nước 100.000đ");
    expect(pl).toContain("Nhân sự: 200.000đ (20%)");
    expect(pl).toContain("Lợi nhuận: 350.000đ");
    expect(pnlText("11/2026", { ...p, labor: null })).toContain("Lợi nhuận trước nhân sự: 550.000đ");

    expect(marketText(D("2026-11-13"), [{ label: "Hộp", need: 20, unit: "cái", buy: null }])).toBe("🛒 Đi chợ trước ngày bán T6 13/11:\n• Hộp: thiếu 20 cái");

    const items = [
      { date: D("2026-11-13"), product: "BBQ", score: 1 as const, tags: ["ngọt hơn"], comment: "hơi khô" },
      { date: D("2026-11-13"), product: "Pepperoni", score: 3 as const, tags: [], comment: null },
    ];
    const raw = feedbackDigestText("T2 09/11–CN 15/11", 1, items, null);
    expect(raw).toContain("💬 Góp ý tuần T2 09/11–CN 15/11 · 1 lượt");
    expect(raw).toContain("Điểm: BBQ 1/3 (1) · Pepperoni 3/3 (1)");
    expect(raw).toContain("😕 BBQ [ngọt hơn]: hơi khô");
    expect(raw).not.toContain("😋 Pepperoni");
    const ai = feedbackDigestText("x", 1, items, "• Khách khen Pepperoni");
    expect(ai).toContain("• Khách khen Pepperoni");
    expect(ai).not.toContain("hơi khô");
  });
});
