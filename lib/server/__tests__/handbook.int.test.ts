import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedChecklistTemplates, seedHandbookPages } from "@/data/seed-ops";
import { vnInstant, type ISODate } from "@/lib/domain/time";
import { closeDb, getDb } from "@/lib/server/db/client";
import * as t from "@/lib/server/db/schema";
import { seedStatic } from "@/lib/server/db/seed";
import { loadWorkView, markChecklistItemCore, saveChecklistTemplateCore } from "@/lib/server/dal/checklist";
import { loadHandbookView, saveHandbookPageCore } from "@/lib/server/dal/handbook";
import type { OpsActor } from "@/lib/server/dal/ops";
import { renderMarkdown } from "@/lib/server/markdown";

// Checklist & sổ tay (M8, §17.5–17.6): quyền theo vai trò ở DTO, số đo ngoài ngưỡng → Telegram, lượt tuần,
// nhiều người tick song song, công thức đọc recipe_lines, Markdown không lọt HTML/JS. Thứ Sáu 20/11/2026.

const FRI = "2026-11-20" as ISODate;
const at = (hhmm: string, date: ISODate = FRI) => vnInstant(date, hhmm);
const db = getDb();

const OPEN_KITCHEN = 1;
const OPEN_BAR = 2;
const TEMPS = 3;
const CLOSE = 4;
const WEEKLY = 5;

let owner: OpsActor, manager: OpsActor, kitchen: OpsActor, barista: OpsActor;

async function addStaff(name: string, roles: OpsActor["roles"]): Promise<OpsActor> {
  const [s] = await db.insert(t.staff).values({ name, roles, pinHash: "x" }).returning();
  return { id: s.id, name: s.name, roles: s.roles };
}

const ctx = (actor: OpsActor, hhmm = "09:00", date: ISODate = FRI) => ({ actor, now: at(hhmm, date) });

// Chỉ dữ liệu tĩnh: không sinh ngày/mẻ (db.int đếm service_days, không phụ thuộc thứ tự file).
beforeAll(async () => {
  await seedStatic(db);
  await db.delete(t.opsEvents);
  owner = await addStaff("Chủ M8", ["owner"]);
  manager = await addStaff("Mai M8", ["manager"]);
  kitchen = await addStaff("Tâm M8", ["kitchen"]);
  barista = await addStaff("Vy M8", ["barista", "server"]);
});
beforeEach(async () => {
  await db.delete(t.checklistRuns);
});
afterAll(closeDb);

describe("seed M8", () => {
  it("đủ mẫu checklist & trang sổ tay, chạy lại không nhân đôi", async () => {
    await seedStatic(db);
    expect(await db.$count(t.checklistTemplates)).toBe(seedChecklistTemplates.length);
    expect(await db.$count(t.handbookPages)).toBeGreaterThanOrEqual(seedHandbookPages.length);
    // Sequence đã đẩy lên → mẫu thêm sau không trùng khoá.
    const res = await saveChecklistTemplateCore(
      { title: "Tạm", roles: ["server"], moment: "during", items: [{ id: "a", label: "A" }], sort: 99, isActive: false },
      ctx(manager),
    );
    expect(res.ok && res.id).toBeGreaterThan(seedChecklistTemplates.length);
    if (res.ok) await db.delete(t.checklistTemplates).where(eq(t.checklistTemplates.id, res.id));
  });
});

