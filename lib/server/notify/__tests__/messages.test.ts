import { describe, expect, it } from "vitest";
import { almostFullText, cancelledText, newOrderText, paymentText } from "@/lib/server/notify/messages";

describe("tin Telegram (§11.3)", () => {
  it("đơn mới: một dòng tóm tắt + cảnh báo khách mới", () => {
    const text = newOrderText({
      seq: 12,
      code: "TH-0611-12",
      readyLabel: "18:00",
      dayLabel: "",
      name: "Tuấn",
      phone: "0912345678",
      where: "KP2",
      items: [
        { short: "Combo", qty: 1 },
        { short: "Pizza Bơ tỏi", qty: 1 },
      ],
      total: 458_000,
      paymentMethod: "cod",
      needsConfirm: true,
      note: null,
      link: "https://theheatpizza.vn/admin/kitchen?ngay=2026-11-06&tab=don",
    });
    expect(text.split("\n")).toEqual([
      "🆕 #12 · Mẻ 18:00 · Tuấn 0912 345 678 · KP2 · 1 Combo + 1 Pizza Bơ tỏi · 458k · COD",
      "⚠ Khách mới — gọi xác nhận",
      "TH-0611-12 · https://theheatpizza.vn/admin/kitchen?ngay=2026-11-06&tab=don",
    ]);
  });

  it("ngày khác, chuyển khoản, có ghi chú", () => {
    const text = newOrderText({
      seq: 3, code: "TH-0711-03", readyLabel: "19:00", dayLabel: "T7 07/11", name: "Lan", phone: "0987000001",
      where: "Nhận tại Rêu", items: [{ short: "Pepperoni", qty: 2 }], total: 318_000, paymentMethod: "transfer",
      needsConfirm: false, note: "ít cay", link: "x",
    });
    expect(text).toBe("🆕 #3 · Mẻ 19:00 T7 07/11 · Lan 0987 000 001 · Nhận tại Rêu · 2 Pepperoni · 318k · CK\n📝 ít cay\nTH-0711-03 · x");
  });

  it("huỷ & sắp kín lò", () => {
    expect(cancelledText({ seq: 12, readyLabel: "18:00", dayLabel: "", units: 2 })).toBe("❌ #12 huỷ bởi khách · trả 2 suất mẻ 18:00");
    expect(cancelledText({ seq: 1, readyLabel: "18:00", dayLabel: "Mai", units: 1 })).toBe("❌ #1 huỷ bởi khách · trả 1 suất mẻ 18:00 Mai");
    expect(almostFullText({ readyLabel: "18:00", dayLabel: "" })).toBe("🔥 Mẻ 18:00 còn 1 suất");
  });
});

describe("tin thanh toán SePay (§11.2)", () => {
  it("đủ / thiếu / dư / không khớp", () => {
    expect(paymentText({ kind: "paid", seq: 12, amount: 458000 })).toBe("💰 #12 đã chuyển khoản 458.000đ");
    expect(paymentText({ kind: "partial", seq: 12, amount: 200000, received: 200000, total: 458000 })).toBe(
      "⚠ #12 chuyển thiếu: nhận 200.000đ · tổng đã nhận 200.000đ/458.000đ — gọi khách",
    );
    expect(paymentText({ kind: "extra", seq: 3, amount: 1000, status: "cancelled" })).toContain("đã huỷ");
    expect(paymentText({ kind: "unmatched", amount: 50000, content: "chuyen tien" })).toBe(
      '⚠ Tiền về 50.000đ không khớp đơn nào · "chuyen tien" — đối chiếu rồi bấm [Đã trả] trên đơn trong dashboard',
    );
  });
});
