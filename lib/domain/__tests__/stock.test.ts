import { describe, expect, it } from "vitest";
import { seedProducts, seedRecipes } from "@/data/seed";
import { parseBotCommand } from "@/lib/domain/expense-command";
import {
  allocatePayment,
  countLine,
  expiryOf,
  fifoLots,
  margin,
  matchIngredient,
  matchSupplier,
  parseBillLine,
  parseDebt,
  production,
  productCost,
  productionUnitCost,
  quickCountItems,
  saleUsage,
  splitBillCost,
  stockFlags,
  toBaseQty,
  unitCostResolver,
  valueOf,
  weightedAverage,
  type StockItem,
} from "@/lib/domain/stock";
import { orders as appendixB } from "@/lib/domain/__tests__/fixtures";
import { buildPrepReport } from "@/lib/domain/prep";
import { batches, DATE } from "@/lib/domain/__tests__/fixtures";
import { seedIngredients, seedPickupPoints, seedRoutes, seedZones } from "@/data/seed";

const item = (over: Partial<StockItem> & Pick<StockItem, "id">): StockItem => ({
  label: over.id,
  unit: "g",
  level: "raw",
  trackStock: true,
  purchaseUnit: null,
  purchaseFactor: null,
  avgCost: 0,
  shelfLifeHours: null,
  parLevel: null,
  aliases: [],
  countClass: "C",
  countRoles: ["kitchen"],
  countTolerancePct: 5,
  ...over,
});

const H = 3_600_000;
const T0 = new Date("2026-11-06T03:00:00Z");
const at = (h: number) => new Date(T0.getTime() + h * H);

describe("giá vốn bình quân gia quyền", () => {
  it("tồn 0 → lấy giá mới; có tồn → bình quân", () => {
    expect(weightedAverage(0, 0, 5000, 240)).toBe(240);
    expect(weightedAverage(-20, 300, 100, 250)).toBe(250);
    // 5 kg × 240 + 5 kg × 260 → 250 đ/g
    expect(weightedAverage(5000, 240, 5000, 260)).toBe(250);
    expect(weightedAverage(3, 10, 0, 999)).toBe(10);
  });
  it("thùng 24 lon 240.000đ = 10.000đ/lon", () => {
    const pepsi = item({ id: "pepsi", unit: "lon", purchaseUnit: "thùng", purchaseFactor: 24 });
    const qty = toBaseQty({ value: 1, unit: "thung" }, pepsi)!;
    expect(qty).toBe(24);
    expect(weightedAverage(0, 0, qty, 240_000 / qty)).toBe(10_000);
    expect(valueOf(3, 10_000)).toBe(30_000);
  });
});

describe("đổi đơn vị", () => {
  const flour = item({ id: "flour", purchaseUnit: "bao", purchaseFactor: 25_000 });
  it("đơn vị gốc, đơn vị mua, không đơn vị", () => {
    expect(toBaseQty({ value: 5000, unit: "g" }, flour)).toBe(5000);
    expect(toBaseQty({ value: 2, unit: "bao" }, flour)).toBe(50_000);
    expect(toBaseQty({ value: 7, unit: "" }, flour)).toBe(7);
  });
  it("không đổi được → null", () => {
    expect(toBaseQty({ value: 2, unit: "thung" }, flour)).toBeNull();
    expect(toBaseQty({ value: 0, unit: "g" }, flour)).toBeNull();
    expect(toBaseQty({ value: 2, unit: "bao" }, item({ id: "x" }))).toBeNull();
  });
});

describe("khớp nguyên liệu", () => {
  const items = [
    item({ id: "mozzarella", label: "Mozzarella", aliases: ["pho mai", "phô mai mozzarella"] }),
    item({ id: "cheddar", label: "Cheddar", aliases: ["pho mai cheddar"] }),
    item({ id: "pepsi", label: "Pepsi", aliases: [] }),
  ];
  it("khớp nguyên từ, không dấu, cụm dài nhất thắng", () => {
    expect(matchIngredient("phô mai 5kg", items)?.id).toBe("mozzarella");
    expect(matchIngredient("Phô mai cheddar 2kg", items)?.id).toBe("cheddar");
    expect(matchIngredient("2 thùng PEPSI", items)?.id).toBe("pepsi");
    expect(matchIngredient("pepsico", items)).toBeNull();
    expect(matchIngredient("đá viên", items)).toBeNull();
  });
  it("NCC theo tên hoặc alias", () => {
    const s = [{ name: "Cô Nhiều", aliases: ["co nhieu tap hoa"] }];
    expect(matchSupplier("cô  nhiều", s)?.name).toBe("Cô Nhiều");
    expect(matchSupplier("Co Nhieu tap hoa", s)?.name).toBe("Cô Nhiều");
    expect(matchSupplier("Chú Ba", s)).toBeNull();
  });
});

