import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Luồng đặt món (M3). Server chạy với TEST_NOW = Thứ Sáu 06/11/2026 10:00 (giờ VN) và DB đã seed cho mốc đó;
// placeOrder là bản giả (E2E=1) — kiểm tra thật nhưng không ghi DB.

async function noSeriousA11y(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

const ovenBar = (page: Page) => page.getByRole("region", { name: "Trạng thái lò" });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(ovenBar(page).getByRole("radio", { name: /17:00/ })).toBeVisible();
});

test("Oven Bar: trạng thái, đếm ngược, chip giờ; trang đạt axe", async ({ page }) => {
  await expect(page).toHaveTitle(/THE HEAT PIZZA/);
  const bar = ovenBar(page);
  await expect(bar).toContainText("Đang nhận đặt trước cho tối nay");
  await expect(bar).toContainText(/Chốt đơn mẻ 1 lúc 15:30 · còn 5 giờ (29|30) phút/);
  await expect(bar.getByRole("radio", { name: "17:00, Còn 4 suất" })).toHaveAttribute("aria-checked", "true");

  await bar.getByRole("radio", { name: /18:00/ }).click();
  await expect(bar.getByRole("radio", { name: /18:00/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("status").filter({ hasText: "Đã chọn nhận lúc 18:00" })).toBeVisible();

  await bar.getByRole("radio", { name: "Mai" }).click();
  await expect(bar.getByRole("radiogroup", { name: /Giờ nhận · Mai/ })).toBeVisible();
  await noSeriousA11y(page);
});

test("đặt combo + add-on, giao tận nhà", async ({ page }) => {
  await page.getByRole("button", { name: "Xem Combo Đôi — 1 Pan Pizza + 1 BBQ" }).click();
  await expect(page).toHaveURL(/\?mon=combo-doi/);
  const sheet = page.getByRole("dialog", { name: /Combo Đôi/ });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Phô mai Bơ tỏi").check();
  await sheet.getByLabel("Hũ Sốt Bơ Tỏi chấm viền bánh").check();
  await sheet.getByRole("button", { name: "Tăng số lượng Combo Đôi — 1 Pan Pizza + 1 BBQ" }).click();
  await expect(sheet.getByRole("button", { name: /Thêm vào đơn · 588\.000đ/ })).toBeVisible();
  await noSeriousA11y(page);
  await sheet.getByRole("button", { name: /Thêm vào đơn/ }).click();
  await expect(page).not.toHaveURL(/mon=/);

  const cartBar = page.getByRole("button", { name: /Mở đơn hàng: 2 món, Nhận 17:00, 588\.000đ/ });
  await cartBar.click();
  await expect(page).toHaveURL(/buoc=chot-don/);
  const co = page.getByRole("dialog", { name: "Chốt đơn" });
  await expect(co).toContainText("(Phô mai Bơ tỏi + Sườn heo BBQ Sous-vide 24h)");

  // Lỗi hiện khi bấm đặt mà còn thiếu
  await co.getByRole("button", { name: /Đặt lò 17:00/ }).click();
  await expect(co.getByText("Số này có vẻ chưa đúng")).toBeVisible();
  await expect(co.getByLabel("Số điện thoại")).toBeFocused();

  await co.getByLabel("Số điện thoại").fill("+84912345678");
  await expect(co.getByLabel("Số điện thoại")).toHaveValue("0912 345 678");
  await co.getByLabel("Tên", { exact: true }).fill("Tuấn");
  await co.getByLabel("Thôn/Khu phố").selectOption({ label: "Khu phố 2 — 10.000đ" });
  await co.getByLabel("Mô tả nhà").fill("Nhà mái tôn xanh, cạnh tạp hoá Cô Ba");
  await expect(co.getByRole("button", { name: "Đặt lò 17:00 · 598.000đ" })).toBeVisible();
  await noSeriousA11y(page);

  await co.getByRole("button", { name: "Đặt lò 17:00 · 598.000đ" }).click();
  await expect(co.getByText(/Đơn #\d+ đã giữ chỗ ở mẻ 17:00/)).toBeVisible({ timeout: 10_000 });
  await expect(co).toContainText("khoảng 17:00–17:20");
  await co.getByRole("button", { name: "Xong" }).click();
  await expect(page.getByRole("button", { name: /Mở đơn hàng/ })).toHaveCount(0);
});

test("nhận tại Rêu: free ship + quà; chuyển khoản hiện nội dung CK", async ({ page }) => {
  await page.getByRole("button", { name: "Thêm Pan Pizza Pepperoni vào đơn" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã thêm" })).toBeVisible();
  await page.getByRole("button", { name: /Mở đơn hàng/ }).click();
  const co = page.getByRole("dialog", { name: "Chốt đơn" });
  await co.getByRole("radio", { name: /Ghé Rêu lấy/ }).click();
  await expect(co).toContainText("🎁 Hũ Sốt Bơ Tỏi chấm viền bánh");
  await expect(co).toContainText("Ship 0đ");
  await co.getByLabel("Số điện thoại").fill("0912345678");
  await co.getByLabel("Tên", { exact: true }).fill("Lan");
  await co.getByLabel("Chuyển khoản (mã QR)").check();
  await co.getByRole("button", { name: "Đặt lò 17:00 · 159.000đ" }).click();
  await expect(co.getByText("Chuyển khoản để hoàn tất")).toBeVisible({ timeout: 10_000 });
  await expect(co).toContainText(/TH0611\d{2}/);
  await expect(co).toContainText("17:00 tại Cà phê Rêu");
});

test("Back đóng sheet; giỏ còn sau khi tải lại", async ({ page }) => {
  await page.getByRole("button", { name: "Xem Pan Pizza Pepperoni" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole("button", { name: "Thêm Pan Pizza Pepperoni vào đơn" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: /Mở đơn hàng: 1 món/ })).toBeVisible();

  // Link chia sẻ mở thẳng sheet; đóng → về "/" bằng replace
  await page.goto("/?mon=ribs-sv");
  const sheet = page.getByRole("dialog", { name: /Sườn heo/ });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Đóng" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
});

test("hoàn tác thêm nhanh", async ({ page }) => {
  await page.getByRole("button", { name: "Thêm Pan Pizza Pepperoni vào đơn" }).click();
  await page.getByRole("button", { name: "Hoàn tác" }).click();
  await expect(page.getByRole("button", { name: /Mở đơn hàng/ })).toHaveCount(0);
});

test("reduced-motion: sheet mở/đóng không phụ thuộc animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Xem BBQ #2" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const duration = await dialog.evaluate((d) => getComputedStyle(d.querySelector(".sheet-panel")!).transitionDuration);
  expect(parseFloat(duration)).toBeLessThan(0.01);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
