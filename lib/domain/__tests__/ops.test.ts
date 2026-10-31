import { describe, expect, it } from "vitest";
import { countTotal, normalizeCounts, pettyExpected, registerExpected, varianceLevel } from "@/lib/domain/cash";
import { expenseCode, guessCategory, isExpenseCategory, parseBotCommand, parseExpenseCode, parseQuantity } from "@/lib/domain/expense-command";
import { fold, parseAmount } from "@/lib/domain/money-text";
import { canAssignRoles, canTransitionAs, hasRole, isRole, orderRoles, primaryOrderRole } from "@/lib/domain/roles";

describe("roles", () => {
  it("suy ra vai trò đổi trạng thái đơn", () => {
    expect(orderRoles(["owner", "barista"])).toEqual(["owner"]);
    expect(orderRoles(["manager"])).toEqual(["kitchen"]);
    expect(orderRoles(["kitchen", "manager", "shipper"])).toEqual(["kitchen", "shipper"]);
    expect(orderRoles(["server", "barista"])).toEqual([]);
    expect(primaryOrderRole(["shipper", "kitchen"])).toBe("kitchen");
    expect(primaryOrderRole(["barista"])).toBeNull();
    expect(hasRole(["barista"], ["owner", "manager"])).toBe(false);
    expect(hasRole(["barista", "manager"], ["owner", "manager"])).toBe(true);
    expect(isRole("barista")).toBe(true);
    expect(isRole("chef")).toBe(false);
  });

  it("kiêm bếp + giao: được cả bước của bếp lẫn shipper", () => {
    const ctx = { fulfillment: "delivery" as const, now: new Date(0), cutoffAt: new Date(1) };
    expect(canTransitionAs(["kitchen", "shipper"], "ready", "delivering", ctx).ok).toBe(true);
    expect(canTransitionAs(["kitchen", "shipper"], "confirmed", "baking", ctx).ok).toBe(true);
    expect(canTransitionAs(["kitchen"], "ready", "delivering", ctx)).toEqual({ ok: false, reason: "forbidden" });
    expect(canTransitionAs([], "ready", "delivering", ctx)).toEqual({ ok: false, reason: "forbidden" });
    expect(canTransitionAs(["kitchen", "shipper"], "completed", "baking", ctx)).toEqual({ ok: false, reason: "invalid_transition" });
  });

  it("phân công: owner đổi mọi người trừ tự bỏ owner; manager không đụng owner/manager", () => {
    const owner = { id: 1, roles: ["owner"] as const };
    const mgr = { id: 2, roles: ["manager", "barista"] as const };
    const staff = { id: 3, roles: ["server"] as const };
    expect(canAssignRoles(owner, staff, ["server", "barista"])).toBe(true);
    expect(canAssignRoles(owner, staff, ["manager"])).toBe(true);
    expect(canAssignRoles(owner, owner, ["kitchen"])).toBe(false);
    expect(canAssignRoles(owner, owner, ["owner", "kitchen"])).toBe(true);
    expect(canAssignRoles(owner, staff, [])).toBe(false);
    expect(canAssignRoles(mgr, staff, ["server", "kitchen"])).toBe(true);
    expect(canAssignRoles(mgr, staff, ["manager"])).toBe(false);
    expect(canAssignRoles(mgr, mgr, ["manager", "kitchen"])).toBe(true);
    expect(canAssignRoles(mgr, mgr, ["kitchen"])).toBe(false);
    expect(canAssignRoles(mgr, owner, ["owner", "kitchen"])).toBe(true);
    expect(canAssignRoles(mgr, owner, ["kitchen"])).toBe(false);
    expect(canAssignRoles(staff, staff, ["server", "barista"])).toBe(false);
  });
});

describe("cash", () => {
  it("cộng tổng theo mệnh giá", () => {
    const c = normalizeCounts({ "500000": 2, "200000": 1, "10000": 3, "500": 4, "1000": 0 });
    expect(c).toEqual({ "500000": 2, "200000": 1, "10000": 3, "500": 4 });
    expect(countTotal(c!)).toBe(1_232_000);
    expect(countTotal({})).toBe(0);
  });

  it("từ chối mệnh giá lạ, số âm, số lẻ, quá lớn", () => {
    expect(normalizeCounts({ "300000": 1 })).toBeNull();
    expect(normalizeCounts({ "500000": -1 })).toBeNull();
    expect(normalizeCounts({ "500000": 1.5 })).toBeNull();
    expect(normalizeCounts({ "500000": "2" })).toBeNull();
    expect(normalizeCounts({ "500000": 10_001 })).toBeNull();
  });

  it("két đáng có và mức lệch", () => {
    expect(registerExpected({ opening: 1_000_000, cafeCash: 2_350_000, codCollected: 458_000, drops: 2_000_000 })).toBe(1_808_000);
    expect(varianceLevel(0, 20_000)).toBe("ok");
    expect(varianceLevel(-20_000, 20_000)).toBe("minor");
    expect(varianceLevel(21_000, 20_000)).toBe("major");
    expect(pettyExpected(1_000_000, 350_000)).toBe(650_000);
  });
});

