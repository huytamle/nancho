import { describe, expect, it } from "vitest";
import { redactUrl } from "@/lib/client/analytics";
import { SepayPayload, sepayAuthHeader, sepayText, transferInfo, vietQrUrl, type BankAccount } from "@/lib/payments";
import { cleanSource } from "@/lib/source";
import { productFromPath } from "@/lib/client/sheet-url";

const ACC: BankAccount = { bin: "970436", accountNo: "1012345678", accountName: "NGUYEN VAN A", bankName: "Vietcombank" };

describe("VietQR (§11.1)", () => {
  it("dựng link ảnh quick link đúng mẫu compact2", () => {
    const url = new URL(vietQrUrl(ACC, 458000, "TH061112"));
    expect(url.origin + url.pathname).toBe("https://img.vietqr.io/image/970436-1012345678-compact2.png");
    expect(url.searchParams.get("amount")).toBe("458000");
    expect(url.searchParams.get("addInfo")).toBe("TH061112");
    expect(url.searchParams.get("accountName")).toBe("NGUYEN VAN A");
  });

  it("thiếu cấu hình tài khoản → không QR, vẫn có số tiền + nội dung", () => {
    expect(transferInfo(null, 1000, "TH010101")).toEqual({
      amount: 1000,
      memo: "TH010101",
      qrUrl: "",
      bankName: null,
      accountNo: null,
      accountName: null,
    });
    expect(transferInfo(ACC, 1000, "TH010101")).toMatchObject({ accountNo: "1012345678", bankName: "Vietcombank" });
  });
});

describe("payload SePay (§11.2)", () => {
  const sample = {
    id: 92704,
    gateway: "Vietcombank",
    transactionDate: "2026-11-06 14:02:37",
    accountNumber: "1012345678",
    code: null,
    content: "TH061112 chuyen tien",
    transferType: "in",
    transferAmount: 458000,
    accumulated: 19077000,
    subAccount: null,
    referenceCode: "MBVCB.3278907687",
    description: "MBVCB.3278907687.TH061112 chuyen tien",
  };

  it("đọc payload mẫu, id thành chuỗi, giữ trường lạ", () => {
    const p = SepayPayload.parse(sample);
    expect(p.id).toBe("92704");
    expect(p.transferAmount).toBe(458000);
    expect(p).toHaveProperty("accumulated", 19077000);
    expect(sepayText(p)).toContain("TH061112");
  });

  it("từ chối payload thiếu trường bắt buộc / số tiền âm", () => {
    expect(SepayPayload.safeParse({ ...sample, transferType: "x" }).success).toBe(false);
    expect(SepayPayload.safeParse({ ...sample, transferAmount: -1 }).success).toBe(false);
    expect(SepayPayload.safeParse({ ...sample, id: undefined }).success).toBe(false);
  });

  it("header xác thực dạng Apikey", () => {
    expect(sepayAuthHeader("abc")).toBe("Apikey abc");
  });
});

describe("kênh ?src= & URL", () => {
  it("chuẩn hoá & lọc src", () => {
    expect(cleanSource(" FB-Post ")).toBe("fb-post");
    expect(cleanSource("qr_hop")).toBe("qr_hop");
    expect(cleanSource("<script>")).toBeNull();
    expect(cleanSource("a".repeat(41))).toBeNull();
    expect(cleanSource(undefined)).toBeNull();
  });

  it("che token theo dõi đơn trong URL analytics", () => {
    expect(redactUrl("https://theheatpizza.vn/o/abcDEF_123-xyz0123456789?x=1")).toBe("https://theheatpizza.vn/o/[token]?x=1");
    expect(redactUrl("https://theheatpizza.vn/?mon=combo-doi")).toBe("https://theheatpizza.vn/?mon=combo-doi");
  });

  it("đọc món từ đường dẫn /m/<id>", () => {
    expect(productFromPath("/m/combo-doi")).toBe("combo-doi");
    expect(productFromPath("/m/combo-doi/")).toBe("combo-doi");
    expect(productFromPath("/")).toBeNull();
    expect(productFromPath("/m/a/b")).toBeNull();
  });
});
