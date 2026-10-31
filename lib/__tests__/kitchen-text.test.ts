import { describe, expect, it } from "vitest";
import { DATE, batches, catalog, orders } from "@/lib/domain/__tests__/fixtures";
import { buildPrepReport } from "@/lib/domain/prep";
import { vnInstant } from "@/lib/domain/time";
import {
  ingredientQty,
  kitchenName,
  longDate,
  pickupText,
  prepSummaryText,
  promoPostText,
  routeMapsUrl,
  shipperText,
} from "@/lib/kitchen-text";

const report = (hhmm: string) => buildPrepReport({ date: DATE, now: vnInstant(DATE, hhmm), orders, batches, ...catalog });

describe("prepSummaryText — Phụ lục B khớp §10.2", () => {
  const text = prepSummaryText(report("15:45"), { date: DATE, cutoffLabel: "15:30" });
  const lines = text.split("\n");

  it("đầu bảng: ngày, chốt sổ, tổng", () => {
    expect(lines.slice(0, 3)).toEqual(["🔥 THE HEAT · BẾP · Thứ Sáu 06/11", "🔒 ĐÃ CHỐT SỔ 15:30 · 12 đơn", "TỔNG: 9 Pizza · 6 BBQ"]);
  });

  it("lấy ra tủ: đúng từng con số, tách bán/tặng và theo loại pizza", () => {
    expect(lines).toContain("• Đế Pan đã ủ: 9 đế (5 Pepperoni · 4 Phô mai Bơ tỏi)");
    expect(lines).toContain("• Túi sườn sous-vide: 6 túi (≈3 kg)");
    expect(lines).toContain("• Mozzarella: 1.620 g (5 Pepperoni · 4 Phô mai Bơ tỏi)");
    expect(lines).toContain("• Pepperoni lát: 300 g");
    expect(lines).toContain("• Hũ Sốt Bơ Tỏi: 7 hũ (4 bán · 3 tặng)");
    expect(lines).toContain("• Hũ Sốt BBQ khói: 3 hũ");
    expect(lines).toContain("• Gừng hồng muối: 15 phần");
    expect(lines).toContain("• Cold brew Rêu: 4 chai");
  });

  it("chia theo mẻ: tổng mẻ = tổng ngày, tuyến & quầy Rêu", () => {
    const i = lines.indexOf("CHIA THEO MẺ");
    expect(lines.slice(i + 1, i + 10)).toEqual([
      "▸ Mẻ 16:40 → Giao 17:00 · 3 Pizza + 2 BBQ",
      "  🛵 Tuyến Khu phố 2: Tuấn · Lan · Huy",
      "▸ Mẻ 17:40 → Giao 18:00 · 4 Pizza + 3 BBQ",
      "  🛵 Tuyến Quốc lộ / Thị trấn: Hoa · Vy · Ngọc · Minh · Phúc",
      "  ☕ Cà phê Rêu: Khánh",
      "▸ Mẻ 18:40 → Giao 19:00 · 2 Pizza + 1 BBQ",
      "  🛵 Tuyến Khu phố 2: Trang",
      "  ☕ Cà phê Rêu: Dũng · Bảo",
      "",
    ]);
  });

  it("cảnh báo", () => {
    expect(lines.slice(-3)).toEqual([
      "⚠ #5 chuyển khoản chưa nhận tiền",
      '⚠ #7 ghi chú: "Ít cay, dị ứng đậu phộng"',
      "⚠ #9 chuyển khoản chưa nhận tiền",
    ]);
  });

  it("trước giờ chốt là bản tạm tính; mẻ trống ghi rõ", () => {
    const draft = prepSummaryText(buildPrepReport({ date: DATE, now: vnInstant(DATE, "10:00"), orders: [], batches, ...catalog }), {
      date: DATE,
      cutoffLabel: "15:30",
    });
    expect(draft).toContain("⏳ TẠM TÍNH · 0 đơn");
    expect(draft).toContain("▸ Mẻ 16:40 → Giao 17:00 · Chưa có đơn");
    expect(draft).not.toContain("LẤY RA TỦ");
  });
});

