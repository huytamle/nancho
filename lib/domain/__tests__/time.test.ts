import { describe, expect, it } from "vitest";
import {
  addDays,
  formatRemaining,
  isISODate,
  parseVnLocal,
  toVnLocal,
  vnDateOf,
  vnDayLabel,
  vnInstant,
  vnTimeLabel,
  vnWeekday,
} from "@/lib/domain/time";

describe("vnInstant", () => {
  it("hiểu giờ theo +07:00, không theo múi giờ server", () => {
    expect(vnInstant("2026-11-06", "18:00").toISOString()).toBe("2026-11-06T11:00:00.000Z");
  });

  it("sáng sớm giờ VN vẫn là ngày hôm trước theo UTC", () => {
    expect(vnInstant("2026-11-06", "06:30").toISOString()).toBe("2026-11-05T23:30:00.000Z");
  });
});

describe("vnDateOf / vnTimeLabel", () => {
  it("qua nửa đêm UTC nhưng vẫn cùng ngày VN", () => {
    const at = new Date("2026-11-06T16:59:00Z"); // 23:59 giờ VN
    expect(vnDateOf(at)).toBe("2026-11-06");
    expect(vnTimeLabel(at)).toBe("23:59");
  });

  it("17:00 UTC đã sang ngày mới ở VN", () => {
    const at = new Date("2026-11-06T17:00:00Z");
    expect(vnDateOf(at)).toBe("2026-11-07");
    expect(vnTimeLabel(at)).toBe("00:00");
  });
});

describe("parseVnLocal / toVnLocal", () => {
  it("đọc giá trị datetime-local theo giờ VN và đi ngược lại được", () => {
    const at = parseVnLocal("2026-11-06T18:00");
    expect(at?.toISOString()).toBe("2026-11-06T11:00:00.000Z");
    expect(toVnLocal(at!)).toBe("2026-11-06T18:00");
  });

  it("từ chối chuỗi sai định dạng hoặc ngày không tồn tại", () => {
    expect(parseVnLocal("")).toBeNull();
    expect(parseVnLocal("2026-11-06")).toBeNull();
    expect(parseVnLocal("2026-02-30T18:00")).toBeNull();
    expect(parseVnLocal("2026-11-06T24:00")).toBeNull();
    expect(parseVnLocal("2026-11-06T18:00:00")).toBeNull();
  });

  it("isISODate kiểm tra ngày thật", () => {
    expect(isISODate("2028-02-29")).toBe(true);
    expect(isISODate("2026-02-29")).toBe(false);
    expect(isISODate("2026-1-05")).toBe(false);
  });
});

describe("vnWeekday / addDays / vnDayLabel", () => {
  it("06/11/2026 là Thứ Sáu", () => {
    expect(vnWeekday("2026-11-06")).toBe(5);
    expect(vnWeekday("2026-11-08")).toBe(0);
  });

  it("cộng ngày qua tháng và năm", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("nhãn ngày", () => {
    expect(vnDayLabel("2026-11-06", "2026-11-06")).toBe("Tối nay");
    expect(vnDayLabel("2026-11-07", "2026-11-06")).toBe("Mai");
    expect(vnDayLabel("2026-11-08", "2026-11-06")).toBe("CN 08/11");
    expect(vnDayLabel("2026-11-14", "2026-11-06")).toBe("T7 14/11");
  });
});

describe("formatRemaining", () => {
  const min = 60_000;

  it("≤ 0 là đã chốt", () => {
    expect(formatRemaining(0)).toBe("đã chốt");
    expect(formatRemaining(-5000)).toBe("đã chốt");
  });

  it("dưới 10 phút đếm mm:ss", () => {
    expect(formatRemaining(9 * min + 42_000)).toBe("còn 09:42");
    expect(formatRemaining(1)).toBe("còn 00:01");
  });

  it("10–60 phút hiển thị số phút", () => {
    expect(formatRemaining(10 * min)).toBe("còn 10 phút");
    expect(formatRemaining(17 * min + 30_000)).toBe("còn 18 phút");
    expect(formatRemaining(60 * min)).toBe("còn 60 phút");
  });

  it("trên 60 phút hiển thị giờ và phút", () => {
    expect(formatRemaining(135 * min)).toBe("còn 2 giờ 15 phút");
    expect(formatRemaining(120 * min)).toBe("còn 2 giờ");
  });
});
