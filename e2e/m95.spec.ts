import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { closeDb, completeOrder, dayStatus, feedbackRows, PIN, refundRows, resetOrders, seedAppendixB, seedRiskyCustomer, seedStaff, STAFF } from "./db";

// Gói "Ngày bán" (M9.5, §18). TEST_NOW = Thứ Sáu 06/11/2026 10:00; 12 đơn Phụ lục B (#2 đã CK, còn lại COD/CK chưa về).

async function noSeriousA11y(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

async function noHorizontalScroll(page: Page) {
  const width = page.viewportSize()!.width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

async function login(page: Page, name: string) {
  await page.goto("/admin/login");
  await page.getByRole("button", { name }).click();
  await page.getByRole("textbox", { name: `PIN của ${name}` }).fill(PIN);
  await expect(page).toHaveURL(/\/admin\/(kitchen|van-hanh)$/);
}

const tabs = (page: Page) => page.getByRole("navigation", { name: "Khu vực bếp" });

test.beforeEach(async () => {
  await resetOrders();
  await seedStaff();
});
test.afterAll(closeDb);

test("khoá lò 1 chạm → trang đặt món hiện tạm ngưng; huỷ đơn COD & ghi hoàn đơn đã CK; mở lại", async ({ page }) => {
  await seedAppendixB();
  await login(page, STAFF.kitchen);
  await page.getByRole("button", { name: /Khoá lò/ }).click();
  const form = page.getByRole("region", { name: /Khoá lò/ });
  await form.getByText("Mất điện").click();
  await noSeriousA11y(page);
  await form.getByRole("button", { name: "Khoá ngay" }).click();

  const locked = page.getByRole("region", { name: /Lò đang khoá/ });
  await expect(locked).toContainText("⛔ Lò đang khoá · Mất điện");
  await expect(locked).toContainText("Đơn bị ảnh hưởng (12)");
  await expect(locked).toContainText("Đã trả 179.000đ → cần hoàn");
  expect(await dayStatus()).toMatchObject({ status: "paused", pause_message: "Quán tạm ngưng nhận đơn — Mất điện. Xin lỗi bạn!" });
  await noSeriousA11y(page);
  await noHorizontalScroll(page);

  // #1 COD → huỷ thẳng; #2 đã CK → bắt ghi hoàn tiền.
  const row = (seq: number) => locked.getByRole("listitem").filter({ hasText: new RegExp(`^#${seq}\\D`) });
  await row(1).getByRole("button", { name: "Huỷ — quán tạm ngưng" }).click();
  await expect(locked).toContainText("Đơn bị ảnh hưởng (11)");
  await row(2).getByRole("button", { name: "Huỷ — quán tạm ngưng" }).click();
  await row(2).getByText("Tiền mặt").click();
  await row(2).getByRole("button", { name: "Huỷ & ghi hoàn" }).click();
  await expect(locked).toContainText("Đơn bị ảnh hưởng (10)");
  expect(await refundRows()).toEqual([{ amount: -179_000, memo: "Tiền mặt" }]);

  await page.goto("/");
  await expect(page.getByRole("region", { name: "Trạng thái lò" })).toContainText("Quán tạm ngưng nhận đơn — Mất điện");

  await page.goto("/admin/kitchen");
  await page.getByRole("button", { name: "Mở lò" }).click();
  await expect(page.getByRole("button", { name: /Khoá lò/ })).toBeVisible();
  expect(await dayStatus()).toMatchObject({ status: "open", pause_message: null });
});

test("đơn bắt buộc trả trước hiện đếm ngược giữ suất (màn thành công, trang đơn, bếp)", async ({ page }) => {
  await seedRiskyCustomer("0912345678");
  await page.goto("/");
  await page.getByRole("button", { name: "Thêm Pan Pizza Pepperoni vào đơn" }).click();
  await page.getByRole("button", { name: /Mở đơn hàng/ }).click();
  const co = page.getByRole("dialog", { name: "Chốt đơn" });
  await co.getByRole("radio", { name: /Ghé Rêu lấy/ }).click();
  await co.getByLabel("Số điện thoại").fill("0912345678");
  await co.getByLabel("Tên", { exact: true }).fill("Lan");
  await co.getByLabel("Chuyển khoản (mã QR)").check();
  await co.getByRole("button", { name: /Đặt lò 17:00/ }).click();
  await expect(co.getByText(/Giữ suất đến 10:1\d · còn 1[456] phút/)).toBeVisible({ timeout: 10_000 });
  await expect(co.getByText("Chuyển khoản để hoàn tất")).toBeVisible();

  await co.getByRole("link", { name: "Theo dõi đơn" }).click();
  const article = page.getByRole("article");
  await expect(article.getByText(/Giữ suất đến 10:1\d/)).toBeVisible();
  await noSeriousA11y(page);

  await login(page, STAFF.kitchen);
  await tabs(page).getByRole("button", { name: "Đơn" }).click();
  await expect(page.getByText(/⏳ chờ CK · còn/).first()).toBeVisible();
});

test("thẻ nắp hộp: THU (T…) cho COD, CK cho đơn đã chuyển khoản, R khi nhận tại Rêu", async ({ page }) => {
  await seedAppendixB();
  await login(page, STAFF.kitchen);
  await tabs(page).getByRole("button", { name: "Giao" }).click();
  await expect(page.getByRole("figure", { name: /^Thẻ nắp hộp #1: ① T317 \+1C$/ })).toBeVisible();
  await expect(page.getByRole("figure", { name: /^Thẻ nắp hộp #2: ② CK \+1S$/ })).toBeVisible();
  await expect(page.getByRole("figure", { name: /^Thẻ nắp hộp #8: ⑧ T159 \+1S R$/ })).toBeVisible();

  await tabs(page).getByRole("button", { name: "Mẻ nướng" }).click();
  const batch = page.getByRole("region", { name: "Giao 17:00" });
  await batch.getByRole("button", { name: /Thẻ nắp hộp/ }).click();
  await expect(batch.getByRole("figure", { name: /^Thẻ nắp hộp #1/ })).toContainText("① T317 +1C");
  await expect(batch.getByRole("figure", { name: /^Thẻ nắp hộp #1/ })).toContainText("1/2");
  await noSeriousA11y(page);
  await noHorizontalScroll(page);
});

test("khách chấm điểm khẩu vị trên trang đơn", async ({ page }) => {
  await seedAppendixB();
  const token = await completeOrder("TH-0611-01"); // Combo Pepperoni + Sườn
  await page.goto(`/o/${token}`);
  const form = page.getByRole("region", { name: "Món hôm nay thế nào?" });
  await form.getByRole("radiogroup", { name: "Pan Pizza Pepperoni" }).getByRole("radio", { name: /Ngon/ }).click();
  await form.getByRole("radiogroup", { name: /Sườn heo/ }).getByRole("radio", { name: /Chưa hợp/ }).click();
  await form.getByRole("button", { name: "ngọt hơn" }).click();
  await form.getByLabel("Góp ý thêm (tuỳ chọn)").fill("Sườn hơi mặn");
  await noSeriousA11y(page);
  await form.getByRole("button", { name: "Gửi đánh giá" }).click();
  await expect(form.getByText(/Cảm ơn bạn!/)).toBeVisible();
  await expect(form.getByRole("button", { name: "Cập nhật đánh giá" })).toBeVisible();
  expect(await feedbackRows()).toEqual([{ ratings: { "pepperoni-pan": 3, "ribs-sv": 1 }, tags: { "ribs-sv": ["ngọt hơn"] }, comment: "Sườn hơi mặn" }]);
  await noHorizontalScroll(page);
});
