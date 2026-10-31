"use server";

import { refresh, updateTag } from "next/cache";
import * as z from "zod";
import type { AdminError, AdminResult, QuickOrderInput, QuickOrderResult } from "@/lib/admin-contract";
import { normalizePhone } from "@/lib/domain/phone";
import { hasRole, type Role } from "@/lib/domain/roles";
import { isISODate, type ISODate } from "@/lib/domain/time";
import { currentStaff, type Staff } from "@/lib/server/auth/session";
import { serverNow } from "@/lib/server/clock";
import {
  advanceBatchCore,
  advanceOrdersCore,
  markPaidCore,
  moveOrderCore,
  setDayStatusCore,
  toggleProductCore,
  updateBatchCore,
  updateNoteCore,
} from "@/lib/server/dal/admin";
import { CATALOG_TAG, loadCatalog } from "@/lib/server/dal/catalog";
import { loadKitchenDay, loadOrderEvents, prepText, type OrderEventView } from "@/lib/server/dal/kitchen";
import { placeOrderCore } from "@/lib/server/dal/orders";
import { sendTelegram } from "@/lib/server/notify/telegram";
import { fieldErrors, OrderInput } from "@/lib/server/order-input";

// Mọi mutation của Kitchen Dashboard (§8.2): zod → requireStaff (theo quyền §10.8) → DAL → refresh() để
// dashboard đọc lại số liệu ngay. Lỗi trả mã ngắn; chuỗi hiển thị nằm ở data/copy.ts.

const KITCHEN: Role[] = ["owner", "manager", "kitchen"];
const OWNER: Role[] = ["owner"];

const uuid = z.uuid();
const id = z.number().int().positive();
const date = z.string().refine(isISODate);
const reason = z.string().trim().max(200);

async function staffFor(roles?: Role[]): Promise<Staff | null> {
  const s = await currentStaff();
  return s && (!roles || hasRole(s.roles, roles)) ? s : null;
}

/** Chạy một thao tác admin: parse → quyền → DAL → refresh. */
type Fail = { ok: false; reason: AdminError };

async function run<I, R extends AdminResult>(
  schema: z.ZodType<I>,
  raw: unknown,
  roles: Role[] | undefined,
  fn: (input: I, staff: Staff, now: Date) => Promise<R>,
): Promise<R | Fail> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    const staff = await staffFor(roles);
    if (!staff) return { ok: false, reason: "forbidden" };
    const res = await fn(parsed.data, staff, serverNow());
    if (res.ok) refresh();
    return res;
  } catch (err) {
    console.error(JSON.stringify({ evt: "admin_failed", error: String(err) }));
    return { ok: false, reason: "server_error" };
  }
}

const actor = (s: Staff) => ({ id: s.id, roles: s.orderRoles });

const Advance = z.object({
  orderIds: z.array(uuid).min(1).max(100),
  to: z.enum(["confirmed", "baking", "ready", "delivering", "completed", "no_show", "cancelled"]),
  reason: reason.optional(),
});

/** Đổi trạng thái một/nhiều đơn; quyền chi tiết do canTransition quyết (§7.5). */
export async function advanceOrders(raw: z.input<typeof Advance>) {
  return run(Advance, raw, undefined, async (i, s, now): Promise<AdminResult<{ updated: number; skipped: number }>> => {
    if (i.to === "cancelled" && !i.reason) return { ok: false, reason: "reason_required" };
    const res = await advanceOrdersCore(i.orderIds, i.to, { actor: actor(s), now, reason: i.reason });
    if (res.updated.length === 0) {
      const r = res.skipped[0]?.reason;
      return { ok: false, reason: r === "invalid_transition" ? "too_late" : (r ?? "invalid") };
    }
    return { ok: true, updated: res.updated.length, skipped: res.skipped.length };
  });
}

const Batch = z.object({ batchId: id, to: z.enum(["baking", "ready"]) });

export async function advanceBatch(raw: z.input<typeof Batch>) {
  return run(Batch, raw, KITCHEN, async (i, s, now) => {
    const res = await advanceBatchCore(i.batchId, i.to, { actor: actor(s), now });
    return { ok: true, ...res };
  });
}

const Paid = z.object({ orderId: uuid, method: z.enum(["cod", "transfer"]) });