describe("sản xuất (mức 2)", () => {
  const dough = { outputId: "pan-dough", outputQty: 6, lines: [{ ingredientId: "flour", qty: 1500 }, { ingredientId: "yeast", qty: 15 }] };
  it("2 mẻ bột → trừ nguyên liệu, cộng 12 đế", () => {
    expect(production(dough, 2)).toEqual({
      output: { ingredientId: "pan-dough", qty: 12 },
      inputs: [{ ingredientId: "flour", qty: 3000 }, { ingredientId: "yeast", qty: 30 }],
    });
  });
  it("đơn giá đế = Σ nguyên liệu / 6", () => {
    const cost = (id: string) => ({ flour: 20, yeast: 200 })[id] ?? 0;
    expect(productionUnitCost(dough, cost)).toBe(5500);
    expect(productionUnitCost({ ...dough, outputQty: 0 }, cost)).toBe(0);
  });
  it("giá vốn qua công thức, chống vòng lặp", () => {
    const items = [item({ id: "flour", avgCost: 20 }), item({ id: "yeast", avgCost: 200 }), item({ id: "pan-dough", avgCost: 9999 })];
    const loop = { outputId: "flour", outputQty: 1, lines: [{ ingredientId: "pan-dough", qty: 1 }] };
    const costOf = unitCostResolver(items, [dough]);
    expect(costOf("pan-dough")).toBe(5500);
    expect(costOf("pan-dough")).toBe(5500); // memo
    expect(costOf("unknown")).toBe(0);
    const looped = unitCostResolver(items, [dough, loop]);
    expect(Number.isFinite(looped("pan-dough"))).toBe(true);
  });
});

describe("giá vốn & biên lợi nhuận theo món", () => {
  const costs: Record<string, number> = {
    "pan-dough": 6000,
    mozzarella: 250,
    pepperoni: 400,
    "garlic-butter-base": 100,
    "pink-ginger": 1000,
    "pizza-box": 5000,
    "ribs-bag": 60_000,
    "bbq2-bag": 40_000,
    "bbq-tray": 3000,
  };
  const costOf = (id: string) => costs[id] ?? 0;
  const p = (id: string) => seedProducts.find((x) => x.id === id)!;
  it("pizza = Σ định lượng × giá vốn", () => {
    // 6000 + 180×250 + 60×400 + 1000 + 5000
    expect(productCost(p("pepperoni-pan"), seedRecipes, costOf)).toBe(81_000);
  });
  it("combo lấy lựa chọn đắt nhất mỗi nhóm", () => {
    // Pepperoni 81.000 (> Bơ tỏi 61.000) + Sườn 64.000 (> BBQ#2 44.000)
    expect(productCost(p("combo-doi"), seedRecipes, costOf)).toBe(145_000);
  });
  it("Pepsi 15.000 − 10.000 − ly/đá/ống hút 1.000 = 4.000đ (26,7%)", () => {
    expect(margin(15_000, 11_000)).toEqual({ gross: 4000, pct: 26.7 });
    expect(margin(0, 100)).toEqual({ gross: -100, pct: 0 });
  });
});

describe("trừ kho khi bán = Bảng Tổng Hợp Chuẩn Bị", () => {
  it("Phụ lục B: lượng trừ khớp từng dòng nguyên liệu", () => {
    const live = appendixB.filter((o) => o.status !== "cancelled");
    const usage = saleUsage(live, seedProducts, seedRecipes);
    const prep = buildPrepReport({
      date: DATE,
      now: at(0),
      orders: appendixB,
      products: seedProducts,
      recipes: seedRecipes,
      ingredients: seedIngredients,
      batches,
      zones: seedZones,
      routes: seedRoutes,
      points: seedPickupPoints,
    });
    expect(Object.fromEntries(usage)).toEqual(Object.fromEntries(prep.totals.ingredients.map((i) => [i.ingredientId, i.qty])));
  });
});

