import { describe, expect, it } from "vitest";
import { computeOvenStatus, slotsForDay, upcomingSlots } from "@/lib/domain/oven-status";
import { vnInstant, type ISODate } from "@/lib/domain/time";
import type { Batch, ServiceDay } from "@/lib/domain/types";

const TODAY: ISODate = "2026-11-06"; // Thứ Sáu
const settings = { closingSoonMin: 45, fewThreshold: 2 };
let nextId = 1;

function b(date: ISODate, ready: string, over: Partial<Batch> = {}): Batch {
  const readyAt = vnInstant(date, ready);
  return {
    id: nextId++,
    serviceDate: date,
    readyAt,
    ovenAt: new Date(readyAt.getTime() - 20 * 60_000),
    cutoffAt: vnInstant(date, "15:30"),
    capPan: 4,
    capBbq: 4,
    usedPan: 0,
    usedBbq: 0,
    status: "open",
    ...over,
  };
}

const day = (date: ISODate, batches: Batch[], over: Partial<ServiceDay> = {}): ServiceDay => ({
  date,
  status: "open",
  batches,
  ...over,
});
const threeBatches = (date: ISODate, over: Partial<Batch>[] = []) =>
  ["17:00", "18:00", "19:00"].map((t, i) => b(date, t, over[i]));

const at = (hhmm: string, date: ISODate = TODAY) => vnInstant(date, hhmm);
const status = (now: Date, days: ServiceDay[]) => computeOvenStatus({ now, days, settings });

const week = () => [
  day(TODAY, threeBatches(TODAY)),
  day("2026-11-07", threeBatches("2026-11-07")),
  day("2026-11-08", threeBatches("2026-11-08")),
];

