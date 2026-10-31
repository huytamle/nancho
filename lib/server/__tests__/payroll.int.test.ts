import { createHash } from "node:crypto";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canonicalJson } from "@/lib/domain/payroll";
import { vnInstant, type ISODate } from "@/lib/domain/time";
import { closeDb, getDb } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { seedStatic } from "@/lib/server/db/seed";
import type { OpsActor } from "@/lib/server/dal/ops";
import {
  ackPayslipCore,
  ackTimesheetCore,
  advancePayslipCore,
  buildPayslipsCore,
  clockInCore,
  clockOutCore,
  copyLastWeekCore,
  disputeTimesheetCore,
  editPayslipCore,
  flagForgottenCore,
  loadPayrollView,
  loadTimeView,
  markStoreIpCore,
  reviewTimeEntryCore,
  saveHolidayCore,
  savePayRateCore,
  savePlanCore,
  saveTimeEntryCore,
  submitTimesheetCore,
  runPayrollCron,
} from "@/lib/server/dal/payroll";
import { upsertStaff } from "@/lib/server/dal/staff";

// Chấm công, bảng công, lương (M9, §17.7). Tháng 02/2027 (có Tết — ngày lễ) để không đụng dữ liệu tháng 11/2026
// của file khác. Bất biến chính: DTO cho quản lý không có tiền lương; không ai tự gửi/duyệt công của mình;
// bảng công đã khoá không sửa được.

const at = (date: string, hhmm: string) => vnInstant(date as ISODate, hhmm);
const db = getDb();
const PIN = "246810";
const FEB = "2027-02" as const;
const MAR_2 = at("2027-03-02", "10:00");

let owner: OpsActor, manager: OpsActor, manager2: OpsActor, barista: OpsActor, kitchen: OpsActor;

async function add(name: string, roles: OpsActor["roles"]): Promise<OpsActor> {
  const id = await upsertStaff({ name, roles, pin: PIN }, db);
  return { id, name, roles };
}
const ctx = (actor: OpsActor, now: Date) => ({ actor, now });
const entriesOf = (who: OpsActor) => db.select().from(t.timeEntries).where(eq(t.timeEntries.staffId, who.id)).orderBy(t.timeEntries.clockIn);

async function wipe() {
  const ids = [owner, manager, manager2, barista, kitchen].filter(Boolean).map((s) => s.id);
  await db.delete(t.payslips);
  await db.delete(t.timesheets);
  await db.delete(t.payRates);
  await db.delete(t.timeEntries);
  await db.delete(t.shiftPlans);
  await db.delete(t.holidays);
  if (ids.length) {
    const shifts = await db.select({ id: t.shifts.id }).from(t.shifts).where(inArray(t.shifts.openedBy, ids));
    if (shifts.length) await db.delete(t.cashEntries).where(inArray(t.cashEntries.shiftId, shifts.map((s) => s.id)));
    await db.delete(t.shifts).where(inArray(t.shifts.openedBy, ids));
  }
  await db.delete(t.settings).where(inArray(t.settings.key, ["ops", "payroll"]));
}

/** Tìm khoá tiền trong DTO (đệ quy). */
function moneyKeys(v: unknown, path = ""): string[] {
  if (v === null || typeof v !== "object") return [];
  if (Array.isArray(v)) return v.flatMap((x, i) => moneyKeys(x, `${path}[${i}]`));
  return Object.entries(v).flatMap(([k, x]) =>
    ["hourlyRate", "rate", "amount", "lines", "pool", "revenue", "payslips", "complianceBonus"].includes(k) ? [`${path}.${k}`] : moneyKeys(x, `${path}.${k}`),
  );
}

beforeAll(async () => {
  await seedStatic(db); // mẫu checklist (tính % thưởng tuân thủ)
  owner = await add("Chủ M9", ["owner"]);
  manager = await add("Mai M9", ["manager", "barista"]);
  manager2 = await add("Minh M9", ["manager"]);
  barista = await add("Vy M9", ["barista"]);
  kitchen = await add("Tâm M9", ["kitchen"]);
  await wipe();
  await db.delete(t.orders).where(and(gte(t.orders.serviceDate, "2027-02-01"), lt(t.orders.serviceDate, "2027-05-01")));
});
afterAll(async () => {
  await wipe();
  await db.delete(t.staff).where(inArray(t.staff.id, [owner, manager, manager2, barista, kitchen].map((s) => s.id)));
  await closeDb();
});

