import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { closeDb, onHand, PIN, resetOrders, seedClosedShift, seedPayRate, seedStaff, seedTimeEntries, STAFF } from "./db";

// M11 (§17.10): tab Chỉ số (owner thấy chi phí nhân sự, quản lý không); pha chế nhập số bán café từ Sapo → trừ kho.
// TEST_NOW = Thứ Sáu 06/11/2026 10:00.

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
const noHorizontalScroll = (page: Page) => page.evaluate((w) => document.documentElement.scrollWidth <= w, page.viewportSize()!.width);

test.beforeEach(async () => {
  await resetOrders();
  await seedStaff();
});
test.afterAll(closeDb);

test("chỉ số tháng: owner thấy chi phí nhân sự, quản lý thì không", async ({ page }) => {
  await seedClosedShift(STAFF.barista, "2026-11-05", 1_200_000, 300_000, 1_180_000);
  await seedTimeEntries(STAFF.barista, [["2026-11-05", "07:00", "15:00"]]);
  await seedPayRate(STAFF.barista, 25_000);

  await login(page, STAFF.owner);
  await page.goto("/admin/van-hanh");
  await opsTabs(page).getByRole("button", { name: "Chỉ số" }).click();
  await expect(page).toHaveURL(/tab=chi-so/);
  await expect(page.getByTestId("m-month-revenue")).toHaveText("1.500.000đ");
  await expect(page.getByTestId("m-rev-cafe")).toHaveText("1.500.000đ");
  await expect(page.getByTestId("m-labor")).toHaveText("200.000đ");
  await expect(page.getByTestId("m-per-hour")).toHaveText("187.500đ");
  await expect(page.getByText("−20.000đ")).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  await noSeriousA11y(page);

  await login(page, STAFF.manager);
  await page.goto("/admin/van-hanh?tab=chi-so");
  await expect(page.getByTestId("m-before-labor")).toBeVisible();
  await expect(page.getByTestId("m-labor")).toHaveCount(0);
  await expect(page.getByText("Chi phí nhân sự")).toHaveCount(0);
});

test("pha chế dán bảng Sapo → xem trước → trừ kho theo định lượng", async ({ page }) => {
  await login(page, STAFF.barista);
  await page.goto("/admin/van-hanh?tab=kho");
  await page.getByRole("tablist", { name: "Phần của kho" }).getByRole("tab", { name: "Café" }).click();
  const form = page.getByRole("region", { name: "Nhập số bán café từ Sapo" });
  await expect(form.getByLabel("Ngày bán")).toHaveValue("2026-11-05");
  await form.getByLabel("Hoặc dán bảng từ Excel").fill("Tên hàng\tSố lượng\nEspresso\t10\nFlat white\t2\nBánh quy\t3");
  await form.getByRole("button", { name: "Xem trước" }).click();
  const preview = page.getByTestId("cafe-preview");
  await expect(preview.getByText("2 món khớp")).toBeVisible();
  await expect(preview.getByText(/Chưa khớp.*Bánh quy/)).toBeVisible();
  await noSeriousA11y(page);
  await preview.getByRole("button", { name: "Trừ kho theo 2 món" }).click();
  await expect(page.getByText("Đã trừ kho theo 2 món")).toBeVisible();
  // Espresso 18 g × 10 + Flat white 18 g × 2 = 216 g hạt; 150 ml × 2 sữa.
  await expect.poll(() => onHand("coffee-beans")).toBe(-216);
  expect(await onHand("fresh-milk")).toBe(-300);
  await expect(form.getByText(/T5 05\/11 · 12 ly · 2 món/)).toBeVisible();
  // Pha chế không sửa được món/định lượng.
  await expect(page.getByRole("region", { name: "Món café & định lượng" })).toHaveCount(0);
  expect(await noHorizontalScroll(page)).toBe(true);
});
