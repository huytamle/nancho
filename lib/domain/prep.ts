// Bảng Tổng Hợp Chuẩn Bị (BLUEPRINT §7.6): bếp lấy nguyên liệu theo con số tổng, nướng theo mẻ.
// Bất biến: totals.mains = Σ các mẻ. Combo được "nổ" thành món thành phần; quà vẫn tốn nguyên liệu.

import { vnTimeLabel, type ISODate } from "@/lib/domain/time";
import type {
  Batch,
  Ingredient,
  Kind,
  OrderWithItems,
  PickupPoint,
  Product,
  RecipeLine,
  Route,
  Zone,
} from "@/lib/domain/types";

type Count = { sold: number; gift: number };
type NameQty = { name: string; qty: number };

export type PrepIngredient = {
  ingredientId: string;
  label: string;
  qty: number;
  unit: string;
  storage: string;
  approxKg?: number;
  /** Có hàng tặng: "4 bán · 3 tặng". */
  split?: Count;
  /** ≥ 2 món cùng loại dùng chung (vd. đế pan): "5 Pepperoni · 4 Phô mai Bơ tỏi". */
  byProduct?: { productId: string; name: string; qty: number }[];
};

export type PrepStop = {
  code: string;
  seq: number;
  name: string;
  phone: string;
  zone: string;
  address: string;
  mapsUrl?: string;
  collect: number;
  paid: boolean;
  note?: string;
};

export type PrepWarning = { kind: "unpaid_transfer" | "allergy_note" | "unconfirmed"; orderCode: string; seq: number; text: string };

export type PrepReport = {
  date: ISODate;
  generatedAt: string;
  isFinal: boolean;
  orderCount: number;
  totals: {
    mains: { pizza: number; bbq: number };
    byProduct: { productId: string; name: string; qty: number; kind: Kind }[];
    ingredients: PrepIngredient[];
    supplier: { supplier: "reu"; productId: string; qty: number }[];
  };
  batches: {
    batchId: number;
    readyLabel: string;
    ovenLabel: string;
    pizza: NameQty[];
    bbq: NameQty[];
    addons: NameQty[];
    routes: { routeId: number; routeName: string; stops: PrepStop[] }[];
    pickups: { pointName: string; orders: { code: string; seq: number; name: string; collect: number }[] }[];
  }[];
  warnings: PrepWarning[];
};

const NOTE_KEYWORDS = ["dị ứng", "không", "ít", "chay"];
const UNKNOWN_ROUTE: Route = { id: 0, name: "Chưa rõ tuyến", sort: Number.MAX_SAFE_INTEGER };

const round2 = (n: number) => Math.round(n * 100) / 100;
const totalOf = (c: Count) => c.sold + c.gift;

/** Đếm theo món sau khi nổ combo. */
function tally(orders: OrderWithItems[], products: Map<string, Product>): Map<string, Count> {
  const counts = new Map<string, Count>();
  const add = (productId: string, qty: number, isGift: boolean) => {
    const c = counts.get(productId) ?? { sold: 0, gift: 0 };
    if (isGift) c.gift += qty;
    else c.sold += qty;
    counts.set(productId, c);
  };
  for (const order of orders) {
    for (const item of order.items) {
      if (products.get(item.productId)?.kind === "combo" && item.comboChoices) {
        for (const componentId of Object.values(item.comboChoices)) add(componentId, item.qty, item.isGift);
      } else {
        add(item.productId, item.qty, item.isGift);
      }
    }
  }
  return counts;
}

function byKind(counts: Map<string, Count>, products: Product[], kind: Kind): NameQty[] {
  return products
    .filter((p) => p.kind === kind && counts.has(p.id))
    .map((p) => ({ name: p.name, qty: totalOf(counts.get(p.id)!) }));
}

const collectOf = (o: OrderWithItems) => (o.paymentStatus === "unpaid" ? o.total : 0);