describe("vào/ra ca", () => {
  it("vào ca: ghi giờ server + IP; chưa cấu hình Wi-Fi quán → không gắn cờ; bấm lại → đang trong ca", async () => {
    const res = await clockInCore({ ip: "1.1.1.1" }, ctx(barista, at("2027-02-05", "16:00")));
    expect(res).toEqual({ ok: true, at: at("2027-02-05", "16:00").toISOString(), offSite: false, closedForgotten: false });
    expect(await clockInCore({ ip: "1.1.1.1" }, ctx(barista, at("2027-02-05", "16:01")))).toEqual({ ok: false, reason: "clocked_in" });
    expect(await clockInCore({ ip: "1.1.1.1" }, ctx(owner, at("2027-02-05", "16:01")))).toEqual({ ok: false, reason: "forbidden" });
  });

  it("[Đây là Wi-Fi quán] chỉ owner/manager; giữ 5 IP gần nhất", async () => {
    expect(await markStoreIpCore({ ip: "9.9.9.9" }, ctx(barista, at("2027-02-05", "16:05")))).toEqual({ ok: false, reason: "forbidden" });
    expect(await markStoreIpCore({ ip: "unknown" }, ctx(manager, at("2027-02-05", "16:05")))).toEqual({ ok: false, reason: "invalid" });
    for (const ip of ["5.5.5.1", "5.5.5.2", "5.5.5.3", "5.5.5.4", "5.5.5.5", "1.1.1.1"]) {
      expect((await markStoreIpCore({ ip }, ctx(manager, at("2027-02-05", "16:05")))).ok).toBe(true);
    }
    const [row] = await db.select().from(t.settings).where(eq(t.settings.key, "ops"));
    expect((row.value as { storeIps: string[] }).storeIps).toEqual(["1.1.1.1", "5.5.5.5", "5.5.5.4", "5.5.5.3", "5.5.5.2"]);
    expect((row.value as { cashTolerance: number }).cashTolerance).toBe(20_000);
  });

  it("ra ca muộn > 15 phút so với lịch → late_out; IP lạ → off_site (gắn cờ, không chặn)", async () => {
    expect((await savePlanCore({ staffId: barista.id, date: "2027-02-05", start: "16:00", end: "22:00" }, ctx(manager, at("2027-02-05", "16:10")))).ok).toBe(true);
    const res = await clockOutCore({ ip: "2.2.2.2" }, ctx(barista, at("2027-02-05", "22:20")));
    expect(res).toEqual({ ok: true, minutes: 380, forgot: false, lateOut: true, offSite: true });
    expect(await clockOutCore({ ip: "1.1.1.1" }, ctx(barista, at("2027-02-05", "22:21")))).toEqual({ ok: false, reason: "not_clocked_in" });
    const [e] = await entriesOf(barista);
    expect(e).toMatchObject({ inIp: "1.1.1.1", outIp: "2.2.2.2", flags: ["off_site", "late_out"] });
  });

  it("bấm Vào ca hai lần cùng lúc chỉ ghi một lượt", async () => {
    const both = await Promise.all([1, 2].map(() => clockInCore({ ip: "1.1.1.1" }, ctx(kitchen, at("2027-02-05", "17:00")))));
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(both.find((r) => !r.ok)).toEqual({ ok: false, reason: "clocked_in" });
    expect((await clockOutCore({ ip: "1.1.1.1" }, ctx(kitchen, at("2027-02-05", "21:00")))).ok).toBe(true);
  });

  it("quên ra ca: cron gắn cờ forgot_out, 0 phút; vào ca hôm sau tự đóng lượt cũ", async () => {
    await clockInCore({ ip: "1.1.1.1" }, ctx(kitchen, at("2027-02-06", "17:00")));
    expect(await flagForgottenCore(at("2027-02-07", "02:00"), db)).toBeNull();
    const text = await flagForgottenCore(at("2027-02-07", "10:00"), db);
    expect(text).toContain("Tâm M9 · vào 17:00 06/02");
    const kit = await entriesOf(kitchen);
    expect(kit[1]).toMatchObject({ flags: ["forgot_out"] });
    expect(kit[1].clockOut).toEqual(kit[1].clockIn);

    await clockInCore({ ip: "1.1.1.1" }, ctx(barista, at("2027-02-06", "16:00")));
    expect(await clockInCore({ ip: "1.1.1.1" }, ctx(barista, at("2027-02-07", "16:00")))).toMatchObject({ ok: true, offSite: false, closedForgotten: true });
    // Ra ca lượt quên khi đã qua 03:00 → chỉ gắn cờ.
    expect(await clockOutCore({ ip: "1.1.1.1" }, ctx(barista, at("2027-02-08", "09:00")))).toEqual({ ok: true, minutes: 0, forgot: true, lateOut: false, offSite: false });
    expect((await entriesOf(barista)).map((e) => e.flags)).toEqual([["off_site", "late_out"], ["forgot_out"], ["forgot_out"]]);
  });
});

