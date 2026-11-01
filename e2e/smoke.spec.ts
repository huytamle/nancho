import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function expectNoSeriousA11yIssues(page: import("@playwright/test").Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

test("trang chủ: landing + app đặt món, theo theme máy (tối)", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page).toHaveTitle(/THE HEAT PIZZA/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Nướng bằng lửa");
  await expect(page.getByRole("button", { name: /Thêm Pan Pizza Pepperoni/ })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(0, 0, 0)");
  await expectNoSeriousA11yIssues(page);
  // Nút đổi theme: sang sáng, nhớ qua lần tải lại.
  await page.getByRole("button", { name: "Chuyển sang giao diện sáng" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(245, 245, 247)");
  await expectNoSeriousA11yIssues(page);
});

test("không có thanh cuộn ngang ở màn hình nhỏ", async ({ page }) => {
  for (const path of ["/", "/tai-quan"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("trang tại quán có café, gelato và form đặt bàn", async ({ page }) => {
  await page.goto("/tai-quan");
  await expect(page.getByRole("heading", { name: "Café", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gelato", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gửi đặt bàn" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

test("form đặt bàn báo lỗi khi bỏ trống", async ({ page }) => {
  await page.goto("/tai-quan");
  await page.getByRole("button", { name: "Gửi đặt bàn" }).click();
  await expect(page.getByRole("status")).toHaveText("Kiểm tra lại thông tin đặt bàn.");
  await expect(page.getByText("Nhập họ tên (tối thiểu 2 ký tự).")).toBeVisible();
  await expect(page.getByText("Chọn ngày giờ đến quán.")).toBeVisible();
});

test("trả về header bảo mật", async ({ request }) => {
  const res = await request.get("/");
  const headers = res.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
});