describe("money-text", () => {
  it.each([
    ["150k", 150_000],
    ["150 K", 150_000],
    ["1.5k", 1_500],
    ["150n", 150_000],
    ["150 nghìn", 150_000],
    ["200 ngàn", 200_000],
    ["1tr", 1_000_000],
    ["1tr2", 1_200_000],
    ["1tr25", 1_250_000],
    ["1tr05", 1_050_000],
    ["1tr250", 1_250_000],
    ["1,2tr", 1_200_000],
    ["1.2tr", 1_200_000],
    ["2 triệu", 2_000_000],
    ["3m", 3_000_000],
    ["1.200.000", 1_200_000],
    ["1,200,000", 1_200_000],
    ["1.200.000đ", 1_200_000],
    ["85.000 vnd", 85_000],
    ["85000", 85_000],
    ["150", 150_000],
    ["50000đồng", 50_000],
  ])("%s → %d", (raw, want) => {
    expect(parseAmount(raw)).toBe(want);
  });

  it.each(["", "abc", "0", "0k", "1,2tr5", "1.20.000", "200tr", "12-000", "k"])("%s → null", (raw) => {
    expect(parseAmount(raw)).toBeNull();
  });

  it("bỏ dấu", () => {
    expect(fold("Phô Mai Đà Lạt")).toBe("pho mai da lat");
  });
});

describe("expense-command", () => {
  it("/chi mặc định hộp chi, đoán nhóm", () => {
    expect(parseBotCommand("/chi 150k đá viên")).toEqual({
      kind: "expense",
      amount: 150_000,
      description: "đá viên",
      source: "petty",
      category: "nl-cafe",
      quantity: null,
    });
  });

  it("tiền túi, số lượng, số tiền đứng sau mô tả", () => {
    expect(parseBotCommand("/chi phô mai 5kg 1tr2 #túi")).toMatchObject({
      amount: 1_200_000,
      description: "phô mai 5kg",
      source: "pocket",
      category: "nl-pizza",
      quantity: { value: 5000, unit: "g" },
    });
    expect(parseBotCommand("/chi 2 bao bột 500k")).toMatchObject({ amount: 500_000, description: "2 bao bột", quantity: { value: 2, unit: "bao" } });
    expect(parseBotCommand("/chi 150 k nước rửa chén")).toMatchObject({ amount: 150_000, description: "nước rửa chén", category: "ve-sinh" });
  });

  it("chuyển khoản, tên bot trong nhóm", () => {
    expect(parseBotCommand("/chi@TheHeatBot 320.000 gas #ck", "theheatbot")).toMatchObject({ amount: 320_000, source: "bank", category: "dien-nuoc" });
    expect(parseBotCommand("/chi@OtherBot 320.000 gas", "theheatbot")).toBeNull();
    expect(parseBotCommand("/chi@TheHeatBot 10k ly", undefined)).toMatchObject({ category: "bao-bi" });
  });

  it("lỗi cú pháp", () => {
    expect(parseBotCommand("/chi đá viên")).toEqual({ kind: "invalid", reason: "amount" });
    expect(parseBotCommand("/chi 150k")).toEqual({ kind: "invalid", reason: "description" });
    expect(parseBotCommand("/chi")).toEqual({ kind: "invalid", reason: "amount" });
    expect(parseBotCommand("/chihuy abc")).toEqual({ kind: "invalid", reason: "code" });
  });

  it("các lệnh khác", () => {
    expect(parseBotCommand("/chihuy C123")).toEqual({ kind: "cancel", id: 123 });
    expect(parseBotCommand("/chihuy 7")).toEqual({ kind: "cancel", id: 7 });
    expect(parseBotCommand("/tonghop")).toEqual({ kind: "summary" });
    expect(parseBotCommand("/start abcDEF_-1")).toEqual({ kind: "link", token: "abcDEF_-1" });
    expect(parseBotCommand("/start")).toEqual({ kind: "help" });
    expect(parseBotCommand("/help")).toEqual({ kind: "help" });
    expect(parseBotCommand("/menu")).toBeNull();
    expect(parseBotCommand("chi 150k đá")).toBeNull();
  });

  it("nhóm, số lượng, mã chứng từ", () => {
    expect(guessCategory("Sửa máy xay")).toBe("sua-chua");
    expect(guessCategory("in tờ rơi")).toBe("marketing");
    expect(guessCategory("Tiền điện tháng 10")).toBe("dien-nuoc");
    expect(guessCategory("hộp pizza 50 cái")).toBe("bao-bi");
    expect(guessCategory("gửi xe")).toBe("khac");
    expect(isExpenseCategory("khac")).toBe(true);
    expect(isExpenseCategory("xyz")).toBe(false);
    expect(parseQuantity("sữa 2 lít")).toEqual({ value: 2000, unit: "ml" });
    expect(parseQuantity("men 500gr")).toEqual({ value: 500, unit: "g" });
    expect(parseQuantity("đá viên")).toBeNull();
    expect(expenseCode(42)).toBe("C42");
    expect(parseExpenseCode("c42")).toBe(42);
    expect(parseExpenseCode("x")).toBeNull();
  });
});