describe("sửa giờ & lịch ca", () => {
  it("quản lý sửa giờ nhân viên kèm lý do; bỏ cờ forgot_out, thêm edited, ghi ops_events", async () => {
    const [, forgot, forgot2] = await entriesOf(barista);
    const now = at("2027-02-08", "10:00");
    expect(await saveTimeEntryCore({ id: forgot.id, staffId: barista.id, clockIn: at("2027-02-06", "16:00"), clockOut: at("2027-02-06", "22:00"), reason: " " }, ctx(manager, now))).toEqual({
      ok: false,
      reason: "reason_required",
    });
    const res = await saveTimeEntryCore({ id: forgot.id, staffId: barista.id, clockIn: at("2027-02-06", "16:00"), clockOut: at("2027-02-06", "22:00"), reason: "Quên bấm ra ca" }, ctx(manager, now));
    expect(res).toEqual({ ok: true, id: forgot.id });
    await saveTimeEntryCore({ id: forgot2.id, staffId: barista.id, clockIn: at("2027-02-07", "16:00"), clockOut: at("2027-02-07", "21:00"), reason: "Quên bấm ra ca" }, ctx(manager, now));
    const rows = await entriesOf(barista);
    expect(rows[1]).toMatchObject({ flags: ["edited"], editReason: "Quên bấm ra ca" });
    const [ev] = await db.select().from(t.opsEvents).where(eq(t.opsEvents.type, "time_edited")).limit(1);
    expect(ev.data).toMatchObject({ entryId: forgot.id, reason: "Quên bấm ra ca", from: { in: forgot.clockIn.toISOString() } });
  });

  it("không ai sửa giờ của mình; giờ của quản lý do chủ quán; chồng lượt / giờ tương lai bị từ chối", async () => {
    const now = at("2027-02-08", "20:00");
    const mgrShift = { staffId: manager.id, clockIn: at("2027-02-08", "09:00"), clockOut: at("2027-02-08", "17:00"), reason: "Ca sáng" };
    expect(await saveTimeEntryCore(mgrShift, ctx(manager, now))).toEqual({ ok: false, reason: "forbidden" });
    expect(await saveTimeEntryCore(mgrShift, ctx(manager2, now))).toEqual({ ok: false, reason: "forbidden" });
    expect((await saveTimeEntryCore(mgrShift, ctx(owner, now))).ok).toBe(true);
    expect(await saveTimeEntryCore({ staffId: owner.id, clockIn: at("2027-02-08", "09:00"), clockOut: at("2027-02-08", "10:00"), reason: "Thử" }, ctx(owner, now))).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(
      await saveTimeEntryCore({ staffId: barista.id, clockIn: at("2027-02-05", "20:00"), clockOut: at("2027-02-05", "21:00"), reason: "Trùng" }, ctx(manager, now)),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await saveTimeEntryCore({ staffId: barista.id, clockIn: at("2027-02-08", "19:00"), clockOut: at("2027-02-08", "21:00"), reason: "Tương lai" }, ctx(manager, now)),
    ).toEqual({ ok: false, reason: "invalid" });
    // Ca sau giữa tháng (đơn giá mới từ 15/02).
    expect(
      (await saveTimeEntryCore({ staffId: barista.id, clockIn: at("2027-02-20", "16:00"), clockOut: at("2027-02-20", "22:00"), reason: "Nhập bù" }, ctx(manager, at("2027-02-21", "09:00")))).ok,
    ).toBe(true);
  });

  it("xác nhận cờ: bỏ off_site/late_out; lượt quên ra ca phải sửa giờ trước", async () => {
    const [first] = await entriesOf(barista);
    const now = at("2027-02-08", "20:00");
    expect(await reviewTimeEntryCore({ id: first.id }, ctx(barista, now))).toEqual({ ok: false, reason: "forbidden" });
    expect(await reviewTimeEntryCore({ id: first.id }, ctx(manager, now))).toEqual({ ok: true });
    expect((await entriesOf(barista))[0].flags).toEqual([]);
    const forgot = (await entriesOf(kitchen))[1];
    expect(await reviewTimeEntryCore({ id: forgot.id }, ctx(manager, now))).toEqual({ ok: false, reason: "unresolved" });
  });

  it("lịch ca: nhân viên không xếp được; chép tuần trước không đè ngày đã có", async () => {
    const now = at("2027-02-08", "10:00");
    expect(await savePlanCore({ staffId: barista.id, date: "2027-02-12", start: "16:00", end: "22:00" }, ctx(barista, now))).toEqual({ ok: false, reason: "forbidden" });
    expect(await savePlanCore({ staffId: barista.id, date: "2027-02-12", start: "22:00", end: "16:00" }, ctx(manager, now))).toEqual({ ok: false, reason: "invalid" });
    expect(await savePlanCore({ staffId: owner.id, date: "2027-02-12", start: "16:00", end: "22:00" }, ctx(manager, now))).toEqual({ ok: false, reason: "not_found" });
    await savePlanCore({ staffId: kitchen.id, date: "2027-02-06", start: "17:00", end: "21:00" }, ctx(manager, now));
    await savePlanCore({ staffId: barista.id, date: "2027-02-12", start: "17:00", end: "22:00" }, ctx(manager, now));
    const copied = await copyLastWeekCore({ week: "2027-02-10" }, ctx(manager, now)); // tuần 08–14/02 ← 01–07/02
    expect(copied).toEqual({ ok: true, count: 1 }); // 12/02 của Vy đã có lịch → giữ; 13/02 của Tâm được chép
    const plans = await db.select().from(t.shiftPlans).where(eq(t.shiftPlans.staffId, barista.id)).orderBy(t.shiftPlans.date);
    expect(plans.map((p) => [p.date, p.start])).toEqual([
      ["2027-02-05", "16:00:00"],
      ["2027-02-12", "17:00:00"],
    ]);
    expect(await savePlanCore({ staffId: barista.id, date: "2027-02-12", start: null, end: null }, ctx(manager, now))).toEqual({ ok: true });
    expect(await copyLastWeekCore({ week: "2027-03-29" }, ctx(manager, now))).toEqual({ ok: true, count: 0 });
  });
});

