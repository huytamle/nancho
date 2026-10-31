import { describe, expect, it } from "vitest";
import { formatPhone, formatPhoneInput, maskName, normalizePhone } from "@/lib/domain/phone";

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

describe("formatPhoneInput", () => {
  it("nhóm số khi gõ, bỏ ký tự lạ, tối đa 10 số", () => {
    expect(formatPhoneInput("")).toBe("");
    expect(formatPhoneInput("091")).toBe("091");
    expect(formatPhoneInput("09123")).toBe("0912 3");
    expect(formatPhoneInput("0912-345.678")).toBe("0912 345 678");
    expect(formatPhoneInput("091234567899")).toBe("0912 345 678");
  });

  it("nhận dán +84 / 84", () => {
    expect(formatPhoneInput("+84 912 345 678")).toBe("0912 345 678");
    expect(formatPhoneInput("84912345678")).toBe("0912 345 678");
  });
});
