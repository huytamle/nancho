import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vnInstant, type ISODate } from "@/lib/domain/time";
import { closeDb, getDb } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import type { OpsActor } from "@/lib/server/dal/ops";
import { cancelShiftRequestCore, decideShiftCore, loadShifts, requestShiftCore, respondShiftCore } from "@/lib/server/dal/shifts";
import { upsertStaff } from "@/lib/server/dal/staff";

// Đăng ký / nhường / xin nghỉ ca: nhân viên đề nghị, quản lý duyệt, lịch chỉ đổi khi duyệt.

const db = getDb();
const NOW = vnInstant("2027-03-01" as ISODate, "09:00");
const D1 = "2027-03-05" as ISODate;
const D2 = "2027-03-06" as ISODate;
let owner: OpsActor, mgr: OpsActor, vy: OpsActor, tam: OpsActor;

async function add(name: string, roles: OpsActor["roles"]): Promise<OpsActor> {
  return { id: await upsertStaff({ name, roles, pin: "246810" }, db), name, roles };
}
const ctx = (actor: OpsActor, now = NOW) => ({ actor, now });
const plans = (who: OpsActor) => db.select().from(t.shiftPlans).where(eq(t.shiftPlans.staffId, who.id));
const wipe = async () => {
  await db.delete(t.shiftRequests);
  await db.delete(t.shiftPlans).where(inArray(t.shiftPlans.staffId, [mgr, vy, tam].map((s) => s.id)));
};

beforeAll(async () => {
  owner = await add("Chủ S", ["owner"]);
  mgr = await add("Mai S", ["manager", "barista"]);
  vy = await add("Vy S", ["barista"]);
  tam = await add("Tâm S", ["kitchen"]);
  await wipe();
});
afterAll(async () => {
  await wipe();
  await db.delete(t.staff).where(inArray(t.staff.id, [owner, mgr, vy, tam].map((s) => s.id)));
  await closeDb();
});

describe("đăng ký ca", () => {
  it("đề nghị → chưa đổi lịch; quản lý duyệt mới ghi lịch; không tự duyệt", async () => {
    expect((await requestShiftCore({ kind: "claim", date: D1, start: "08:00", end: "15:30" }, ctx(vy))).ok).toBe(true);
    expect(await plans(vy)).toHaveLength(0);
    // trùng đề nghị đang chờ
    expect(await requestShiftCore({ kind: "claim", date: D1, start: "09:00", end: "12:00" }, ctx(vy))).toEqual({ ok: false, reason: "duplicate" });
    const [r] = await db.select().from(t.shiftRequests);
    expect(await decideShiftCore({ id: r.id, approve: true }, ctx(vy))).toEqual({ ok: false, reason: "forbidden" });
    expect(await decideShiftCore({ id: r.id, approve: true }, ctx(tam))).toEqual({ ok: false, reason: "forbidden" });
    expect((await decideShiftCore({ id: r.id, approve: true }, ctx(mgr))).ok).toBe(true);
    expect((await plans(vy)).map((p) => [p.date, p.start.slice(0, 5), p.end.slice(0, 5)])).toEqual([[D1, "08:00", "15:30"]]);
    // duyệt lần hai → đã xử lý
    expect(await decideShiftCore({ id: r.id, approve: true }, ctx(mgr))).toEqual({ ok: false, reason: "too_late" });
  });

  it("kiểm tra đầu vào: ngày đã qua, giờ ngược, đã có ca, chủ quán không đăng ký", async () => {
    expect(await requestShiftCore({ kind: "claim", date: "2027-02-28" as ISODate, start: "08:00", end: "12:00" }, ctx(vy))).toEqual({ ok: false, reason: "too_late" });
    expect(await requestShiftCore({ kind: "claim", date: D2, start: "12:00", end: "08:00" }, ctx(vy))).toEqual({ ok: false, reason: "invalid" });
    expect(await requestShiftCore({ kind: "claim", date: D1, start: "08:00", end: "12:00" }, ctx(vy))).toEqual({ ok: false, reason: "conflict" });
    expect(await requestShiftCore({ kind: "claim", date: D2, start: "08:00", end: "12:00" }, ctx(owner))).toEqual({ ok: false, reason: "forbidden" });
  });

  it("từ chối → lịch không đổi; rút lại đề nghị của chính mình", async () => {
    await requestShiftCore({ kind: "claim", date: D2, start: "13:30", end: "20:00" }, ctx(vy));
    const [r] = await db.select().from(t.shiftRequests).where(eq(t.shiftRequests.date, D2));
    expect((await decideShiftCore({ id: r.id, approve: false }, ctx(owner))).ok).toBe(true);
    expect(await plans(vy)).toHaveLength(1);
    await requestShiftCore({ kind: "claim", date: D2, start: "13:30", end: "20:00" }, ctx(vy));
    const [r2] = await db.select().from(t.shiftRequests).where(eq(t.shiftRequests.status, "pending"));
    expect(await cancelShiftRequestCore({ id: r2.id }, ctx(tam))).toEqual({ ok: false, reason: "not_found" });
    expect((await cancelShiftRequestCore({ id: r2.id }, ctx(vy))).ok).toBe(true);
    expect(await cancelShiftRequestCore({ id: r2.id }, ctx(vy))).toEqual({ ok: false, reason: "too_late" });
  });
});