describe("bảng công: gửi → xác nhận PIN → khoá", () => {
  it("ngày lễ chỉ chủ quán nhập", async () => {
    expect(await saveHolidayCore({ date: "2027-02-06", name: "Tết", multiplier: 3 }, ctx(manager, MAR_2))).toEqual({ ok: false, reason: "forbidden" });
    expect(await saveHolidayCore({ date: "2027-02-06", name: "Mùng 1 Tết", multiplier: 3 }, ctx(owner, MAR_2))).toEqual({ ok: true });
    await saveHolidayCore({ date: "2027-02-09", name: "Tạm", multiplier: 2, remove: false }, ctx(owner, MAR_2));
    await saveHolidayCore({ date: "2027-02-09", name: "Tạm", multiplier: 2, remove: true }, ctx(owner, MAR_2));
    expect(await db.$count(t.holidays)).toBe(1);
  });

  it("tháng chưa hết không gửi được; còn lượt quên ra ca → phải sửa trước", async () => {
    expect(await submitTimesheetCore({ staffId: barista.id, period: FEB }, ctx(manager, at("2027-02-28", "23:00")))).toEqual({ ok: false, reason: "period_open" });
    expect(await submitTimesheetCore({ staffId: kitchen.id, period: FEB }, ctx(manager, MAR_2))).toEqual({ ok: false, reason: "unresolved" });
    const forgot = (await entriesOf(kitchen))[1];
    await saveTimeEntryCore({ id: forgot.id, staffId: kitchen.id, clockIn: forgot.clockIn, clockOut: at("2027-02-06", "21:30"), reason: "Ra 21:30" }, ctx(manager, MAR_2));
    expect(await submitTimesheetCore({ staffId: kitchen.id, period: FEB }, ctx(manager, MAR_2))).toEqual({ ok: true });
  });

  it("quản lý không tự gửi bảng công của mình; của quản lý do chủ quán gửi", async () => {
    expect(await submitTimesheetCore({ staffId: manager.id, period: FEB }, ctx(manager, MAR_2))).toEqual({ ok: false, reason: "forbidden" });
    expect(await submitTimesheetCore({ staffId: manager.id, period: FEB }, ctx(manager2, MAR_2))).toEqual({ ok: false, reason: "forbidden" });
    expect(await submitTimesheetCore({ staffId: manager.id, period: FEB }, ctx(owner, MAR_2))).toEqual({ ok: true });
    expect(await submitTimesheetCore({ staffId: barista.id, period: FEB }, ctx(manager, MAR_2))).toEqual({ ok: true });
    expect(await submitTimesheetCore({ staffId: barista.id, period: FEB }, ctx(manager, MAR_2))).toEqual({ ok: false, reason: "locked" });
  });

  it("snapshot đúng giờ: lễ Tết, đêm, đi muộn; hash = sha256(snapshot)", async () => {
    const [ts] = await db.select().from(t.timesheets).where(and(eq(t.timesheets.staffId, barista.id), eq(t.timesheets.period, FEB)));
    // 05/02 16:00–22:20 (380) + 06/02 Tết 16:00–22:00 (360) + 07/02 16:00–21:00 (300) + 20/02 (360)
    expect(ts).toMatchObject({ status: "submitted", minutes: 1400, holidayMinutes: 360, nightMinutes: 20, overtimeMinutes: 0, lateCount: 0, submittedBy: manager.id });
    expect(ts.snapshotHash).toBe(createHash("sha256").update(canonicalJson(ts.snapshot)).digest("hex"));
  });

  it("xác nhận cần đúng PIN của chính mình; xác nhận xong thì khoá giờ công cả kỳ", async () => {
    const ack = { period: FEB, ip: "1.1.1.1", device: "iPhone" } as const;
    expect(await ackTimesheetCore({ ...ack, pin: "000000" }, ctx(barista, MAR_2))).toEqual({ ok: false, reason: "wrong_pin" });
    expect(await ackTimesheetCore({ ...ack, pin: PIN }, ctx(manager2, MAR_2))).toEqual({ ok: false, reason: "not_found" });
    expect(await ackTimesheetCore({ ...ack, pin: PIN }, ctx(barista, MAR_2))).toEqual({ ok: true });
    expect(await ackTimesheetCore({ ...ack, pin: PIN }, ctx(barista, MAR_2))).toEqual({ ok: false, reason: "locked" });
    const [ts] = await db.select().from(t.timesheets).where(and(eq(t.timesheets.staffId, barista.id), eq(t.timesheets.period, FEB)));
    expect(ts).toMatchObject({ status: "acknowledged", ackIp: "1.1.1.1", ackDevice: "iPhone" });

    const [first] = await entriesOf(barista);
    expect(await saveTimeEntryCore({ id: first.id, staffId: barista.id, clockIn: first.clockIn, clockOut: at("2027-02-05", "22:00"), reason: "Sửa" }, ctx(manager, MAR_2))).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(await saveTimeEntryCore({ staffId: barista.id, clockIn: at("2027-02-25", "16:00"), clockOut: at("2027-02-25", "17:00"), reason: "Thêm" }, ctx(owner, MAR_2))).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(await reviewTimeEntryCore({ id: first.id }, ctx(manager, MAR_2))).toEqual({ ok: false, reason: "locked" });
    expect(await disputeTimesheetCore({ period: FEB, reason: "Muốn sửa" }, ctx(barista, MAR_2))).toEqual({ ok: false, reason: "locked" });
  });

  it("'Chưa đồng ý' + lý do → về nháp; gửi lại rồi xác nhận", async () => {
    expect(await disputeTimesheetCore({ period: FEB, reason: "" }, ctx(kitchen, MAR_2))).toEqual({ ok: false, reason: "reason_required" });
    const res = await disputeTimesheetCore({ period: FEB, reason: "Thiếu ca 06/02" }, ctx(kitchen, MAR_2));
    expect(res.ok && res.telegram).toContain("Tâm M9 chưa đồng ý bảng công tháng 02/2027");
    const [ts] = await db.select().from(t.timesheets).where(and(eq(t.timesheets.staffId, kitchen.id), eq(t.timesheets.period, FEB)));
    expect(ts).toMatchObject({ status: "draft", snapshot: null, disputeReason: "Thiếu ca 06/02" });
    expect(await submitTimesheetCore({ staffId: kitchen.id, period: FEB }, ctx(manager, MAR_2))).toEqual({ ok: true });
    for (const who of [kitchen, manager]) expect(await ackTimesheetCore({ period: FEB, pin: PIN, ip: "1.1.1.1", device: "x" }, ctx(who, MAR_2))).toEqual({ ok: true });
  });
});