describe("computeOvenStatus", () => {
  it("open: còn xa giờ chốt", () => {
    const s = status(at("13:00"), week());
    expect(s).toMatchObject({ kind: "open", date: TODAY, batchIndex: 1, nextCutoffAt: at("15:30").toISOString() });
    if (s.kind !== "open") throw new Error();
    expect(s.slots.map((x) => [x.readyLabel, x.level, x.remainingPan])).toEqual([
      ["17:00", "plenty", 4],
      ["18:00", "plenty", 4],
      ["19:00", "plenty", 4],
    ]);
    expect(s.upcoming).toEqual([
      { date: "2026-11-06", label: "Tối nay", hasCapacity: true },
      { date: "2026-11-07", label: "Mai", hasCapacity: true },
      { date: "2026-11-08", label: "CN 08/11", hasCapacity: true },
    ]);
  });

  it("closing_soon: biên đúng 45 phút", () => {
    expect(status(new Date(at("14:45").getTime() - 1000), week()).kind).toBe("open");
    expect(status(at("14:45"), week()).kind).toBe("closing_soon");
    expect(status(at("15:29"), week()).kind).toBe("closing_soon");
  });

  it("after_cutoff: đúng giây chốt sổ", () => {
    const s = status(at("15:30"), week());
    expect(s).toEqual({
      kind: "after_cutoff",
      date: TODAY,
      nextOpenDate: "2026-11-07",
      upcoming: [
        { date: "2026-11-06", label: "Tối nay", hasCapacity: false },
        { date: "2026-11-07", label: "Mai", hasCapacity: true },
        { date: "2026-11-08", label: "CN 08/11", hasCapacity: true },
      ],
    });
  });

  it("mức suất: few / last / bbq_only / full / closed", () => {
    const days = [
      day(TODAY, [
        b(TODAY, "17:00", { usedPan: 2 }),
        b(TODAY, "18:00", { usedPan: 3 }),
        b(TODAY, "19:00", { usedPan: 4, usedBbq: 1 }),
        b(TODAY, "20:00", { usedPan: 4, usedBbq: 4 }),
        b(TODAY, "21:00", { status: "closed" }),
      ]),
    ];
    const s = status(at("10:00"), days);
    if (s.kind !== "open") throw new Error(s.kind);
    expect(s.slots.map((x) => x.level)).toEqual(["few", "last", "bbq_only", "full", "closed"]);
    expect(s.slots[2]).toMatchObject({ remainingPan: 0, remainingBbq: 3 });
  });

  it("không trả số âm khi dữ liệu vượt sức chứa", () => {
    const [slot] = slotsForDay(day(TODAY, [b(TODAY, "17:00", { usedPan: 6, usedBbq: 5 })]), at("10:00"), settings);
    expect(slot).toMatchObject({ remainingPan: 0, remainingBbq: 0, level: "full" });
  });

  it("sold_out: mọi mẻ kín → gợi ý ngày gần nhất còn suất", () => {
    const full = { usedPan: 4, usedBbq: 4 };
    const days = [
      day(TODAY, threeBatches(TODAY, [full, full, full])),
      day("2026-11-07", threeBatches("2026-11-07", [full, full, full])),
      day("2026-11-08", threeBatches("2026-11-08")),
    ];
    const s = status(at("12:00"), days);
    expect(s).toMatchObject({ kind: "sold_out", nextOpenDate: "2026-11-08" });
    if (s.kind !== "sold_out") throw new Error();
    expect(s.slots).toHaveLength(3);
    expect(s.upcoming.map((t) => t.hasCapacity)).toEqual([false, false, true]);
  });

  it("chỉ còn BBQ vẫn là đang nhận (không phải kín lò)", () => {
    const s = status(at("12:00"), [day(TODAY, [b(TODAY, "17:00", { usedPan: 4 })])]);
    expect(s.kind).toBe("open");
  });

  it("batchIndex trỏ tới mẻ còn suất có giờ chốt sớm nhất", () => {
    const days = [
      day(TODAY, [
        b(TODAY, "17:00", { usedPan: 4, usedBbq: 4, cutoffAt: at("14:00") }),
        b(TODAY, "18:00", { cutoffAt: at("16:30") }),
        b(TODAY, "19:00", { cutoffAt: at("15:00") }),
      ]),
    ];
    const s = status(at("12:00"), days);
    expect(s).toMatchObject({ kind: "open", batchIndex: 3, nextCutoffAt: at("15:00").toISOString() });
  });

  it("day_off: không có ngày hôm nay / ngày nghỉ / không có mẻ", () => {
    const rest = week().slice(1);
    expect(status(at("10:00"), rest)).toMatchObject({ kind: "day_off", nextOpenDate: "2026-11-07" });
    expect(status(at("10:00"), [day(TODAY, threeBatches(TODAY), { status: "closed" }), ...rest])).toMatchObject({
      kind: "day_off",
    });
    expect(status(at("10:00"), [day(TODAY, []), ...rest]).kind).toBe("day_off");
    expect(status(at("10:00"), []).kind === "day_off" && status(at("10:00"), [])).toMatchObject({
      nextOpenDate: null,
      upcoming: [],
    });
  });

  it("paused: hiện lời nhắn của chủ quán", () => {
    const s = status(at("10:00"), [day(TODAY, threeBatches(TODAY), { status: "paused", pauseMessage: "Mất điện" })]);
    expect(s).toMatchObject({ kind: "paused", message: "Mất điện" });
    expect(
      status(at("10:00"), [day(TODAY, threeBatches(TODAY), { status: "paused" })]),
    ).toMatchObject({ kind: "paused", message: "" });
  });

  it("bỏ qua ngày đã qua, sắp xếp ngày, ẩn ngày nghỉ khỏi tab", () => {
    const days = [
      day("2026-11-08", threeBatches("2026-11-08")),
      day("2026-11-07", threeBatches("2026-11-07"), { status: "closed" }),
      day("2026-11-05", threeBatches("2026-11-05")),
      day(TODAY, threeBatches(TODAY)),
    ];
    const s = status(at("10:00"), days);
    expect(s.upcoming.map((t) => t.date)).toEqual(["2026-11-06", "2026-11-08"]);
  });

  it("dùng giờ VN: 23:00 UTC ngày 05 đã là sáng 06 ở VN", () => {
    const s = status(new Date("2026-11-05T23:00:00Z"), week());
    expect(s).toMatchObject({ kind: "open", date: TODAY });
  });
});

describe("upcomingSlots", () => {
  it("bỏ ngày nghỉ/tạm ngưng/đã qua và ngày đã chốt hết; giữ nhãn ngày", () => {
    const days = [
      day("2026-11-05", [b("2026-11-05", "17:00")]),
      day(TODAY, [b(TODAY, "17:00")]),
      day("2026-11-07", [b("2026-11-07", "18:00"), b("2026-11-07", "17:00")]),
      day("2026-11-08", [b("2026-11-08", "17:00")], { status: "paused" }),
      day("2026-11-09", []),
    ];
    const morning = upcomingSlots({ now: vnInstant(TODAY, "10:00"), days, settings });
    expect(morning.map((d) => [d.date, d.label])).toEqual([
      [TODAY, "Tối nay"],
      ["2026-11-07", "Mai"],
    ]);
    expect(morning[1].slots.map((s) => s.readyLabel)).toEqual(["17:00", "18:00"]);

    const evening = upcomingSlots({ now: vnInstant(TODAY, "16:00"), days, settings });
    expect(evening.map((d) => d.date)).toEqual(["2026-11-07"]);
  });
});