describe("nhường ca & xin nghỉ", () => {
  it("nhường cho người chỉ định: người đó nhận → quản lý duyệt → ca chuyển sang người nhận", async () => {
    await wipe();
    await db.insert(t.shiftPlans).values({ staffId: vy.id, date: D1, start: "08:00", end: "15:30" });
    expect(await requestShiftCore({ kind: "give", date: D2, targetId: tam.id }, ctx(vy))).toEqual({ ok: false, reason: "not_found" }); // không có ca ngày đó
    expect((await requestShiftCore({ kind: "give", date: D1, targetId: tam.id }, ctx(vy))).ok).toBe(true);
    const [r] = await db.select().from(t.shiftRequests);
    expect(r.status).toBe("open");
    // người khác (không phải người được chỉ định) không nhận được; quản lý chưa duyệt được khi chưa có người nhận
    expect(await respondShiftCore({ id: r.id, accept: true }, ctx(mgr))).toEqual({ ok: false, reason: "too_late" });
    expect(await decideShiftCore({ id: r.id, approve: true }, ctx(owner))).toEqual({ ok: false, reason: "too_late" });
    expect((await loadShifts(tam, NOW, db)).offers.map((o) => o.id)).toEqual([r.id]);
    expect((await respondShiftCore({ id: r.id, accept: true }, ctx(tam))).ok).toBe(true);
    expect((await loadShifts(owner, NOW, db)).review.map((o) => o.id)).toEqual([r.id]);
    expect((await loadShifts(vy, NOW, db)).review).toEqual([]); // không tự duyệt
    expect((await decideShiftCore({ id: r.id, approve: true }, ctx(mgr))).ok).toBe(true);
    expect(await plans(vy)).toHaveLength(0);
    expect((await plans(tam)).map((p) => [p.date, p.start.slice(0, 5)])).toEqual([[D1, "08:00"]]);
  });

  it("nhường cho ai cũng được: ai nhận trước thì thành người nhận; người đã có ca ngày đó → conflict", async () => {
    await wipe();
    await db.insert(t.shiftPlans).values([
      { staffId: vy.id, date: D1, start: "08:00", end: "15:30" },
      { staffId: tam.id, date: D1, start: "16:00", end: "22:00" },
    ]);
    await requestShiftCore({ kind: "give", date: D1 }, ctx(vy));
    const [r] = await db.select().from(t.shiftRequests);
    expect(await respondShiftCore({ id: r.id, accept: true }, ctx(vy))).toEqual({ ok: false, reason: "too_late" }); // không tự nhận
    expect(await respondShiftCore({ id: r.id, accept: true }, ctx(tam))).toEqual({ ok: false, reason: "conflict" });
    expect(await respondShiftCore({ id: r.id, accept: false }, ctx(mgr))).toEqual({ ok: false, reason: "forbidden" }); // đề nghị mở: không có "từ chối"
    expect((await respondShiftCore({ id: r.id, accept: true }, ctx(mgr))).ok).toBe(true);
    const [after] = await db.select().from(t.shiftRequests);
    expect([after.status, after.targetId]).toEqual(["pending", mgr.id]);
  });

  it("người được chỉ định từ chối → đề nghị đóng, lịch giữ nguyên", async () => {
    await wipe();
    await db.insert(t.shiftPlans).values({ staffId: vy.id, date: D1, start: "08:00", end: "15:30" });
    await requestShiftCore({ kind: "give", date: D1, targetId: tam.id }, ctx(vy));
    const [r] = await db.select().from(t.shiftRequests);
    expect((await respondShiftCore({ id: r.id, accept: false }, ctx(tam))).ok).toBe(true);
    expect((await db.select().from(t.shiftRequests))[0].status).toBe("rejected");
    expect(await plans(vy)).toHaveLength(1);
  });

  it("xin nghỉ: duyệt thì xoá ca; lịch đổi giữa chừng → conflict, đề nghị vẫn chờ", async () => {
    await wipe();
    await db.insert(t.shiftPlans).values({ staffId: vy.id, date: D1, start: "08:00", end: "15:30" });
    await requestShiftCore({ kind: "leave", date: D1, note: "Việc nhà" }, ctx(vy));
    const [r] = await db.select().from(t.shiftRequests);
    expect(r.note).toBe("Việc nhà");
    await db.delete(t.shiftPlans).where(eq(t.shiftPlans.staffId, vy.id)); // quản lý đã xoá ca bằng tay
    expect(await decideShiftCore({ id: r.id, approve: true }, ctx(mgr))).toEqual({ ok: false, reason: "conflict" });
    expect((await db.select().from(t.shiftRequests))[0].status).toBe("pending");
    await db.insert(t.shiftPlans).values({ staffId: vy.id, date: D1, start: "08:00", end: "15:30" });
    expect((await decideShiftCore({ id: r.id, approve: true }, ctx(mgr))).ok).toBe(true);
    expect(await plans(vy)).toHaveLength(0);
  });

  it("duyệt song song một đề nghị chỉ áp một lần; quản lý không tự duyệt đề nghị của mình", async () => {
    await wipe();
    await requestShiftCore({ kind: "claim", date: D1, start: "08:00", end: "12:00" }, ctx(mgr));
    const [mine] = await db.select().from(t.shiftRequests);
    expect(await decideShiftCore({ id: mine.id, approve: true }, ctx(mgr))).toEqual({ ok: false, reason: "self_review" });
    const results = await Promise.all([decideShiftCore({ id: mine.id, approve: true }, ctx(owner)), decideShiftCore({ id: mine.id, approve: true }, ctx(owner))]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await plans(mgr)).toHaveLength(1);
  });
});
