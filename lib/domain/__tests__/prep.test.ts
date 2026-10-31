import { describe, expect, it } from "vitest";
import { buildPrepReport, type PrepReport } from "@/lib/domain/prep";
import { vnInstant } from "@/lib/domain/time";
import type { OrderWithItems } from "@/lib/domain/types";
import { DATE, batch, batches, catalog, orders } from "./fixtures";

const AFTER_CUTOFF = vnInstant(DATE, "15:45");

function report(over: { orders?: OrderWithItems[]; now?: Date } = {}) {
  return buildPrepReport({
    date: DATE,
    now: over.now ?? AFTER_CUTOFF,
    orders: over.orders ?? orders,
    batches,
    ...catalog,
  });
}

const ing = (r: PrepReport, id: string) => r.totals.ingredients.find((i) => i.ingredientId === id)!;
const names = (stops: { name: string }[]) => stops.map((s) => s.name);

describe("buildPrepReport — Phụ lục B", () => {
  const r = report();

  it("tổng đơn & món chính", () => {
    expect(r.orderCount).toBe(12);
    expect(r.totals.mains).toEqual({ pizza: 9, bbq: 6 });
    expect(r.totals.byProduct.map((p) => [p.productId, p.qty])).toEqual([
      ["pepperoni-pan", 5],
      ["garlic-cheese-pan", 4],
      ["ribs-sv", 6],
      ["sauce-garlic-butter", 7],
      ["sauce-bbq-smoky", 3],
      ["cold-brew-reu", 4],
    ]);
  });

  it("nguyên liệu khớp từng con số", () => {
    expect(ing(r, "pan-dough")).toMatchObject({ qty: 9, unit: "đế" });
    expect(ing(r, "ribs-bag")).toMatchObject({ qty: 6, unit: "túi", approxKg: 3 });
    expect(ing(r, "mozzarella").qty).toBe(1620);
    expect(ing(r, "pepperoni").qty).toBe(300);
    expect(ing(r, "garlic-butter-base").qty).toBe(160);
    expect(ing(r, "jar-garlic-butter")).toMatchObject({ qty: 7, split: { sold: 4, gift: 3 } });
    expect(ing(r, "jar-bbq-smoky").qty).toBe(3);
    expect(ing(r, "pink-ginger").qty).toBe(15);
    expect(ing(r, "pizza-box").qty).toBe(9);
    expect(ing(r, "bbq-tray").qty).toBe(6);
    expect(ing(r, "cold-brew-bottle")).toMatchObject({ qty: 4, storage: "quầy Rêu" });
  });

  it("không liệt kê nguyên liệu không dùng tới", () => {
    expect(r.totals.ingredients.find((i) => i.ingredientId === "bbq2-bag")).toBeUndefined();
  });

  it("chia nhỏ đế theo loại pizza; gừng (pizza + BBQ) thì không", () => {
    expect(ing(r, "pan-dough").byProduct?.map((b) => [b.productId, b.qty])).toEqual([
      ["pepperoni-pan", 5],
      ["garlic-cheese-pan", 4],
    ]);
    expect(ing(r, "pink-ginger").byProduct).toBeUndefined();
    expect(ing(r, "pink-ginger").split).toBeUndefined();
  });

  it("đối soát cold brew với Rêu", () => {
    expect(r.totals.supplier).toEqual([{ supplier: "reu", productId: "cold-brew-reu", qty: 4 }]);
  });

  it("chia theo mẻ", () => {
    const sum = (list: { qty: number }[]) => list.reduce((s, x) => s + x.qty, 0);
    expect(r.batches.map((b) => [b.readyLabel, b.ovenLabel, sum(b.pizza), sum(b.bbq)])).toEqual([
      ["17:00", "16:40", 3, 2],
      ["18:00", "17:40", 4, 3],
      ["19:00", "18:40", 2, 1],
    ]);
  });

  it("bất biến: tổng = Σ các mẻ", () => {
    const sum = (key: "pizza" | "bbq") =>
      r.batches.reduce((s, b) => s + b[key].reduce((t, x) => t + x.qty, 0), 0);
    expect(sum("pizza")).toBe(r.totals.mains.pizza);
    expect(sum("bbq")).toBe(r.totals.mains.bbq);
  });

  it("tuyến giao & khách lấy tại Rêu", () => {
    const [b17, b18, b19] = r.batches;
    expect(b17.routes.map((x) => [x.routeName, names(x.stops)])).toEqual([["Tuyến Khu phố 2", ["Tuấn", "Lan", "Huy"]]]);
    expect(b17.pickups).toEqual([]);

    // Trong tuyến: theo khu vực (Thị trấn trước Quốc lộ) rồi theo số thứ tự.
    expect(b18.routes.map((x) => [x.routeName, names(x.stops)])).toEqual([
      ["Tuyến Quốc lộ / Thị trấn", ["Hoa", "Vy", "Ngọc", "Minh", "Phúc"]],
    ]);
    expect(b18.pickups.map((p) => [p.pointName, names(p.orders)])).toEqual([["Cà phê Rêu", ["Khánh"]]]);

    expect(b19.routes.map((x) => [x.routeName, names(x.stops)])).toEqual([["Tuyến Khu phố 2", ["Trang"]]]);
    expect(b19.pickups.map((p) => names(p.orders))).toEqual([["Dũng", "Bảo"]]);
  });

  it("tiền cần thu: COD & CK chưa nhận thu đủ, CK đã nhận thu 0", () => {
    const stops = r.batches.flatMap((b) => b.routes.flatMap((x) => x.stops));
    const bySeq = Object.fromEntries(stops.map((s) => [s.seq, s]));
    expect(bySeq[1]).toMatchObject({ collect: 289_000 + 18_000 + 10_000, paid: false }); // combo + cold brew + ship
    expect(bySeq[2]).toMatchObject({ collect: 0, paid: true });
    expect(bySeq[5].collect).toBe(149_000 + 10_000 + 10_000);
    expect(bySeq[7].note).toBe("Ít cay, dị ứng đậu phộng");
    expect(r.batches[1].pickups[0].orders[0].collect).toBe(159_000); // Rêu: không ship, quà 0đ
  });

  it("cảnh báo", () => {
    expect(r.warnings.map((w) => [w.kind, w.orderCode])).toEqual([
      ["unpaid_transfer", "TH-0611-05"],
      ["allergy_note", "TH-0611-07"],
      ["unpaid_transfer", "TH-0611-09"],
    ]);
  });
});

