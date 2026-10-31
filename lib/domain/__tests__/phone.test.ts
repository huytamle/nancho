import { describe, expect, it } from "vitest";
import { formatPhone, maskName, normalizePhone } from "@/lib/domain/phone";

describe("normalizePhone", () => {
  it("chấp nhận các cách gõ thường gặp", () => {
    expect(normalizePhone("0912345678")).toBe("0912345678");
    expect(normalizePhone("0912 345 678")).toBe("0912345678");
    expect(normalizePhone("0912.345.678")).toBe("0912345678");
    expect(normalizePhone("(091) 234-5678")).toBe("0912345678");
    expect(normalizePhone("+84 912 345 678")).toBe("0912345678");
    expect(normalizePhone("84912345678")).toBe("0912345678");
  });

  it("từ chối số sai đầu số hoặc sai độ dài", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("091234567")).toBeNull();
    expect(normalizePhone("09123456789")).toBeNull();
    expect(normalizePhone("0212345678")).toBeNull();
    expect(normalizePhone("abc0912345678")).toBeNull();
  });
});

describe("formatPhone", () => {
  it("nhóm 4-3-3", () => {
    expect(formatPhone("0912345678")).toBe("0912 345 678");
  });
});

describe("maskName", () => {
  it("lấy tên gọi", () => {
    expect(maskName("Nguyễn Văn Tuấn")).toBe("Tuấn");
    expect(maskName("  Lan ")).toBe("Lan");
  });
});
