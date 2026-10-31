import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { closeDb, onHand, PIN, resetOrders, seedAppendixB, seedStaff, seedStock, STAFF } from "./db";

// M10 (§17.8): cột Tồn ở tab Chuẩn bị; nhập kho ghi nợ NCC → trả nợ; kiểm nhanh cuối ca đếm mù. TEST_NOW = 06/11/2026.

async function noSeriousA11y(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

async function login(page: Page, name: string) {
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.getByRole("button", { name }).click();
  await page.getByRole("textbox", { name: `PIN của ${name}` }).fill(PIN);
  await expect(page).toHaveURL(/\/admin\/(van-hanh|kitchen)/);
}

const opsTabs = (page: Page) => page.getByRole("navigation", { name: "Khu vực vận hành" });
// So với bề rộng viewport thật (xem m9.spec).
const noHorizontalScroll = (page: Page) => page.evaluate((w) => document.documentElement.scrollWidth <= w, page.viewportSize()!.width);

test.beforeEach(async () => {
  await resetOrders();
  await seedStaff();
});
test.afterAll(closeDb);

test("tab Chuẩn bị hiện tồn: đủ / thiếu theo đơn chưa ra lò", async ({ page }) => {
  await seedAppendixB();
  await seedStock({ "pan-dough": 5, mozzarella: 5000 });
  await login(page, STAFF.kitchen);
  await expect(page.getByTestId("stock-pan-dough")).toHaveText("Tồn 5 đế · thiếu 4 đế");
  await expect(page.getByTestId("stock-mozzarella")).toHaveText("Tồn 5.000 g · đủ");
  await expect(page.getByTestId("stock-pink-ginger")).toHaveCount(0);
  await noSeriousA11y(page);
});

test("chủ quán nhập 1 thùng Pepsi ghi nợ Cô Nhiều → công nợ → trả nợ; tồn 24 lon", async ({ page }) => {
  await login(page, STAFF.owner);
  await page.goto("/admin/van-hanh?tab=kho");
  await expect(opsTabs(page).getByRole("button", { name: "Kho" })).toHaveAttribute("aria-current", "page");
  const sections = page.getByRole("tablist", { name: "Phần của kho" });

  await sections.getByRole("tab", { name: "Nhập" }).click();
  const form = page.getByRole("region", { name: "Nhập kho" });
  await form.getByLabel("Mặt hàng").selectOption({ label: "Pepsi lon" });
  await form.getByRole("textbox", { name: /^Số lượng/ }).fill("1");
  await expect(form.getByText("= 24 lon", { exact: true })).toBeVisible();
  await form.getByLabel(/^Thành tiền/).fill("240k");
  await form.getByRole("radio", { name: "Ghi nợ NCC" }).click();
  await form.getByLabel("Nhà cung cấp").fill("Cô Nhiều");
  await noSeriousA11y(page);
  await form.getByRole("button", { name: "Nhập kho" }).click();
  await expect(page.getByText("Đã nhập 24 lon Pepsi lon")).toBeVisible();
  await expect.poll(() => onHand("pepsi")).toBe(24);

  await sections.getByRole("tab", { name: "Công nợ" }).click();
  await expect(page.getByTestId("debt-Cô Nhiều")).toHaveText("240.000đ · 1 phiếu");
  await page.getByLabel("Số tiền trả").fill("240k");
  await page.getByRole("radio", { name: "Chuyển khoản" }).click();
  await page.getByRole("button", { name: "Ghi trả nợ" }).click();
  await expect(page.getByText("Không còn nợ nhà cung cấp nào.")).toBeVisible();

  await sections.getByRole("tab", { name: "Tồn" }).click();
  await expect(page.getByTestId("onhand-pepsi")).toHaveText("24 lon");
  await sections.getByRole("tab", { name: "Biên lãi" }).click();
  await expect(page.getByRole("heading", { name: "Giá vốn & biên lợi nhuận theo món" })).toBeVisible();
  await noSeriousA11y(page);
  expect(await noHorizontalScroll(page)).toBe(true);
});

test("bếp kiểm nhanh cuối ca: đếm mù, kết quả lệch sau khi lưu", async ({ page }) => {
  await seedStock({ "pan-dough": 10, "ribs-bag": 6, mozzarella: 2000, "ribs-raw": 1000 });
  await login(page, STAFF.kitchen);
  await page.goto("/admin/van-hanh?tab=viec");
  const card = page.getByRole("region", { name: "Kiểm nhanh cuối ca" });
  await expect(card).not.toContainText("2.000"); // không lộ số sổ trước khi đếm
  const inputs = card.getByRole("textbox");
  const n = await inputs.count();
  expect(n).toBeGreaterThanOrEqual(4);
  for (let i = 0; i < n; i++) await inputs.nth(i).fill("0");
  await card.getByLabel(/^Mozzarella/).fill("1900");
  await card.getByLabel(/^Đế Pan đã ủ/).fill("10");
  await card.getByRole("button", { name: "Lưu số đếm" }).click();
  const result = page.getByTestId("count-quick-result");
  await expect(result).toContainText("Mozzarella: sổ 2.000 g · đếm 1.900 g · −100 g (−5%)");
  await expect(result).toContainText("Đế Pan đã ủ: sổ 10 đế · đếm 10 đế · khớp");
  await expect.poll(() => onHand("mozzarella")).toBe(1900);
  await noSeriousA11y(page);
  expect(await noHorizontalScroll(page)).toBe(true);
});