describe("lô FIFO & cờ tồn", () => {
  const moves = [
    { qty: 6, expiresAt: at(48), createdAt: at(0) },
    { qty: 6, expiresAt: at(72), createdAt: at(24) },
    { qty: -8, expiresAt: null, createdAt: at(30) },
  ];
  it("xuất trừ lô cũ trước", () => {
    expect(fifoLots(moves)).toEqual([{ qty: 4, expiresAt: at(72) }]);
    expect(fifoLots([{ qty: -3, expiresAt: null, createdAt: at(0) }])).toEqual([]);
  });
  it("dưới mức, sắp hết hạn, hết hạn, âm", () => {
    const lots = fifoLots(moves);
    expect(stockFlags(4, { parLevel: 6 }, lots, at(30))).toEqual(["below_par"]);
    expect(stockFlags(4, { parLevel: null }, lots, at(60))).toEqual(["expiring"]);
    expect(stockFlags(4, { parLevel: 2 }, lots, at(80))).toEqual(["expired"]);
    expect(stockFlags(-1, { parLevel: null }, [], at(0))).toEqual(["negative"]);
  });
  it("hạn dùng lô mới", () => {
    expect(expiryOf({ shelfLifeHours: 48 }, at(0))).toEqual(at(48));
    expect(expiryOf({ shelfLifeHours: null }, at(0))).toBeNull();
  });
});

describe("kiểm nhanh ABC", () => {
  const items = [
    item({ id: "moz", label: "Mozzarella", countClass: "A" }),
    item({ id: "ribs", label: "Sườn", countClass: "A" }),
    item({ id: "milk", label: "Sữa tươi", countClass: "A", countRoles: ["barista"] }),
    item({ id: "b1", label: "B1", countClass: "B" }),
    item({ id: "b2", label: "B2", countClass: "B" }),
    item({ id: "b3", label: "B3", countClass: "B" }),
    item({ id: "b4", label: "B4", countClass: "B" }),
    item({ id: "c1", label: "C1", countClass: "C" }),
    item({ id: "off", label: "Off", countClass: "A", trackStock: false }),
  ];
  it("A mỗi ca + 3 mục B lâu chưa đếm nhất, theo vai trò", () => {
    const last = new Map([
      ["b1", at(5)],
      ["b2", at(1)],
      ["b4", at(3)],
    ]);
    expect(quickCountItems(items, last, ["kitchen"]).map((i) => i.id)).toEqual(["moz", "ribs", "b3", "b2", "b4"]);
    expect(quickCountItems(items, last, ["barista"]).map((i) => i.id)).toEqual(["milk"]);
    expect(quickCountItems(items, new Map(), ["manager"]).map((i) => i.id)).toEqual(["moz", "ribs", "milk", "b1", "b2", "b3"]);
  });
  it("lệch & ngưỡng %", () => {
    expect(countLine("moz", 1000, 950, 3, 250)).toEqual({ ingredientId: "moz", book: 1000, counted: 950, diff: -50, pct: -5, value: -12_500, over: true });
    expect(countLine("moz", 1000, 980, 3, 250).over).toBe(false);
    expect(countLine("moz", 0, 2, 3, 10)).toMatchObject({ pct: null, over: true });
    expect(countLine("moz", 0, 0, 3, 10)).toMatchObject({ diff: 0, over: false });
  });
});