export async function markPaid(raw: z.input<typeof Paid>) {
  return run(Paid, raw, OWNER, (i, s, now) => markPaidCore(i.orderId, i.method, { actor: actor(s), now }));
}

const Move = z.object({ orderId: uuid, batchId: id });

export async function moveOrder(raw: z.input<typeof Move>) {
  return run(Move, raw, KITCHEN, (i, s, now) => moveOrderCore(i.orderId, i.batchId, { actor: actor(s), now }));
}

const Note = z.object({ orderId: uuid, note: z.string().max(300) });

export async function updateNote(raw: z.input<typeof Note>) {
  return run(Note, raw, KITCHEN, (i, s, now) => updateNoteCore(i.orderId, i.note, { actor: actor(s), now }));
}

const BatchEdit = z.object({
  batchId: id,
  capPan: z.number().int().min(0).max(50).optional(),
  capBbq: z.number().int().min(0).max(50).optional(),
  status: z.enum(["open", "closed"]).optional(),
});

export async function updateBatch(raw: z.input<typeof BatchEdit>) {
  return run(BatchEdit, raw, OWNER, (i) => updateBatchCore(i));
}

const Day = z.object({ date, status: z.enum(["open", "closed", "paused"]), pauseMessage: z.string().trim().max(160).optional() });

export async function setDayStatus(raw: z.input<typeof Day>) {
  return run(Day, raw, OWNER, (i) => setDayStatusCore(i.date as ISODate, i.status, i.pauseMessage ?? null));
}

const Toggle = z.object({ productId: z.string().max(40), isAvailable: z.boolean() });

export async function toggleProduct(raw: z.input<typeof Toggle>) {
  return run(Toggle, raw, OWNER, async (i) => {
    const res = await toggleProductCore(i.productId, i.isAvailable);
    if (res.ok) updateTag(CATALOG_TAG); // trang đặt món thấy "Hết hôm nay" ngay (§5.3)
    return res;
  });
}

const DateOnly = z.object({ date });

/** Gửi Bảng Tổng Hợp hiện tại vào nhóm Telegram (nút "Gửi Telegram", §10.2). */
export async function sendPrepTelegram(raw: { date: string }) {
  return run(DateOnly, raw, KITCHEN, async (i, _s, now) => {
    const sent = await sendTelegram(prepText(await loadKitchenDay(i.date as ISODate, now)));
    return sent ? { ok: true as const } : { ok: false as const, reason: "server_error" as const };
  });
}

/** Lịch sử order_events cho sheet chi tiết. Chỉ đọc → không refresh. */
export async function getOrderEvents(raw: { orderId: string }): Promise<AdminResult<{ events: OrderEventView[] }>> {
  const parsed = z.object({ orderId: uuid }).safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  if (!(await staffFor(KITCHEN))) return { ok: false, reason: "forbidden" };
  return { ok: true, events: await loadOrderEvents(parsed.data.orderId) };
}

const Quick = OrderInput.omit({ website: true, startedAt: true }).extend({
  channel: z.enum(["phone", "zalo", "walkin"]),
  overrideCutoff: z.boolean(),
});

/** "+ Thêm đơn nhanh" (§10.4): như placeOrder nhưng do nhân viên nhập — không honeypot/rate-limit, xác nhận luôn. */
export async function createQuickOrder(raw: QuickOrderInput): Promise<QuickOrderResult> {
  const parsed = Quick.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid", fieldErrors: fieldErrors(parsed.error) };
  const input = parsed.data;
  const phone = normalizePhone(input.customer.phone);
  if (!phone) return { ok: false, reason: "invalid", fieldErrors: { phone: "phoneInvalid" } };
  try {
    const staff = await staffFor(KITCHEN);
    if (!staff || (input.overrideCutoff && !staff.roles.includes("owner"))) return { ok: false, reason: "forbidden" };
    const { result } = await placeOrderCore({ ...input, startedAt: 0 }, phone, {
      now: serverNow(),
      catalog: await loadCatalog(),
      staff: { actor: `staff:${staff.id}`, channel: input.channel, overrideCutoff: input.overrideCutoff },
    });
    if (result.ok) refresh();
    return result;
  } catch (err) {
    console.error(JSON.stringify({ evt: "quick_order_failed", error: String(err) }));
    return { ok: false, reason: "server_error" };
  }
}