describe("buildPrepReport — trạng thái & biên", () => {
  it("tạm tính trước giờ chốt, chốt sổ từ đúng 15:30", () => {
    expect(report({ now: vnInstant(DATE, "15:29") }).isFinal).toBe(false);
    expect(report({ now: vnInstant(DATE, "15:30") }).isFinal).toBe(true);
  });

  it("bỏ đơn huỷ và đơn của ngày khác", () => {
    const cancelled = { ...orders[0], status: "cancelled" as const };
    const otherDay = { ...orders[1], serviceDate: "2026-11-07" as const };
    const r = report({ orders: [cancelled, otherDay, ...orders.slice(2)] });
    expect(r.orderCount).toBe(10);
    expect(r.totals.mains).toEqual({ pizza: 7, bbq: 5 });
  });

  it("đơn chưa xác nhận, link bản đồ khi có toạ độ, khu vực lạ vào nhóm 'Chưa rõ tuyến'", () => {
    const placed = { ...orders[0], status: "placed" as const, lat: 15.7412, lng: 108.3615 };
    const lost = { ...orders[2], zoneId: 999 };
    const r = report({ orders: [placed, lost] });
    expect(r.warnings).toContainEqual({ kind: "unconfirmed", orderCode: "TH-0611-01", seq: 1, text: "Chưa xác nhận" });
    const routes = r.batches[0].routes;
    expect(routes.map((x) => x.routeName)).toEqual(["Tuyến Khu phố 2", "Chưa rõ tuyến"]);
    expect(routes[0].stops[0].mapsUrl).toBe("https://www.google.com/maps/search/?api=1&query=15.7412,108.3615");
    expect(routes[1].stops[0].zone).toBe("");
    expect(routes[1].stops[0]).not.toHaveProperty("mapsUrl");
  });

  it("ngày không có mẻ & không có đơn", () => {
    const r = buildPrepReport({ date: DATE, now: AFTER_CUTOFF, orders: [], batches: [], ...catalog });
    expect(r).toMatchObject({ isFinal: false, orderCount: 0, totals: { mains: { pizza: 0, bbq: 0 } }, batches: [] });
    expect(r.totals.ingredients).toEqual([]);
  });

  it("mẻ trống vẫn hiện để bếp thấy", () => {
    const r = buildPrepReport({
      date: DATE,
      now: AFTER_CUTOFF,
      orders: [],
      batches: [batch(9, "20:00")],
      ...catalog,
    });
    expect(r.batches).toEqual([
      { batchId: 9, readyLabel: "20:00", ovenLabel: "19:40", pizza: [], bbq: [], addons: [], routes: [], pickups: [] },
    ]);
  });
});
