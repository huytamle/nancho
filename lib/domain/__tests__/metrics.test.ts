import { describe, expect, it } from "vitest";
import { cafeItemCost, cafeUsage, cellNumber, matchCafeItem, matchSales, parsePastedTable, parseSalesSheet } from "@/lib/domain/cafe";
import { parseBotCommand, parsePeriodArg } from "@/lib/domain/expense-command";
import { buildPnl, change, cogsOf, estimateLabor, fillRate, foodCost, isSegment, pct, revenuePerHour, shoppingList, type PnlInput } from "@/lib/domain/metrics";

// M11 (§17.10): chỉ số, P&L theo mảng, kho café (đọc báo cáo Sapo), lệnh /lich /pl.

describe("metrics", () => {
  it("pct, change, revenuePerHour", () => {
    expect(pct(25, 200)).toBe(12.5);
    expect(pct(1, 0)).toBeNull();
    expect(change(110, 100)).toBe(10);
    expect(change(5, 0)).toBeNull();
    expect(revenuePerHour(1_200_000, 480)).toBe(150_000);
    expect(revenuePerHour(1, 0)).toBeNull();
    expect(isSegment("cafe")).toBe(true);
    expect(isSegment("bar")).toBe(false);
  });

  it("food cost = tồn đầu + nhập − tồn cuối", () => {
    expect(cogsOf({ opening: 500_000, purchases: 2_000_000, closing: 700_000 })).toBe(1_800_000);
    expect(foodCost({ opening: 500_000, purchases: 2_000_000, closing: 700_000 }, 6_000_000)).toEqual({ cogs: 1_800_000, pct: 30 });
  });

  it("fillRate & estimateLabor", () => {
    expect(fillRate([{ capPan: 6, capBbq: 4, usedPan: 6, usedBbq: 2 }, { capPan: 6, capBbq: 4, usedPan: 3, usedBbq: 0 }])).toBe(55);
    expect(fillRate([])).toBeNull();
    expect(estimateLabor([{ minutes: 90, hourlyRate: 20_000 }, { minutes: 60, hourlyRate: null }, { minutes: 0, hourlyRate: null }])).toEqual({ amount: 30_000, missingRate: 1 });
  });

  const input: PnlInput = {
    revenue: { pizza: 10_000_000, cafe: 5_000_000 },
    stock: { pizza: { opening: 1_000_000, purchases: 3_000_000, closing: 1_000_000 }, cafe: { opening: 0, purchases: 1_000_000, closing: 500_000 } },
    shrink: { pizza: 100_000, cafe: 0 },
    expenses: { "nl-pizza": 200_000, "nl-cafe": 300_000, "bao-bi": 400_000, "dien-nuoc": 1_000_000, marketing: 500_000, khac: 0 },
    unstockedBills: 100_000,
    labor: 2_000_000,
  };

  it("P&L theo mảng: giá vốn kho + mua ngoài kho, chi phí chung, nhân sự", () => {
    const p = buildPnl(input);
    expect(p.segments).toEqual([
      { segment: "pizza", revenue: 10_000_000, stockCogs: 3_000_000, directCogs: 200_000, cogs: 3_200_000, foodCostPct: 32, gross: 6_800_000, shrink: 100_000 },
      { segment: "cafe", revenue: 5_000_000, stockCogs: 500_000, directCogs: 300_000, cogs: 800_000, foodCostPct: 16, gross: 4_200_000, shrink: 0 },
    ]);
    expect(p.sharedCogs).toBe(500_000);
    expect(p.cogs).toBe(4_500_000);
    expect(p.gross).toBe(10_500_000);
    expect(p.grossPct).toBe(70);
    expect(p.opex).toEqual([
      { category: "dien-nuoc", amount: 1_000_000 },
      { category: "marketing", amount: 500_000 },
    ]);
    expect(p.beforeLabor).toBe(9_000_000);
    expect(p.laborPct).toBe(13.3);
    expect(p.prime).toBe(6_500_000);
    expect(p.primePct).toBe(43.3);
    expect(p.net).toBe(7_000_000);
  });

  it("P&L không có nhân sự (manager) dừng ở lợi nhuận trước nhân sự", () => {
    const p = buildPnl({ ...input, labor: null, expenses: {} });
    expect(p.labor).toBeNull();
    expect(p.laborPct).toBeNull();
    expect(p.prime).toBeNull();
    expect(p.primePct).toBeNull();
    expect(p.net).toBeNull();
    expect(p.beforeLabor).toBe(p.gross);
  });

  it("nhắc đi chợ: dưới mức + lượng cần cho ngày bán, quy ra đơn vị mua", () => {
    const items = [
      { id: "moz", label: "Mozzarella", unit: "g", onHand: 800, parLevel: 2000, purchaseUnit: "kg", purchaseFactor: 1000 },
      { id: "dough", label: "Đế Pan", unit: "đế", onHand: -2, parLevel: 12, purchaseUnit: null, purchaseFactor: null },
      { id: "box", label: "Hộp", unit: "cái", onHand: 100, parLevel: 30, purchaseUnit: "lốc", purchaseFactor: 50 },
      { id: "x", label: "Không mức", unit: "g", onHand: 0, parLevel: null, purchaseUnit: null, purchaseFactor: null },
    ];
    expect(shoppingList(items, new Map([["moz", 500]]), (i) => i.id)).toEqual([
      { label: "Đế Pan", need: 12, unit: "đế", buy: null },
      { label: "Mozzarella", need: 1700, unit: "g", buy: { qty: 2, unit: "kg" } },
    ]);
    expect(shoppingList(items).map((l) => l.label)).toEqual(["Đế Pan", "Mozzarella"]);
  });
});

