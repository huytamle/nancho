import { expect, test } from "@playwright/test";
import { closeDb, resetOrders } from "./db";

// M12: cà phê giao theo khung (TEST_NOW = T6 06/11 10:00 → khung sáng đã chốt, còn 13:30–15:30),
// nước lon kèm giá ưu đãi, thành viên (cookie test `th_e2e_user` thay Clerk) có ví mã.

test.beforeEach(async ({ page }) => {
  await resetOrders();
  await page.goto("/");
});
test.afterAll(closeDb);

test("đơn cà phê: chỉ giao, tối thiểu 50k, đặt vào khung chiều", async ({ page }) => {
  await page.getByRole("tab", { name: "Cà phê" }).click();
  const bar = page.getByRole("region", { name: "Khung giao cà phê" });
  await expect(bar).toContainText("Đang nhận cà phê giao hôm nay · 13:30–15:30");
  await page.getByRole("button", { name: "Thêm Bạc xỉu vào đơn" }).click();
  await page.getByRole("button", { name: /Mở đơn hàng/ }).click();
  const co = page.getByRole("dialog", { name: "Chốt đơn" });
  await expect(co).toContainText("Đơn cà phê giao từ 50.000đ");
  await expect(co.getByRole("radio", { name: /Ghé/ })).toHaveCount(0);
  await co.getByRole("button", { name: "Tăng số lượng Bạc xỉu" }).click();
  await co.getByLabel("Số điện thoại").fill("0912345678");
  await co.getByLabel("Tên", { exact: true }).fill("Hà");
  await co.getByLabel("Thôn/Khu phố").selectOption({ label: "Khu phố 2 — 10.000đ" });
  await co.getByLabel("Mô tả nhà").fill("Nhà mái tôn xanh, cạnh tạp hoá Cô Ba");
  await co.getByRole("button", { name: "Giao 13:30–15:30 · 68.000đ" }).click();
  await expect(co.getByText("Đơn #1 đã nhận · giao 13:30–15:30")).toBeVisible({ timeout: 10_000 });
});

test("thêm pizza khi giỏ đang là cà phê → chuyển giỏ, có Hoàn tác", async ({ page }) => {
  await page.getByRole("tab", { name: "Cà phê" }).click();
  await page.getByRole("button", { name: "Thêm Bạc xỉu vào đơn" }).click();
  await page.getByRole("tab", { name: "Pizza & BBQ" }).click();
  await page.getByRole("button", { name: "Thêm Pan Pizza Pepperoni vào đơn" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã chuyển sang đơn pizza" })).toBeVisible();
  await page.getByRole("button", { name: "Hoàn tác" }).click();
  await expect(page.getByRole("button", { name: /Mở đơn hàng: 1 món, Nhận 13:30–15:30/ })).toBeVisible();
});

test("thành viên: mã chào mừng trong ví, chạm để giảm; trang tài khoản", async ({ page, context }) => {
  await context.addCookies([{ name: "th_e2e_user", value: "user_e2e_member", url: "http://localhost" }]);
  await page.goto("/tai-khoan");
  await expect(page.getByRole("heading", { name: "Ví ưu đãi" })).toBeVisible();
  await expect(page.getByText("−15.000đ")).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "Thêm Pan Pizza Pepperoni vào đơn" }).click();
  await page.getByRole("button", { name: /Mở đơn hàng/ }).click();
  const co = page.getByRole("dialog", { name: "Chốt đơn" });
  // Nước lạnh giá kèm: thẻ gợi ý một chạm
  await co.getByRole("button", { name: /\+ Pepsi/ }).click();
  await co.getByLabel("Số điện thoại").fill("0912345678");
  await co.getByRole("button", { name: /−15k/ }).click();
  await expect(co).toContainText("Giảm −15.000đ");
  await co.getByLabel("Tên", { exact: true }).fill("Minh");
  await co.getByLabel("Thôn/Khu phố").selectOption({ label: "Khu phố 2 — 10.000đ" });
  await co.getByLabel("Mô tả nhà").fill("Nhà mái tôn xanh, cạnh tạp hoá Cô Ba");
  // 159k + 10k Pepsi − 15k + 10k ship
  await co.getByRole("button", { name: "Đặt lò 17:00 · 164.000đ" }).click();
  await expect(co.getByText("Đã giảm 15.000đ")).toBeVisible({ timeout: 10_000 });
  await expect(co).toContainText("+16 điểm khi nhận hàng");
});
