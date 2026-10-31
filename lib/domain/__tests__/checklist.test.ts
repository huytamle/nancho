import { describe, expect, it } from "vitest";
import {
  canAccess,
  canEditOps,
  isDone,
  markIssue,
  outOfRange,
  progress,
  rangeLabel,
  runDate,
  slugify,
  validItems,
  type ChecklistItem,
} from "@/lib/domain/checklist";

const fridge: ChecklistItem = { id: "fridge", label: "Tủ mát", value: { unit: "°C", max: 5 } };
const oven: ChecklistItem = { id: "oven", label: "Lò đạt nhiệt", value: { unit: "°C", min: 250 } };
const floor: ChecklistItem = { id: "floor", label: "Lau sàn", photo: true };
const lights: ChecklistItem = { id: "lights", label: "Bật đèn" };

describe("checklist — quyền", () => {
  it("owner/manager sửa & xem tất cả; nhân viên chỉ vai của mình", () => {
    expect(canEditOps(["owner"])).toBe(true);
    expect(canEditOps(["manager", "barista"])).toBe(true);
    expect(canEditOps(["kitchen"])).toBe(false);
    expect(canAccess(["manager"], ["kitchen"])).toBe(true);
    expect(canAccess(["barista"], ["kitchen"])).toBe(false);
    expect(canAccess(["barista", "server"], ["kitchen", "server"])).toBe(true);
    expect(canAccess(["kitchen"], [])).toBe(false);
  });
});

describe("checklist — ngày lượt", () => {
  it("hằng ngày = hôm nay; hằng tuần = Thứ Hai của tuần", () => {
    expect(runDate("open", "2026-11-13")).toBe("2026-11-13");
    expect(runDate("close", "2026-11-15")).toBe("2026-11-15");
    expect(runDate("weekly", "2026-11-13")).toBe("2026-11-09"); // T6 → T2
    expect(runDate("weekly", "2026-11-15")).toBe("2026-11-09"); // CN thuộc tuần bắt đầu T2 trước đó
    expect(runDate("weekly", "2026-11-09")).toBe("2026-11-09");
    expect(runDate("weekly", "2026-11-02")).toBe("2026-11-02");
  });
});

describe("checklist — ngưỡng", () => {
  it("ngoài khoảng / nhãn khoảng", () => {
    expect(outOfRange(fridge.value!, 5)).toBe(false);
    expect(outOfRange(fridge.value!, 5.5)).toBe(true);
    expect(outOfRange(oven.value!, 249)).toBe(true);
    expect(outOfRange(oven.value!, 260)).toBe(false);
    expect(outOfRange({ unit: "°C", min: 0, max: 5 }, -1)).toBe(true);
    expect(outOfRange({ unit: "" }, 1000)).toBe(false);
    expect(rangeLabel(fridge.value!)).toBe("≤ 5 °C");
    expect(rangeLabel(oven.value!)).toBe("≥ 250 °C");
    expect(rangeLabel({ unit: "°C", min: 0, max: 5 })).toBe("0–5 °C");
    expect(rangeLabel({ unit: "" , max: 3})).toBe("≤ 3");
    expect(rangeLabel({ unit: "kg" })).toBe("");
  });
});

describe("checklist — tiến độ & đánh dấu", () => {
  const items = [fridge, floor, lights];
  const by = 1;
  const at = "2026-11-13T01:00:00.000Z";

  it("chỉ tính xong khi đủ số đo/ảnh theo mẫu hiện tại", () => {
    expect(isDone(lights, undefined)).toBe(false);
    expect(isDone(lights, { by, at })).toBe(true);
    expect(isDone(fridge, { by, at })).toBe(false);
    expect(isDone(fridge, { by, at, value: 7 })).toBe(true);
    expect(isDone(floor, { by, at })).toBe(false);
    expect(isDone(floor, { by, at, photo: "f" })).toBe(true);
  });

  it("tiến độ bỏ qua mục đã xoá khỏi mẫu", () => {
    expect(progress(items, {})).toEqual({ done: 0, total: 3, complete: false });
    expect(progress(items, { lights: { by, at }, gone: { by, at } })).toEqual({ done: 1, total: 3, complete: false });
    expect(progress(items, { lights: { by, at }, fridge: { by, at, value: 4 }, floor: { by, at, photo: "p" } })).toEqual({ done: 3, total: 3, complete: true });
    expect(progress([], {})).toEqual({ done: 0, total: 0, complete: false });
  });

  it("thiếu số đo / ảnh bị từ chối", () => {
    expect(markIssue(fridge, {})).toBe("value_required");
    expect(markIssue(fridge, { value: null })).toBe("value_required");
    expect(markIssue(fridge, { value: Number.NaN })).toBe("value_required");
    expect(markIssue(fridge, { value: 3 })).toBeNull();
    expect(markIssue(floor, {})).toBe("photo_required");
    expect(markIssue(floor, { photo: "id" })).toBeNull();
    expect(markIssue(lights, {})).toBeNull();
  });
});

describe("checklist — kiểm tra mẫu", () => {
  it("hợp lệ / không hợp lệ", () => {
    expect(validItems([fridge, floor, lights])).toBe(true);
    expect(validItems([])).toBe(false);
    expect(validItems(Array.from({ length: 41 }, (_, i) => ({ id: `i${i}`, label: "x" })))).toBe(false);
    expect(validItems([lights, { ...lights }])).toBe(false);
    expect(validItems([{ id: "Bad Id", label: "x" }])).toBe(false);
    expect(validItems([{ id: "a", label: "   " }])).toBe(false);
    expect(validItems([{ id: "a", label: "x".repeat(121) }])).toBe(false);
    expect(validItems([{ id: "a", label: "x", value: { unit: "°C", min: 6, max: 5 } }])).toBe(false);
    expect(validItems([{ id: "a", label: "x", value: { unit: "°C", min: 0, max: 5 } }])).toBe(true);
  });
});

describe("sổ tay — slug", () => {
  it("bỏ dấu tiếng Việt, gạch nối, tối đa 60 ký tự", () => {
    expect(slugify("Mở lò & ủ đế")).toBe("mo-lo-u-de");
    expect(slugify("  Đóng ca — Bếp  ")).toBe("dong-ca-bep");
    expect(slugify("Pepperoni Pan (1 phần)")).toBe("pepperoni-pan-1-phan");
    expect(slugify("!!!")).toBe("");
    const long = slugify("a".repeat(59) + " bcd");
    expect(long).toBe("a".repeat(59));
    expect(long.length).toBeLessThanOrEqual(60);
  });
});
