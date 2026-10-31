import { describe, expect, it } from "vitest";
import {
  canManageTime,
  canonicalJson,
  complianceMisses,
  DEFAULT_PAYROLL,
  onPayroll,
  payLineLabel,
  payslipTotal,
  rateOn,
  revenuePool,
  splitPool,
  validRate,
  workLines,
} from "@/lib/domain/payroll";
import type { ISODate } from "@/lib/domain/time";
import {
  entryMinutes,
  forgotCutoff,
  formatMinutes,
  isForgotten,
  isLateOut,
  isOffSite,
  isPeriod,
  nextPeriod,
  periodLabel,
  periodOf,
  periodRange,
  prevPeriod,
  weekStart,
  workDays,
  workTotals,
} from "@/lib/domain/worktime";

const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+07:00`);
const e = (date: string, from: string, to: string, toDate = date) => ({ clockIn: at(date, from), clockOut: at(toDate, to) });
const D = (s: string) => s as ISODate;

describe("worktime — tính giờ", () => {
  it("ca tối 16:00–22:15: 6 giờ 15 phút, 15 phút đêm, không làm thêm", () => {
    const [d] = workDays([e("2026-11-06", "16:00", "22:15")]);
    expect(d).toMatchObject({ date: "2026-11-06", minutes: 375, night: 15, overtime: 0, nightOvertime: 0, holiday: 0 });
  });

  it("cắt giây, lượt chưa ra ca và lượt ngược bị bỏ qua", () => {
    const days = workDays([
      { clockIn: new Date("2026-11-06T16:00:59+07:00"), clockOut: new Date("2026-11-06T16:30:10+07:00") },
      { clockIn: at("2026-11-07", "10:00"), clockOut: null },
      { clockIn: at("2026-11-08", "10:00"), clockOut: at("2026-11-08", "09:00") },
    ]);
    expect(days).toHaveLength(1);
    expect(days[0].minutes).toBe(30);
    expect(entryMinutes(e("2026-11-06", "10:00", "09:00"))).toBe(0);
  });

  it("qua nửa đêm: thuộc ngày vào ca; phần vượt 8 giờ là làm thêm ban đêm", () => {
    const [d] = workDays([e("2026-11-06", "17:00", "02:00", "2026-11-07")]);
    expect(d).toMatchObject({ date: "2026-11-06", minutes: 540, night: 240, overtime: 60, nightOvertime: 60 });
    const [x] = workDays([e("2026-11-06", "18:00", "02:00", "2026-11-07")]);
    expect(x).toMatchObject({ minutes: 480, overtime: 0 });
  });

  it("sáng sớm trước 06:00 cũng là giờ đêm", () => {
    const [d] = workDays([e("2026-11-06", "05:30", "07:00")]);
    expect(d).toMatchObject({ minutes: 90, night: 30 });
  });

  it("nhiều lượt trong ngày cộng dồn; làm thêm tính từ phút thứ 481", () => {
    const [d] = workDays([e("2026-11-06", "13:00", "18:30"), e("2026-11-06", "08:00", "12:00")]);
    expect(d).toMatchObject({ minutes: 570, overtime: 90, night: 0 });
  });

  it("ngày lễ theo ngày dương lịch của từng phút; lễ không cộng thêm làm thêm", () => {
    const shift = e("2026-04-30", "18:00", "00:30", "2026-05-01");
    const [onlyMay] = workDays([shift], { holidays: [{ date: D("2026-05-01"), multiplier: 3 }] });
    expect(onlyMay).toMatchObject({ date: "2026-04-30", minutes: 390, holiday: 30, holidayExtra: 60, night: 150 });
    const [both] = workDays([e("2026-04-30", "08:00", "18:00")], { holidays: [{ date: D("2026-04-30"), multiplier: 3 }] });
    expect(both).toMatchObject({ minutes: 600, holiday: 600, holidayExtra: 1200, overtime: 0 });
  });

  it("hệ số lễ lẻ giữ 2 chữ số thập phân", () => {
    const [d] = workDays([e("2026-09-02", "10:00", "10:03")], { holidays: [{ date: D("2026-09-02"), multiplier: 2.1 }] });
    expect(d.holidayExtra).toBe(3.3);
  });

  it("đi muộn / về sớm theo lịch ca; ngày có lịch mà vắng vẫn hiện", () => {
    const plans = [
      { date: D("2026-11-06"), start: "16:00", end: "22:00" },
      { date: D("2026-11-07"), start: "16:00", end: "22:00" },
      { date: D("2026-11-08"), start: "16:00", end: "22:00" },
    ];
    const days = workDays([e("2026-11-06", "16:06", "22:00"), e("2026-11-07", "16:05", "21:50")], { plans });
    expect(days.map((d) => [d.date, d.late, d.early, d.planned, d.minutes])).toEqual([
      ["2026-11-06", true, false, true, 354],
      ["2026-11-07", false, true, true, 345],
      ["2026-11-08", false, false, true, 0],
    ]);
    const t = workTotals(days);
    expect(t).toMatchObject({ minutes: 699, days: 2, late: 1, early: 1, night: 0 });
  });

  it("tổng gồm đêm, làm thêm, lễ", () => {
    const t = workTotals(
      workDays([e("2026-11-06", "17:00", "02:00", "2026-11-07"), e("2026-11-20", "10:00", "11:00")], {
        holidays: [{ date: D("2026-11-20"), multiplier: 2 }],
      }),
    );
    expect(t).toMatchObject({ minutes: 600, night: 240, overtime: 60, nightOvertime: 60, holiday: 60, holidayExtra: 60, days: 2 });
  });

  it("ra ca muộn > 15 phút so với lịch → late_out", () => {
    const plan = { date: D("2026-11-06"), start: "16:00", end: "22:00" };
    expect(isLateOut(at("2026-11-06", "22:15"), plan)).toBe(false);
    expect(isLateOut(at("2026-11-06", "22:16"), plan)).toBe(true);
    expect(isLateOut(at("2026-11-06", "23:00"), null)).toBe(false);
  });

  it("quên ra ca: còn mở từ trước mốc 03:00 gần nhất", () => {
    expect(forgotCutoff(at("2026-11-07", "10:00"))).toEqual(at("2026-11-07", "03:00"));
    expect(forgotCutoff(at("2026-11-07", "02:00"))).toEqual(at("2026-11-06", "03:00"));
    const open = { clockIn: at("2026-11-06", "16:00"), clockOut: null };
    expect(isForgotten(open, at("2026-11-07", "02:59"))).toBe(false);
    expect(isForgotten(open, at("2026-11-07", "03:00"))).toBe(true);
    expect(isForgotten({ ...open, clockOut: at("2026-11-06", "22:00") }, at("2026-11-08", "10:00"))).toBe(false);
  });

  it("IP ngoài quán chỉ gắn cờ khi đã cấu hình Wi-Fi quán", () => {
    expect(isOffSite("1.2.3.4", [])).toBe(false);
    expect(isOffSite("1.2.3.4", ["1.2.3.4"])).toBe(false);
    expect(isOffSite("5.6.7.8", ["1.2.3.4"])).toBe(true);
  });

  it("kỳ tháng & định dạng", () => {
    expect(isPeriod("2026-11")).toBe(true);
    expect(isPeriod("2026-13")).toBe(false);
    expect(periodOf(D("2026-11-06"))).toBe("2026-11");
    expect(nextPeriod("2026-12")).toBe("2027-01");
    expect(nextPeriod("2026-09")).toBe("2026-10");
    expect(prevPeriod("2026-01")).toBe("2025-12");
    expect(prevPeriod("2026-11")).toBe("2026-10");
    expect(periodRange("2026-11")).toEqual({ from: at("2026-11-01", "00:00"), to: at("2026-12-01", "00:00") });
    expect(periodLabel("2026-11")).toBe("11/2026");
    expect(formatMinutes(375)).toBe("6 giờ 15 phút");
    expect(formatMinutes(60)).toBe("1 giờ");
    expect(formatMinutes(20)).toBe("20 phút");
    expect(weekStart(D("2026-11-08"))).toBe("2026-11-02"); // CN
    expect(weekStart(D("2026-11-02"))).toBe("2026-11-02"); // T2
    expect(weekStart(D("2026-11-06"))).toBe("2026-11-02");
  });
});

describe("payroll — lương", () => {
  const rates = [
    { hourlyRate: 20_000, effectiveFrom: D("2026-01-01") },
    { hourlyRate: 25_000, effectiveFrom: D("2026-11-15") },
  ];

  it("đơn giá theo ngày hiệu lực", () => {
    expect(rateOn(rates, D("2025-12-31"))).toBeNull();
    expect(rateOn(rates, D("2026-11-14"))).toBe(20_000);
    expect(rateOn(rates, D("2026-11-15"))).toBe(25_000);
    expect(rateOn([...rates].reverse(), D("2026-12-01"))).toBe(25_000);
    expect(validRate(20_000, 20_000)).toBe(true);
    expect(validRate(19_999, 20_000)).toBe(false);
    expect(validRate(20_000.5, 20_000)).toBe(false);
  });

  it("20 phút dọn dẹp sau 22:00 × 20.000đ × 30% = 2.000đ", () => {
    const lines = workLines(workDays([e("2026-11-06", "16:00", "22:20")]), rates);
    expect(lines).toEqual([
      { kind: "base", label: payLineLabel("base"), minutes: 380, rate: 20_000, amount: 126_667 },
      { kind: "night", label: payLineLabel("night"), minutes: 20, rate: 20_000, amount: 2_000 },
    ]);
  });

  it("đổi đơn giá giữa tháng → hai nhóm dòng, kỳ cũ giữ giá cũ", () => {
    const lines = workLines(workDays([e("2026-11-14", "16:00", "22:00"), e("2026-11-15", "16:00", "22:00")]), rates);
    expect(Array.isArray(lines) && lines.map((l) => [l.kind, l.rate, l.minutes, l.amount])).toEqual([
      ["base", 20_000, 360, 120_000],
      ["base", 25_000, 360, 150_000],
    ]);
  });

  it("làm thêm +50%, làm thêm ban đêm thêm 20%, ngày lễ × hệ số", () => {
    const days = workDays([e("2026-11-06", "17:00", "02:00", "2026-11-07"), e("2026-11-12", "10:00", "11:00")], {
      holidays: [{ date: D("2026-11-12"), multiplier: 3 }],
    });
    const lines = workLines(days, rates);
    expect(lines).toEqual([
      { kind: "base", label: payLineLabel("base"), minutes: 600, rate: 20_000, amount: 200_000 },
      // 240 phút đêm × 30% = 24.000 + 60 phút làm thêm đêm × 20% = 4.000
      { kind: "night", label: payLineLabel("night"), minutes: 240, rate: 20_000, amount: 28_000 },
      { kind: "overtime", label: payLineLabel("overtime"), minutes: 60, rate: 20_000, amount: 10_000 },
      { kind: "holiday", label: payLineLabel("holiday"), minutes: 60, rate: 20_000, amount: 40_000 },
    ]);
    expect(payslipTotal(lines as never)).toBe(278_000);
  });

  it("thiếu đơn giá cho ngày có giờ công", () => {
    expect(workLines(workDays([e("2025-12-30", "10:00", "11:00")]), rates)).toEqual({ missingRate: "2025-12-30" });
    expect(workLines(workDays([], { plans: [{ date: D("2025-12-30"), start: "10:00", end: "11:00" }] }), rates)).toEqual([]);
  });

  it("quỹ thưởng 1% chia theo giờ công, tổng đúng bằng quỹ", () => {
    expect(revenuePool(45_678_900, 1)).toBe(456_789);
    expect(revenuePool(-5, 1)).toBe(0);
    const shares = splitPool(100, [
      { id: 1, minutes: 1 },
      { id: 2, minutes: 1 },
      { id: 3, minutes: 1 },
    ]);
    expect([...shares.values()]).toEqual([34, 33, 33]);
    const big = splitPool(456_789, [
      { id: 7, minutes: 9_000 },
      { id: 3, minutes: 4_500 },
      { id: 5, minutes: 0 },
    ]);
    expect(big.get(7)! + big.get(3)! + big.get(5)!).toBe(456_789);
    expect(big.get(5)).toBe(0);
    expect(big.get(7)).toBe(304_526);
    expect([...splitPool(0, [{ id: 1, minutes: 10 }]).values()]).toEqual([0]);
    expect([...splitPool(100, [{ id: 1, minutes: 0 }]).values()]).toEqual([0]);
  });

  it("thưởng tuân thủ: đi muộn ≤ 2, checklist ≥ 95%, lệch két ≤ 20.000đ", () => {
    expect(complianceMisses({ late: 2, checklistPct: 95, maxCashVariance: 20_000 }, DEFAULT_PAYROLL)).toEqual([]);
    expect(complianceMisses({ late: 3, checklistPct: 94.9, maxCashVariance: 20_001 }, DEFAULT_PAYROLL)).toEqual(["late", "checklist", "cash"]);
    expect(complianceMisses({ late: 0, checklistPct: null, maxCashVariance: null }, DEFAULT_PAYROLL)).toEqual([]);
  });

  it("không ai tự gửi/sửa công của mình; công của quản lý do chủ quán", () => {
    const owner = { id: 1, roles: ["owner" as const] };
    const manager = { id: 2, roles: ["manager" as const, "barista" as const] };
    const staff = { id: 3, roles: ["barista" as const] };
    expect(canManageTime(manager, staff)).toBe(true);
    expect(canManageTime(owner, staff)).toBe(true);
    expect(canManageTime(owner, manager)).toBe(true);
    expect(canManageTime(manager, manager)).toBe(false);
    expect(canManageTime(manager, { id: 4, roles: ["manager"] })).toBe(false);
    expect(canManageTime(staff, { id: 5, roles: ["kitchen"] })).toBe(false);
    expect(canManageTime(owner, owner)).toBe(false);
    expect(canManageTime(owner, { id: 6, roles: ["owner", "kitchen"] })).toBe(false);
    expect(onPayroll(["owner", "barista"])).toBe(false);
  });

  it("JSON ổn định không phụ thuộc thứ tự khoá", () => {
    expect(canonicalJson({ b: 1, a: [1, { d: null, c: "x" }], u: undefined })).toBe('{"a":[1,{"c":"x","d":null}],"b":1}');
    expect(canonicalJson(undefined)).toBe("null");
  });
});