describe("cafe (Sapo)", () => {
  it("cellNumber đọc số kiểu Việt", () => {
    expect(cellNumber(12)).toBe(12);
    expect(cellNumber(Number.NaN)).toBeNull();
    expect(cellNumber("1.200.000")).toBe(1_200_000);
    expect(cellNumber("1,200,000")).toBe(1_200_000);
    expect(cellNumber("1.234,5")).toBe(1234.5);
    expect(cellNumber("1,5")).toBe(1.5);
    expect(cellNumber("45.000đ")).toBe(45_000);
    expect(cellNumber(" ")).toBeNull();
    expect(cellNumber("abc")).toBeNull();
    expect(cellNumber(null)).toBeNull();
    expect(cellNumber(true)).toBeNull();
  });

  const sheet = [
    ["BÁO CÁO BÁN HÀNG THEO MẶT HÀNG", null],
    ["Từ ngày 13/11/2026 đến 13/11/2026"],
    ["STT", "Mã hàng", "Tên hàng", "ĐVT", "Số lượng bán", "Doanh thu thuần"],
    [1, "SP01", "Flat White", "Ly", 12, "588.000"],
    [2, "SP02", "Cà phê Espresso", "Ly", "3", 105000],
    [3, "SP03", "Flat white ", "Ly", 2, 98000],
    [4, "SP04", "Bánh", "Cái", 0, 0],
    [5, "SP05", "", "Ly", 2, 0],
    [null, null, "Tổng cộng", null, 17, 791000],
  ];

  it("parseSalesSheet: tìm dòng tiêu đề, cộng dồn tên trùng, bỏ dòng tổng/rỗng/0", () => {
    expect(parseSalesSheet(sheet)).toEqual({
      ok: true,
      lines: [
        { name: "Flat White", qty: 14, revenue: 686_000 },
        { name: "Cà phê Espresso", qty: 3, revenue: 105_000 },
      ],
    });
  });

  it("parseSalesSheet: không cột doanh thu; thiếu tiêu đề; không dòng nào", () => {
    expect(parseSalesSheet([["Mặt hàng", "SL"], ["Latte", 2], ["Latte", 1]])).toEqual({ ok: true, lines: [{ name: "Latte", qty: 3, revenue: null }] });
    expect(parseSalesSheet([["Tên hàng", "Số lượng", "Thành tiền"], ["Latte", 2, null], ["Latte", 1, 50000]])).toEqual({ ok: true, lines: [{ name: "Latte", qty: 3, revenue: 50_000 }] });
    expect(parseSalesSheet([["a", "b"], [1, 2]])).toEqual({ ok: false, reason: "no_header" });
    expect(parseSalesSheet([["Tên hàng", "Số lượng"], ["Tổng", 5]])).toEqual({ ok: false, reason: "empty" });
    expect(parseSalesSheet([["Tên hàng", "Số lượng"], [123, 1]])).toEqual({ ok: true, lines: [{ name: "123", qty: 1, revenue: null }] });
  });

  it("parsePastedTable: tab, chấm phẩy, CSV có ngoặc kép", () => {
    expect(parsePastedTable("Tên hàng\tSố lượng\r\nLatte\t2\n\n")).toEqual([["Tên hàng", "Số lượng"], ["Latte", "2"]]);
    expect(parsePastedTable("Tên hàng;Số lượng\nLatte;2")).toEqual([["Tên hàng", "Số lượng"], ["Latte", "2"]]);
    expect(parsePastedTable('Tên hàng,Số lượng\n"Trà ""đào"", cam",2')).toEqual([["Tên hàng", "Số lượng"], ['Trà "đào", cam', "2"]]);
    expect(parsePastedTable("  ")).toEqual([]);
  });

  const items = [
    { id: 1, name: "Flat white", aliases: [], price: 49_000 },
    { id: 2, name: "Espresso", aliases: ["Cà phê Espresso"], price: 35_000 },
  ];
  const recipes = [
    { itemId: 1, ingredientId: "beans", qty: 18 },
    { itemId: 1, ingredientId: "milk", qty: 150 },
    { itemId: 2, ingredientId: "beans", qty: 18 },
  ];

  it("khớp món theo tên/tên Sapo, không dấu & hoa thường; lượng dùng theo định lượng", () => {
    expect(matchCafeItem("FLAT  WHITE", items)?.id).toBe(1);
    expect(matchCafeItem("ca phe espresso", items)?.id).toBe(2);
    expect(matchCafeItem("Latte", items)).toBeNull();
    expect(matchCafeItem("", items)).toBeNull();
    const lines = matchSales(
      [
        { name: "Flat White", qty: 14, revenue: null },
        { name: "Cà phê Espresso", qty: 3, revenue: null },
        { name: "Latte", qty: 5, revenue: null },
      ],
      items,
    );
    expect(lines.map((l) => l.itemId)).toEqual([1, 2, null]);
    expect(cafeUsage(lines, recipes)).toEqual(new Map([["beans", 306], ["milk", 2100]]));
    expect(cafeItemCost(1, recipes, (id) => (id === "beans" ? 400 : 30))).toBe(11_700);
  });
});

describe("lệnh /lich /pl", () => {
  it("parseBotCommand", () => {
    expect(parseBotCommand("/lich")).toEqual({ kind: "schedule", next: false });
    expect(parseBotCommand("/lich tuần sau")).toEqual({ kind: "schedule", next: true });
    expect(parseBotCommand("/lich sau")).toEqual({ kind: "schedule", next: true });
    expect(parseBotCommand("/pl")).toEqual({ kind: "pnl", period: null });
    expect(parseBotCommand("/pl 2026-10")).toEqual({ kind: "pnl", period: "2026-10" });
  });

  it("parsePeriodArg", () => {
    expect(parsePeriodArg("10")).toBe("--10");
    expect(parsePeriodArg("t3")).toBe("--03");
    expect(parsePeriodArg("tháng 3")).toBe("--03");
    expect(parsePeriodArg("10/2026")).toBe("2026-10");
    expect(parsePeriodArg("2026-1")).toBe("2026-01");
    expect(parsePeriodArg("13")).toBeNull();
    expect(parsePeriodArg("2026-13")).toBeNull();
    expect(parsePeriodArg("abc")).toBeNull();
    expect(parsePeriodArg("")).toBeNull();
  });
});
