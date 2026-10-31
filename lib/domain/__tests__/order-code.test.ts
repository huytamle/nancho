import { describe, expect, it } from "vitest";
import { matchTransferMemo, orderCode, transferMemo } from "@/lib/domain/order-code";

const NOW = new Date("2026-11-06T05:00:00Z"); // 12:00 giờ VN

describe("orderCode / transferMemo", () => {
  it("định dạng", () => {
    expect(orderCode("2026-11-06", 12)).toBe("TH-0611-12");
    expect(orderCode("2026-11-06", 3)).toBe("TH-0611-03");
    expect(orderCode("2026-11-06", 123)).toBe("TH-0611-123");
    expect(transferMemo("2026-11-06", 12)).toBe("TH061112");
  });
});

describe("matchTransferMemo", () => {
  it("tìm mã trong nội dung ngân hàng", () => {
    expect(matchTransferMemo("TH061112", NOW)).toEqual({ serviceDate: "2026-11-06", seq: 12 });
    expect(matchTransferMemo("MBVCB.123456.TH061112.CT tu 0123", NOW)).toEqual({ serviceDate: "2026-11-06", seq: 12 });
    expect(matchTransferMemo("th0711105 chuyen tien", NOW)).toEqual({ serviceDate: "2026-11-07", seq: 105 });
  });

  it("không ăn nhầm số tham chiếu dính liền", () => {
    expect(matchTransferMemo("TH0611121234", NOW)).toBeNull();
    expect(matchTransferMemo("TH06111", NOW)).toBeNull();
    expect(matchTransferMemo("chuyen tien pizza", NOW)).toBeNull();
  });

  it("ngày phục vụ trong ±7 ngày, kể cả vắt qua năm", () => {
    expect(matchTransferMemo("TH301001", NOW)).toEqual({ serviceDate: "2026-10-30", seq: 1 });
    expect(matchTransferMemo("TH131101", NOW)).toEqual({ serviceDate: "2026-11-13", seq: 1 });
    expect(matchTransferMemo("TH141101", NOW)).toBeNull();
    expect(matchTransferMemo("TH020101", new Date("2026-12-30T05:00:00Z"))).toEqual({
      serviceDate: "2027-01-02",
      seq: 1,
    });
  });
});