describe("checklist — quyền theo vai trò (DTO)", () => {
  it("pha chế chỉ thấy mẫu gắn vai mình, không thấy mẫu để sửa", async () => {
    const v = await loadWorkView(barista, at("09:00"));
    expect(v.canEdit).toBe(false);
    expect(v.templates).toEqual([]);
    expect(v.runs.map((r) => r.templateId).sort()).toEqual([OPEN_BAR, TEMPS, CLOSE, WEEKLY].sort());
    expect(v.runs.map((r) => r.moment)).toEqual(["open", "during", "close", "weekly"]);
    expect(v.runs.find((r) => r.templateId === WEEKLY)!.date).toBe("2026-11-16");
  });

  it("quản lý thấy & sửa tất cả", async () => {
    const v = await loadWorkView(manager, at("09:00"));
    expect(v.canEdit).toBe(true);
    expect(v.runs).toHaveLength(5);
    expect(v.templates).toHaveLength(5);
  });

  it("không làm được checklist của vai khác", async () => {
    expect(await markChecklistItemCore({ templateId: OPEN_KITCHEN, itemId: "gas" }, ctx(barista))).toEqual({ ok: false, reason: "forbidden" });
    expect(await markChecklistItemCore({ templateId: OPEN_BAR, itemId: "nope" }, ctx(barista))).toEqual({ ok: false, reason: "not_found" });
    expect(await markChecklistItemCore({ templateId: 999, itemId: "a" }, ctx(barista))).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("checklist — đánh dấu", () => {
  it("số đo bắt buộc; ngoài ngưỡng → tin Telegram ⚠, trong ngưỡng thì không", async () => {
    expect(await markChecklistItemCore({ templateId: TEMPS, itemId: "fridge-bar" }, ctx(barista))).toEqual({ ok: false, reason: "value_required" });

    const ok = await markChecklistItemCore({ templateId: TEMPS, itemId: "fridge-bar", value: 4 }, ctx(barista));
    expect(ok).toEqual({ ok: true, complete: false, out: false, telegram: null });

    const hot = await markChecklistItemCore({ templateId: TEMPS, itemId: "fridge-kitchen", value: 7.5 }, ctx(kitchen, "14:05"));
    expect(hot.ok && hot.out).toBe(true);
    expect(hot.ok && hot.telegram).toBe("⚠️ Tủ mát bếp: 7,5 °C (chuẩn ≤ 5 °C)\nNhiệt độ tủ (giữa ca) · Tâm M8 14:05");

    const v = await loadWorkView(kitchen, at("14:10"));
    const items = v.runs.find((r) => r.templateId === TEMPS)!.items;
    expect(items.find((i) => i.id === "fridge-kitchen")!.mark).toMatchObject({ by: "Tâm M8", at: "14:05", value: 7.5, out: true, canUndo: true });
    expect(items.find((i) => i.id === "fridge-bar")!.mark).toMatchObject({ by: "Vy M8", value: 4, out: false, canUndo: false });
    expect(items.find((i) => i.id === "fridge-bar")!.range).toBe("≤ 5 °C");
  });

  it("mục cần ảnh; đủ hết → hoàn thành; bỏ tick: người tick hoặc quản lý", async () => {
    const tpl = seedChecklistTemplates.find((x) => x.id === CLOSE)!;
    expect(await markChecklistItemCore({ templateId: CLOSE, itemId: "floor" }, ctx(barista))).toEqual({ ok: false, reason: "photo_needed" });
    const [file] = await db.insert(t.opsFiles).values({ mime: "image/jpeg", bytes: Buffer.from([1]), size: 1 }).returning({ id: t.opsFiles.id });

    let last;
    for (const item of tpl.items) {
      last = await markChecklistItemCore({ templateId: CLOSE, itemId: item.id, photo: item.photo ? file.id : null }, ctx(barista, "21:50"));
    }
    expect(last).toMatchObject({ ok: true, complete: true });
    const [run] = await db.select().from(t.checklistRuns).where(eq(t.checklistRuns.templateId, CLOSE));
    expect(run.serviceDate).toBe(FRI);
    expect(run.completedAt?.toISOString()).toBe(at("21:50").toISOString());
    expect(run.done.floor.photo).toBe(file.id);

    expect(await markChecklistItemCore({ templateId: CLOSE, itemId: "lock", undo: true }, ctx(kitchen, "21:55"))).toEqual({ ok: false, reason: "forbidden" });
    expect(await markChecklistItemCore({ templateId: CLOSE, itemId: "lock", undo: true }, ctx(manager, "21:55"))).toMatchObject({ ok: true, complete: false });
    const [after] = await db.select().from(t.checklistRuns).where(eq(t.checklistRuns.templateId, CLOSE));
    expect(after.completedAt).toBeNull();
    expect(after.done.lock).toBeUndefined();
    // Bỏ tick mục chưa tick: không lỗi, không đổi gì.
    expect(await markChecklistItemCore({ templateId: CLOSE, itemId: "lock", undo: true }, ctx(barista, "21:56"))).toMatchObject({ ok: true, complete: false });

    const events = await db.select().from(t.opsEvents).where(eq(t.opsEvents.type, "checklist_unmark"));
    expect(events).toHaveLength(1);
    expect(events[0].actor).toBe(`staff:${manager.id}`);
  });

  it("hai người tick song song cùng một lượt → giữ cả hai", async () => {
    const res = await Promise.all([
      markChecklistItemCore({ templateId: OPEN_BAR, itemId: "machine" }, ctx(barista)),
      markChecklistItemCore({ templateId: OPEN_BAR, itemId: "stock" }, ctx(manager)),
      markChecklistItemCore({ templateId: OPEN_BAR, itemId: "floor" }, ctx(owner)),
    ]);
    expect(res.every((r) => r.ok)).toBe(true);
    const rows = await db.select().from(t.checklistRuns).where(eq(t.checklistRuns.templateId, OPEN_BAR));
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0].done).sort()).toEqual(["floor", "machine", "stock"]);
  });

  it("lượt tuần: Thứ Sáu và Chủ nhật chung một lượt; tuần sau là lượt mới", async () => {
    await markChecklistItemCore({ templateId: WEEKLY, itemId: "hood" }, ctx(barista, "10:00", FRI));
    await markChecklistItemCore({ templateId: WEEKLY, itemId: "descale" }, ctx(barista, "10:00", "2026-11-22"));
    await markChecklistItemCore({ templateId: WEEKLY, itemId: "freezer" }, ctx(barista, "10:00", "2026-11-23"));
    const rows = await db.select().from(t.checklistRuns).where(eq(t.checklistRuns.templateId, WEEKLY));
    expect(rows.map((r) => [r.serviceDate, Object.keys(r.done).sort()]).sort()).toEqual([
      ["2026-11-16", ["descale", "hood"]],
      ["2026-11-23", ["freezer"]],
    ]);
    // Hôm sau (ngày thường) lượt hằng ngày trống lại.
    const sat = await loadWorkView(barista, at("09:00", "2026-11-21"));
    expect(sat.runs.find((r) => r.templateId === WEEKLY)!.done).toBe(2);
  });
});

describe("checklist — sửa mẫu", () => {
  it("chỉ owner/manager; mẫu sai bị từ chối; thêm mục → lượt đã xong thành chưa xong", async () => {
    const items = [{ id: "a", label: "Việc A" }];
    expect(await saveChecklistTemplateCore({ title: "X", roles: ["server"], moment: "open", items, sort: 9, isActive: true }, ctx(barista))).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(
      await saveChecklistTemplateCore({ title: "X", roles: ["server"], moment: "open", items: [...items, { id: "a", label: "Trùng" }], sort: 9, isActive: true }, ctx(manager)),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(await saveChecklistTemplateCore({ title: "X", roles: [], moment: "open", items, sort: 9, isActive: true }, ctx(manager))).toEqual({ ok: false, reason: "invalid" });
    expect(await saveChecklistTemplateCore({ id: 9999, title: "X", roles: ["server"], moment: "open", items, sort: 9, isActive: true }, ctx(manager))).toEqual({
      ok: false,
      reason: "not_found",
    });

    const created = await saveChecklistTemplateCore({ title: "Phục vụ giữa ca", roles: ["server"], moment: "during", items, sort: 9, isActive: true }, ctx(manager));
    expect(created.ok).toBe(true);
    const id = (created as { id: number }).id;
    expect(await markChecklistItemCore({ templateId: id, itemId: "a" }, ctx(barista))).toMatchObject({ ok: true, complete: true });

    await saveChecklistTemplateCore({ id, title: "Phục vụ giữa ca", roles: ["server"], moment: "during", items: [...items, { id: "b", label: "Việc B" }], sort: 9, isActive: true }, ctx(manager));
    const run = (await loadWorkView(barista, at("10:00"))).runs.find((r) => r.templateId === id)!;
    expect([run.done, run.total, run.complete]).toEqual([1, 2, false]);

    // Tắt mẫu → biến khỏi danh sách nhân viên, không tick được nữa; quản lý vẫn thấy trong danh sách mẫu.
    await saveChecklistTemplateCore({ id, title: "Phục vụ giữa ca", roles: ["server"], moment: "during", items, sort: 9, isActive: false }, ctx(owner));
    expect((await loadWorkView(barista, at("10:00"))).runs.some((r) => r.templateId === id)).toBe(false);
    expect(await markChecklistItemCore({ templateId: id, itemId: "a" }, ctx(barista))).toEqual({ ok: false, reason: "not_found" });
    expect((await loadWorkView(manager, at("10:00"))).templates.find((x) => x.id === id)?.isActive).toBe(false);

    await db.delete(t.checklistRuns).where(eq(t.checklistRuns.templateId, id));
    await db.delete(t.checklistTemplates).where(eq(t.checklistTemplates.id, id));
  });
});

describe("sổ tay — quyền xem (DTO)", () => {
  it("vai trò không được gắn mở trang → không có nội dung, không lộ trang có tồn tại", async () => {
    const list = await loadHandbookView(barista, null, at("09:00"));
    expect(list.pages.map((p) => p.slug)).not.toContain("pepperoni-pan");
    expect(list.pages.map((p) => p.slug)).toContain("phuc-vu-tai-quan");
    expect(list.products).toEqual([]);

    const denied = await loadHandbookView(barista, "pepperoni-pan", at("09:00"));
    const nothing = await loadHandbookView(barista, "khong-co-trang-nay", at("09:00"));
    expect(denied.page).toBeNull();
    expect(denied.missing).toBe(true);
    expect({ ...denied, pages: [] }).toEqual({ ...nothing, pages: [] });
    expect(JSON.stringify(denied)).not.toMatch(/mozzarella|Pepperoni Pan/i);
    const views = await db.select().from(t.opsEvents).where(and(eq(t.opsEvents.type, "handbook_view"), eq(t.opsEvents.actor, `staff:${barista.id}`)));
    expect(views).toHaveLength(0);
  });

  it("bếp mở công thức: bảng định lượng đọc recipe_lines, không có Markdown gốc; lượt xem được ghi", async () => {
    const v = await loadHandbookView(kitchen, "pepperoni-pan", at("09:30"));
    expect(v.canEdit).toBe(false);
    expect(v.page).toMatchObject({ slug: "pepperoni-pan", kind: "recipe", body: null, productId: "pepperoni-pan" });
    expect(v.page!.recipe).toEqual({
      product: "Pan Pizza Pepperoni",
      lines: [
        { label: "Đế Pan đã ủ", qty: 1, unit: "đế" },
        { label: "Mozzarella", qty: 180, unit: "g" },
        { label: "Pepperoni lát", qty: 60, unit: "g" },
        { label: "Gừng hồng muối", qty: 1, unit: "phần" },
        { label: "Hộp pizza", qty: 1, unit: "hộp" },
      ],
    });
    expect(v.page!.html).toContain("<ol>");
    const [ev] = await db.select().from(t.opsEvents).where(and(eq(t.opsEvents.type, "handbook_view"), eq(t.opsEvents.actor, `staff:${kitchen.id}`)));
    expect(ev.data).toEqual({ slug: "pepperoni-pan", version: 1 });

    // Đổi định lượng ở recipe_lines → trang tự theo (một nguồn sự thật).
    await db.update(t.recipeLines).set({ qty: 200 }).where(and(eq(t.recipeLines.productId, "pepperoni-pan"), eq(t.recipeLines.ingredientId, "mozzarella")));
    const again = await loadHandbookView(kitchen, "pepperoni-pan", at("09:31"));
    expect(again.page!.recipe!.lines[1]).toEqual({ label: "Mozzarella", qty: 200, unit: "g" });
    await db.update(t.recipeLines).set({ qty: 180 }).where(and(eq(t.recipeLines.productId, "pepperoni-pan"), eq(t.recipeLines.ingredientId, "mozzarella")));
  });

  it("quản lý xem mọi trang kèm Markdown gốc & danh sách món", async () => {
    const v = await loadHandbookView(manager, "mo-ca-bep", at("09:00"));
    expect(v.pages.length).toBeGreaterThanOrEqual(seedHandbookPages.length);
    expect(v.page!.body).toContain("## Trước giờ mẻ đầu");
    expect(v.products.map((p) => p.id)).toContain("pepperoni-pan");
  });
});

describe("sổ tay — sửa & Markdown an toàn", () => {
  it("chỉ owner/manager; slug trùng/sai; version tăng mỗi lần sửa", async () => {
    const base = { slug: "rua-ly", title: "Rửa ly", kind: "sop" as const, roles: ["barista" as const], body: "1. Tráng nước nóng", productId: null };
    expect(await saveHandbookPageCore(base, ctx(kitchen))).toEqual({ ok: false, reason: "forbidden" });
    expect(await saveHandbookPageCore({ ...base, slug: "Rửa Ly" }, ctx(manager))).toEqual({ ok: false, reason: "invalid" });
    expect(await saveHandbookPageCore({ ...base, productId: "khong-co" }, ctx(manager))).toEqual({ ok: false, reason: "invalid" });
    expect(await saveHandbookPageCore(base, ctx(manager))).toEqual({ ok: true, slug: "rua-ly" });
    expect(await saveHandbookPageCore(base, ctx(owner))).toEqual({ ok: false, reason: "duplicate" });

    const [row] = await db.select().from(t.handbookPages).where(eq(t.handbookPages.slug, "rua-ly"));
    expect(await saveHandbookPageCore({ ...base, id: row.id, body: "1. Tráng nước nóng\n2. Úp ráo" }, ctx(owner))).toEqual({ ok: true, slug: "rua-ly" });
    expect(await saveHandbookPageCore({ ...base, id: 99999 }, ctx(owner))).toEqual({ ok: false, reason: "not_found" });
    const v = await loadHandbookView(barista, "rua-ly", at("09:00"));
    expect(v.page).toMatchObject({ version: 2, updatedBy: "Chủ M8" });
    expect(v.page!.html).toContain("Úp ráo");
    await db.delete(t.handbookPages).where(eq(t.handbookPages.id, row.id));
  });

  it("HTML thô, link javascript:, ảnh ngoài không lọt vào trang", () => {
    const html = renderMarkdown(
      [
        "<script>alert(1)</script>",
        '<img src=x onerror="alert(1)">',
        "Chữ <b onclick='x()'>đậm</b>",
        "[bấm](javascript:alert(1)) · [web](https://theheatpizza.vn) · [nội bộ](/admin/kitchen) · [lạ](//evil.example)",
        "![ảnh](https://evil.example/x.png)",
        "| A | B |\n|---|---|\n| 1 | 2 |",
      ].join("\n\n"),
    );
    expect(html).not.toMatch(/<script|<img|<b[ >]|<[^>]*\bon\w+=|javascript:|href="\/\/evil/);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('<a href="https://theheatpizza.vn" target="_blank" rel="noreferrer">web</a>');
    expect(html).toContain('<a href="/admin/kitchen">nội bộ</a>');
    expect(html).toContain("<table>");
    expect(html).toContain("ảnh");
  });
});