describe("công nợ nhà cung cấp", () => {
  it("đọc /no", () => {
    expect(parseBotCommand("/no Cô Nhiều 3 thùng sting, 2 thùng pepsi 480k")).toEqual({
      kind: "debt",
      supplier: "Cô Nhiều",
      lines: [
        { text: "sting", qty: 3, unit: "thung", amount: null },
        { text: "pepsi", qty: 2, unit: "thung", amount: null },
      ],
      amount: 480_000,
    });
    expect(parseDebt("Chú Ba 5kg mozzarella 1tr2, 2 bao bột 700k")).toEqual({
      supplier: "Chú Ba",
      lines: [
        { text: "mozzarella", qty: 5000, unit: "g", amount: 1_200_000 },
        { text: "bột", qty: 2, unit: "bao", amount: 700_000 },
      ],
      amount: 1_900_000,
    });
    expect(parseDebt("Cô Nhiều 3 thùng sting")).toEqual({ supplier: "Cô Nhiều", lines: [{ text: "sting", qty: 3, unit: "thung", amount: null }], amount: null });
    expect(parseDebt("Cô Nhiều 2 l sữa, 5 hộp kem 150k, 1 gói đường")?.amount).toBeNull();
    expect(parseDebt("Cô Nhiều 2 l sữa")?.lines[0]).toMatchObject({ qty: 2000, unit: "ml" });
    expect(parseDebt("Cô Nhiều 500 gram men")?.lines[0]).toMatchObject({ qty: 500, unit: "g" });
    expect(parseDebt("Cô Nhiều 3 sting")?.lines[0]).toEqual({ text: "sting", qty: 3, unit: "", amount: null });
    expect(parseBotCommand("/no Cô Nhiều")).toEqual({ kind: "invalid", reason: "debt" });
    expect(parseBotCommand("/no 3 thùng sting")).toEqual({ kind: "invalid", reason: "debt" });
    expect(parseDebt("Cô Nhiều 3 thùng, 2")).toBeNull();
  });
  it("dòng không có số lượng", () => {
    expect(parseBillLine("đá viên 50k")).toEqual({ text: "đá viên", qty: null, unit: "", amount: 50_000 });
    expect(parseBillLine("   ")).toBeNull();
  });
  it("đọc /trano, /congno", () => {
    expect(parseBotCommand("/trano Cô Nhiều 480k #ck")).toEqual({ kind: "pay_debt", supplier: "Cô Nhiều", amount: 480_000, source: "bank" });
    expect(parseBotCommand("/trano Cô Nhiều 480k")).toMatchObject({ source: "petty" });
    expect(parseBotCommand("/trano 480k")).toEqual({ kind: "invalid", reason: "pay_debt" });
    expect(parseBotCommand("/trano Cô Nhiều")).toEqual({ kind: "invalid", reason: "pay_debt" });
    expect(parseBotCommand("/congno")).toEqual({ kind: "debts" });
  });
  it("trả nợ: phiếu cũ trước, thiếu giữ mở, thừa báo lại, phiếu chưa giá nhận phần còn lại", () => {
    const bills = [
      { id: 1, amount: 300_000, paidAmount: 100_000 },
      { id: 2, amount: 0, paidAmount: 0 },
      { id: 3, amount: 500_000, paidAmount: 0 },
      { id: 4, amount: null, paidAmount: 0 },
    ];
    expect(allocatePayment(bills, 450_000)).toEqual({
      applied: [
        { id: 1, pay: 200_000, close: true },
        { id: 3, pay: 250_000, close: false },
      ],
      leftover: 0,
    });
    expect(allocatePayment(bills, 900_000)).toEqual({
      applied: [
        { id: 1, pay: 200_000, close: true },
        { id: 3, pay: 500_000, close: true },
        { id: 4, pay: 200_000, close: true, setAmount: 200_000 },
      ],
      leftover: 0,
    });
    expect(allocatePayment([{ id: 1, amount: 100, paidAmount: 0 }], 150)).toEqual({ applied: [{ id: 1, pay: 100, close: true }], leftover: 50 });
  });
  it("chia tiền phiếu cho dòng nhập kho", () => {
    // 3 thùng sting + 2 thùng pepsi = 480k; giá vốn hiện tại sting 9.000/lon, pepsi 10.000/lon.
    expect(splitBillCost([{ qty: 72, amount: null, weight: 72 * 9000 }, { qty: 48, amount: null, weight: 48 * 10_000 }], 480_000)).toEqual([275_745, 204_255]);
    expect(splitBillCost([{ qty: 72, amount: null, weight: 0 }, { qty: 48, amount: null, weight: 0 }], 480_000)).toEqual([288_000, 192_000]);
    expect(splitBillCost([{ qty: 1, amount: 100, weight: 0 }, { qty: 1, amount: null, weight: 0 }], 300)).toEqual([100, 200]);
    expect(splitBillCost([{ qty: 1, amount: 100, weight: 0 }], 999)).toEqual([100]);
    expect(splitBillCost([{ qty: 1, amount: null, weight: 0 }], null)).toEqual([null]);
  });
});