describe("DTO: quản lý không thấy tiền lương", () => {
  it("màn Công của quản lý: chỉ người mình quản lý, không có trường tiền", async () => {
    const v = await loadTimeView(manager, MAR_2, { ip: "1.1.1.1", period: FEB }, db);
    expect(v.manage).not.toBeNull();
    expect(v.manage!.timesheets.map((r) => r.name).sort()).toEqual(["Tâm M9", "Vy M9"]);
    expect(v.manage!.entries.every((e) => e.staffId !== manager.id)).toBe(true);
    expect(moneyKeys(v.manage)).toEqual([]);
    expect(v.me.payslips).toEqual([]);
    expect(v.atStore).toBe(true);
    expect(await loadPayrollView(manager, MAR_2, {}, db)).toBeNull();
    expect(await loadPayrollView(barista, MAR_2, {}, db)).toBeNull();
  });

  it("nhân viên: không có phần quản lý; thấy bảng công của mình", async () => {
    const v = await loadTimeView(barista, at("2027-03-02", "10:00"), { ip: "8.8.8.8" }, db);
    expect(v.manage).toBeNull();
    expect(v.atStore).toBe(false);
    expect(v.me.timesheets).toHaveLength(1);
    expect(v.me.timesheets[0]).toMatchObject({ period: FEB, status: "acknowledged", totals: { minutes: 1400 } });
  });
});