export function buildPrepReport(input: {
  date: ISODate;
  now: Date;
  orders: OrderWithItems[];
  products: Product[];
  recipes: RecipeLine[];
  ingredients: Ingredient[];
  batches: Batch[];
  zones: Zone[];
  routes: Route[];
  points: PickupPoint[];
}): PrepReport {
  const products = [...input.products].sort((a, b) => a.sort - b.sort);
  const productById = new Map(products.map((p) => [p.id, p]));
  const zoneById = new Map(input.zones.map((z) => [z.id, z]));
  const routeById = new Map(input.routes.map((r) => [r.id, r]));
  const pointById = new Map(input.points.map((p) => [p.id, p]));

  const orders = input.orders
    .filter((o) => o.serviceDate === input.date && o.status !== "cancelled")
    .sort((a, b) => a.seq - b.seq);
  const batches = input.batches
    .filter((b) => b.serviceDate === input.date)
    .sort((a, b) => a.readyAt.getTime() - b.readyAt.getTime());

  // ── Tổng toàn ngày ──
  const counts = tally(orders, productById);

  const byProduct = products
    .filter((p) => counts.has(p.id))
    .map((p) => ({ productId: p.id, name: p.name, qty: totalOf(counts.get(p.id)!), kind: p.kind }));

  const ingredients: PrepIngredient[] = [...input.ingredients]
    .sort((a, b) => a.sort - b.sort)
    .flatMap((ing) => {
      const uses = input.recipes
        .filter((r) => r.ingredientId === ing.id && counts.has(r.productId))
        .map((r) => ({ recipe: r, product: productById.get(r.productId)!, count: counts.get(r.productId)! }));
      if (uses.length === 0) return [];

      const split = uses.reduce(
        (s, u) => ({ sold: s.sold + u.recipe.qty * u.count.sold, gift: s.gift + u.recipe.qty * u.count.gift }),
        { sold: 0, gift: 0 },
      );
      const qty = round2(totalOf(split));
      const row: PrepIngredient = { ingredientId: ing.id, label: ing.label, qty, unit: ing.unit, storage: ing.storage };
      if (ing.unitWeightG) row.approxKg = round2((qty * ing.unitWeightG) / 1000);
      if (split.gift > 0) row.split = { sold: round2(split.sold), gift: round2(split.gift) };
      else if (uses.length >= 2 && uses.every((u) => u.product.kind === uses[0].product.kind)) {
        row.byProduct = uses.map((u) => ({ productId: u.product.id, name: u.product.name, qty: totalOf(u.count) }));
      }
      return [row];
    });

  const supplier = products
    .filter((p) => p.supplier && counts.has(p.id))
    .map((p) => ({ supplier: p.supplier!, productId: p.id, qty: totalOf(counts.get(p.id)!) }));

  // ── Theo mẻ ──
  const batchRows = batches.map((b) => {
    const inBatch = orders.filter((o) => o.batchId === b.id);
    const bc = tally(inBatch, productById);

    const routeGroups = new Map<number, { route: Route; stops: { sort: number; stop: PrepStop }[] }>();
    for (const o of inBatch.filter((o) => o.fulfillment === "delivery")) {
      const zone = o.zoneId !== null ? zoneById.get(o.zoneId) : undefined;
      const route = (zone && routeById.get(zone.routeId)) ?? UNKNOWN_ROUTE;
      const group = routeGroups.get(route.id) ?? { route, stops: [] };
      group.stops.push({
        sort: zone?.sort ?? Number.MAX_SAFE_INTEGER,
        stop: {
          code: o.code,
          seq: o.seq,
          name: o.customerName,
          phone: o.customerPhone,
          zone: zone?.name ?? "",
          address: o.addressText ?? "",
          ...(o.lat !== null && o.lng !== null
            ? { mapsUrl: `https://www.google.com/maps/search/?api=1&query=${o.lat},${o.lng}` }
            : {}),
          collect: collectOf(o),
          paid: o.paymentStatus === "paid",
          ...(o.note ? { note: o.note } : {}),
        },
      });
      routeGroups.set(route.id, group);
    }

    const pickupGroups = new Map<number, { pointName: string; orders: PrepReport["batches"][number]["pickups"][number]["orders"] }>();
    for (const o of inBatch.filter((o) => o.fulfillment === "pickup")) {
      const id = o.pickupPointId ?? 0;
      const group = pickupGroups.get(id) ?? { pointName: pointById.get(id)?.name ?? "Điểm nhận", orders: [] };
      group.orders.push({ code: o.code, seq: o.seq, name: o.customerName, collect: collectOf(o) });
      pickupGroups.set(id, group);
    }

    return {
      batchId: b.id,
      readyLabel: vnTimeLabel(b.readyAt),
      ovenLabel: vnTimeLabel(b.ovenAt),
      pizza: byKind(bc, products, "pizza"),
      bbq: byKind(bc, products, "bbq"),
      addons: byKind(bc, products, "addon"),
      routes: [...routeGroups.values()]
        .sort((a, b) => a.route.sort - b.route.sort)
        .map(({ route, stops }) => ({
          routeId: route.id,
          routeName: route.name,
          stops: stops.sort((a, b) => a.sort - b.sort || a.stop.seq - b.stop.seq).map((s) => s.stop),
        })),
      pickups: [...pickupGroups.values()],
    };
  });

  // ── Cảnh báo ──
  const warnings: PrepWarning[] = orders.flatMap((o) => {
    const list: PrepWarning[] = [];
    if (o.paymentMethod === "transfer" && o.paymentStatus === "unpaid") {
      list.push({ kind: "unpaid_transfer", orderCode: o.code, seq: o.seq, text: "Chuyển khoản chưa nhận tiền" });
    }
    const note = o.note?.toLocaleLowerCase("vi") ?? "";
    if (NOTE_KEYWORDS.some((k) => note.includes(k))) {
      list.push({ kind: "allergy_note", orderCode: o.code, seq: o.seq, text: o.note! });
    }
    if (o.status === "placed") list.push({ kind: "unconfirmed", orderCode: o.code, seq: o.seq, text: "Chưa xác nhận" });
    return list;
  });

  const lastCutoff = Math.max(...batches.map((b) => b.cutoffAt.getTime()));

  return {
    date: input.date,
    generatedAt: input.now.toISOString(),
    isFinal: batches.length > 0 && input.now.getTime() >= lastCutoff,
    orderCount: orders.length,
    totals: {
      mains: {
        pizza: byProduct.filter((p) => p.kind === "pizza").reduce((s, p) => s + p.qty, 0),
        bbq: byProduct.filter((p) => p.kind === "bbq").reduce((s, p) => s + p.qty, 0),
      },
      byProduct,
      ingredients,
      supplier,
    },
    batches: batchRows,
    warnings,
  };
}