describe("văn bản giao hàng", () => {
  const r = report("16:00");
  const kp2 = r.batches[0].routes[0];

  it("copy gửi shipper (§10.5)", () => {
    expect(shipperText({ readyLabel: "17:00", routeName: kp2.routeName, stops: kp2.stops }).split("\n")).toEqual([
      "🛵 MẺ 17:00 · TUYẾN KHU PHỐ 2 · 3 điểm · Thu 616.000đ",
      "1) #01 Tuấn 0900 000 001 — Khu phố 2 · Nhà của Tuấn — THU 317.000đ",
      "2) #02 Lan 0900 000 002 — Khu phố 2 · Nhà của Lan — ĐÃ CK",
      "3) #03 Huy 0900 000 003 — Khu phố 2 · Nhà của Huy — THU 299.000đ",
    ]);
  });

  it("ghi chú và link bản đồ của từng điểm", () => {
    const text = shipperText({
      readyLabel: "18:00",
      routeName: "Tuyến X",
      stops: [{ ...kp2.stops[0], note: "Gọi trước", mapsUrl: "https://maps/x" }],
    });
    expect(text).toContain("   📝 Gọi trước\n   📍 https://maps/x");
  });

  it("danh sách quầy Rêu", () => {
    const reu = r.batches[2].pickups[0];
    expect(pickupText({ readyLabel: "19:00", pointName: reu.pointName, orders: reu.orders })).toBe(
      "☕ CÀ PHÊ RÊU · MẺ 19:00 · 2 khách\n#10 Dũng — THU 149.000đ\n#12 Bảo — THU 179.000đ",
    );
    expect(pickupText({ readyLabel: "19:00", pointName: "Rêu", orders: [{ seq: 3, name: "A", collect: 0 }] })).toContain("#03 A — ĐÃ TRẢ");
  });

  it("chỉ đường qua các điểm có toạ độ", () => {
    expect(routeMapsUrl([{ lat: null, lng: null }], null)).toBeNull();
    const url = new URL(routeMapsUrl([{ lat: 1, lng: 2 }, { lat: null, lng: null }, { lat: 3, lng: 4 }], "5,6")!);
    expect(url.searchParams.get("origin")).toBe("5,6");
    expect(url.searchParams.get("waypoints")).toBe("1,2");
    expect(url.searchParams.get("destination")).toBe("3,4");
    expect(new URL(routeMapsUrl([{ lat: 1, lng: 2 }], null)!).searchParams.has("waypoints")).toBe(false);
  });
});

describe("tiện ích", () => {
  it("tên gọn & số lượng", () => {
    expect(kitchenName("Pan Pizza Pepperoni")).toBe("Pepperoni");
    expect(kitchenName("Combo Đôi — 1 Pan Pizza + 1 BBQ")).toBe("Combo Đôi");
    expect(ingredientQty({ qty: 1620, unit: "g" })).toBe("1.620 g");
    expect(ingredientQty({ qty: 6, unit: "túi", approxKg: 3 })).toBe("6 túi (≈3 kg)");
    expect(longDate("2026-11-08")).toBe("Chủ Nhật 08/11");
  });

  it("bài đăng từ số suất thật", () => {
    const url = "theheatpizza.vn/?src=fb-post";
    expect(promoPostText({ dayWord: "Tối nay", slots: [{ readyLabel: "18:00", remaining: 0 }, { readyLabel: "19:00", remaining: 4 }], url })).toBe(
      "🔥 Tối nay: mẻ 19:00 còn 4 suất\nPan pizza viền phô mai cháy & sườn BBQ sous-vide — nướng theo mẻ, đặt trước mới làm.\n👉 Đặt tại theheatpizza.vn/?src=fb-post",
    );
    expect(promoPostText({ dayWord: "Tối nay", slots: [], url })).toContain("đã kín lò");
  });
});