describe("lương (chỉ chủ quán)", () => {
  it("đơn giá: chỉ owner, không dưới lương tối thiểu giờ, có lịch sử", async () => {
    expect(await savePayRateCore({ staffId: barista.id, hourlyRate: 25_000, effectiveFrom: "2027-01-01" }, ctx(manager, MAR_2))).toEqual({ ok: false, reason: "forbidden" });
    expect(await savePayRateCore({ staffId: barista.id, hourlyRate: 19_999, effectiveFrom: "2027-01-01" }, ctx(owner, MAR_2))).toEqual({ ok: false, reason: "below_min" });
    expect(await savePayRateCore({ staffId: owner.id, hourlyRate: 30_000, effectiveFrom: "2027-01-01" }, ctx(owner, MAR_2))).toEqual({ ok: false, reason: "not_found" });
    for (const [who, rate, from] of [
      [barista, 20_000, "2027-01-01"],
      [barista, 25_000, "2027-02-15"],
      [manager, 30_000, "2027-01-01"],
    ] as const)
      expect(await savePayRateCore({ staffId: who.id, hourlyRate: rate, effectiveFrom: from }, ctx(owner, MAR_2))).toEqual({ ok: true });
  });

  it("thiếu đơn giá → không tạo phiếu; tháng chưa hết → chưa tạo được", async () => {
    expect(await buildPayslipsCore({ period: FEB }, ctx(manager, MAR_2))).toEqual({ ok: false, reason: "forbidden" });
    expect(await buildPayslipsCore({ period: "2027-03" }, ctx(owner, MAR_2))).toEqual({ ok: false, reason: "period_open" });
    expect(await buildPayslipsCore({ period: FEB }, ctx(owner, MAR_2))).toEqual({ ok: false, reason: "missing_rate" });
    await savePayRateCore({ staffId: kitchen.id, hourlyRate: 22_000, effectiveFrom: "2027-02-01" }, ctx(owner, MAR_2));
  });

  it("phiếu lương: giờ thường theo 2 đơn giá, lễ ×3, đêm 30%, quỹ 1% chia theo giờ, tuân thủ", async () => {
    // Doanh thu café tháng 2: 30.000.000đ; ca do Vy đóng lệch 30.000đ (> 20.000đ → trượt tuân thủ két).
    const [shift] = await db
      .insert(t.shifts)
      .values({ serviceDate: "2027-02-05", status: "closed", openedBy: barista.id, openedAt: at("2027-02-05", "16:00"), closedBy: barista.id, closedAt: at("2027-02-05", "22:00"), cafeCash: 20_000_000, cafeTransfer: 10_000_000, cafeOther: 0 })
      .returning();
    await db.insert(t.cashEntries).values({ box: "register", kind: "close", shiftId: shift.id, counts: {}, total: 470_000, expected: 500_000, staffId: barista.id });

    const res = await buildPayslipsCore({ period: FEB }, ctx(owner, MAR_2));
    expect(res).toEqual({ ok: true, count: 3, waiting: 0 });
    const view = (await loadPayrollView(owner, MAR_2, {}, db))!;
    expect(view.period).toBe(FEB);
    expect(view.revenue).toEqual({ pizza: 0, cafe: 30_000_000, total: 30_000_000, pool: 300_000 });
    const vy = view.payslips.find((p) => p.staffId === barista.id)!;
    expect(vy.lines.map((l) => [l.kind, l.rate ?? null, l.minutes ?? null, l.amount])).toEqual([
      ["base", 20_000, 1040, 346_667],
      ["night", 20_000, 20, 2_000],
      ["holiday", 20_000, 360, 240_000],
      ["base", 25_000, 360, 150_000],
      ["revenue_bonus", null, 1400, expect.any(Number)],
      ["compliance_bonus", null, null, 0],
    ]);
    expect(vy.meta.misses).toEqual(expect.arrayContaining(["cash"]));
    const bonusSum = view.payslips.reduce((n, p) => n + p.lines.find((l) => l.kind === "revenue_bonus")!.amount, 0);
    expect(bonusSum).toBe(300_000);
    expect(vy.total).toBe(vy.lines.reduce((n, l) => n + l.amount, 0));
  });

  it("owner sửa thưởng tuân thủ & điều chỉnh (cần ghi chú) → duyệt → trả → nhân viên bấm Đã nhận", async () => {
    const view = (await loadPayrollView(owner, MAR_2, {}, db))!;
    const vy = view.payslips.find((p) => p.staffId === barista.id)!;
    expect(await editPayslipCore({ id: vy.id, compliance: true, adjustment: -50_000, adjustmentNote: "" }, ctx(owner, MAR_2))).toEqual({ ok: false, reason: "reason_required" });
    expect(await editPayslipCore({ id: vy.id, compliance: true, adjustment: -50_000, adjustmentNote: "Làm vỡ ly" }, ctx(manager, MAR_2))).toEqual({ ok: false, reason: "forbidden" });
    expect(await editPayslipCore({ id: vy.id, compliance: true, adjustment: -50_000, adjustmentNote: "Làm vỡ ly" }, ctx(owner, MAR_2))).toEqual({ ok: true });
    const [after] = await db.select().from(t.payslips).where(eq(t.payslips.id, vy.id));
    expect(after.total).toBe(vy.total + 300_000 - 50_000);
    expect(after.lines.at(-1)).toEqual({ kind: "adjustment", label: "Điều chỉnh: Làm vỡ ly", amount: -50_000 });

    expect(await advancePayslipCore({ id: vy.id, to: "paid", method: "bank" }, ctx(owner, MAR_2))).toEqual({ ok: false, reason: "locked" });
    expect(await advancePayslipCore({ id: vy.id, to: "approved" }, ctx(owner, MAR_2))).toEqual({ ok: true });
    expect(await editPayslipCore({ id: vy.id, compliance: false, adjustment: 0, adjustmentNote: "" }, ctx(owner, MAR_2))).toEqual({ ok: false, reason: "locked" });
    // Tính lại không đụng phiếu đã duyệt; đơn giá mới cho kỳ đã duyệt bị khoá.
    await buildPayslipsCore({ period: FEB }, ctx(owner, MAR_2));
    expect((await db.select().from(t.payslips).where(eq(t.payslips.id, vy.id)))[0].total).toBe(after.total);
    expect(await savePayRateCore({ staffId: barista.id, hourlyRate: 30_000, effectiveFrom: "2027-02-20" }, ctx(owner, MAR_2))).toEqual({ ok: false, reason: "locked" });

    const mine = await loadTimeView(barista, MAR_2, { ip: "1.1.1.1" }, db);
    expect(mine.me.payslips).toEqual([expect.objectContaining({ id: vy.id, status: "approved", total: after.total, received: false })]);
    // Quản lý chỉ thấy phiếu của chính mình (chưa duyệt → không thấy gì).
    expect((await loadTimeView(manager, MAR_2, { ip: "1.1.1.1" }, db)).me.payslips).toEqual([]);

    expect(await ackPayslipCore({ id: vy.id }, ctx(barista, MAR_2))).toEqual({ ok: false, reason: "not_found" });
    expect(await advancePayslipCore({ id: vy.id, to: "paid", method: "cash" }, ctx(owner, at("2027-03-05", "10:00")))).toEqual({ ok: true });
    expect(await ackPayslipCore({ id: vy.id }, ctx(kitchen, MAR_2))).toEqual({ ok: false, reason: "not_found" });
    expect(await ackPayslipCore({ id: vy.id }, ctx(barista, at("2027-03-05", "11:00")))).toEqual({ ok: true });
    expect(await ackPayslipCore({ id: vy.id }, ctx(barista, at("2027-03-05", "11:00")))).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("cron bảng công & lương", () => {
  it("ngày 1 tạo bảng công nháp + nhắc một lần; ngày 3 nhắc ai chưa xác nhận; ngày trả lương nhắc trả; gắn cờ quên ra ca", async () => {
    await saveTimeEntryCore({ staffId: barista.id, clockIn: at("2027-03-10", "16:00"), clockOut: at("2027-03-10", "22:00"), reason: "Nhập" }, ctx(manager, at("2027-03-11", "10:00")));
    await clockInCore({ ip: "1.1.1.1" }, ctx(kitchen, at("2027-03-31", "20:00")));
    const sent: string[] = [];
    const send = async (s: string) => {
      sent.push(s);
      return true;
    };
    expect(await runPayrollCron(at("2027-04-01", "15:45"), send, db)).toEqual({ forgotSent: true, reminder: "draft" });
    expect(sent[0]).toContain("Quên ra ca");
    expect(sent[1]).toContain("Bảng công tháng 03/2027 đã sẵn sàng (2 người)");
    expect(await db.$count(t.timesheets, eq(t.timesheets.period, "2027-03"))).toBe(2);
    expect(await runPayrollCron(at("2027-04-01", "16:00"), send, db)).toEqual({ forgotSent: false, reminder: null });
    expect(sent).toHaveLength(2);

    expect((await runPayrollCron(at("2027-04-03", "15:45"), send, db)).reminder).toBe("remind");
    expect(sent.at(-1)).toBe("⏳ Chưa xác nhận bảng công tháng 03/2027: Tâm M9, Vy M9.");
    expect((await runPayrollCron(at("2027-04-05", "15:45"), send, db)).reminder).toBe("payday");
    expect(sent.at(-1)).toContain("0 phiếu chưa trả, 2 người chưa có phiếu");
    expect((await runPayrollCron(at("2027-04-05", "16:00"), send, db)).reminder).toBeNull();
  });
});
