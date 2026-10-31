import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { closeDb, orderStatus, resetOrders, setUsedPan } from "./db";

// Luồng đặt món (M3–M4). Server chạy với TEST_NOW = Thứ Sáu 06/11/2026 10:00 (giờ VN) và DB đã seed cho mốc đó;
// placeOrder ghi DB thật → mỗi test dọn đơn/khách/suất trước khi chạy (workers: 1).

async function noSeriousA11y(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

const ovenBar = (page: Page) => page.getByRole("region", { name: "Trạng thái lò" });

test.beforeEach(async ({ page }) => {
  await resetOrders();
  await page.goto("/");
  await expect(ovenBar(page).getByRole("radio", { name: /17:00/ })).toBeVisible();
});

test("Oven Bar: trạng thái, đếm ngược, chip giờ; trang đạt axe", async ({ page }) => {
  await expect(page).toHaveTitle(/THE HEAT PIZZA/);
  const bar = ovenBar(page);
  await expect(bar).toContainText("Đang nhận đặt trước cho tối nay");
  await expect(bar).toContainText(/Chốt đơn mẻ 1 lúc 15:30 · còn \d giờ( \d+ phút)?/);
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
  await expect(co.getByText("Đơn #1 đã giữ chỗ ở mẻ 17:00")).toBeVisible({ timeout: 10_000 });
  await expect(co.getByRole("link", { name: "Theo dõi đơn" })).toHaveAttribute("href", /^\/o\/[\w-]{22}$/);
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
  await expect(co).toContainText("TH061101");
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

test.afterAll(closeDb);

async function addPepperoniAndCheckout(page: Page) {
  await page.getByRole("button", { name: "Thêm Pan Pizza Pepperoni vào đơn" }).click();
  await page.getByRole("button", { name: /Mở đơn hàng/ }).click();
  return page.getByRole("dialog", { name: "Chốt đơn" });
}

async function fillDelivery(co: ReturnType<Page["getByRole"]>, address = "Nhà mái tôn xanh, cạnh tạp hoá Cô Ba") {
  await co.getByLabel("Số điện thoại").fill("0912345678");
  await co.getByLabel("Tên", { exact: true }).fill("Tuấn");
  await co.getByLabel("Thôn/Khu phố").selectOption({ label: "Khu phố 2 — 10.000đ" });
  await co.getByLabel("Mô tả nhà").fill(address);
}

test("mẻ vừa kín lò → chạm mẻ gợi ý để chuyển và đặt lại", async ({ page }) => {
  const co = await addPepperoniAndCheckout(page);
  await fillDelivery(co);
  await setUsedPan("17:00", 4); // khách khác vừa lấy hết suất cuối trong lúc mình điền
  await co.getByRole("button", { name: "Đặt lò 17:00 · 169.000đ" }).click();
  const banner = co.getByRole("alert").filter({ hasText: "Mẻ 17:00 vừa kín lò" });
  await expect(banner).toBeVisible({ timeout: 10_000 });
  await banner.getByRole("button", { name: "18:00 · Còn 4 suất" }).click();
  await expect(co.getByText("Đơn #1 đã giữ chỗ ở mẻ 18:00")).toBeVisible({ timeout: 10_000 });
});

test("theo dõi đơn /o/[token]: dòng thời gian, chi tiết, huỷ trước giờ chốt", async ({ page }) => {
  const co = await addPepperoniAndCheckout(page);
  await fillDelivery(co);
  await co.getByRole("button", { name: /Đặt lò 17:00/ }).click();
  await co.getByRole("link", { name: "Theo dõi đơn" }).click();

  await expect(page).toHaveURL(/\/o\/[\w-]{22}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Đơn #1" })).toBeVisible();
  await expect(page.getByRole("article").getByText("TH-0611-01")).toBeVisible();
  await expect(page.locator('[aria-current="step"]')).toHaveText("Đã nhận đơn");
  await expect(page.getByText("Giao tới Khu phố 2 khoảng 17:00–17:20")).toBeVisible();
  await expect(page.getByText("Bếp đút lò 16:40")).toBeVisible();
  await expect(page.getByRole("article")).toContainText("Tổng169.000đ");
  const robots = await page.locator('meta[name="robots"]').getAttribute("content");
  expect(robots).toContain("noindex");
  await noSeriousA11y(page);

  await page.getByRole("button", { name: "Huỷ đơn" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Huỷ đơn" }).click();
  await expect(page.getByText("Đơn đã huỷ. Hẹn bạn lần sau nhé!")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Huỷ đơn" })).toHaveCount(0);
  expect(await orderStatus("TH-0611-01")).toBe("cancelled");

  // Suất đã trả lại cho mẻ 17:00
  await page.goto("/");
  await expect(ovenBar(page).getByRole("radio", { name: "17:00, Còn 4 suất" })).toBeVisible();
});

test("khách cũ: máy có \"ghi nhớ\" tự điền đủ; máy lạ chỉ thấy tên gọi + khu vực", async ({ page }) => {
  const address = "Nhà sơn vàng, đối diện chợ Hà Lam";
  let co = await addPepperoniAndCheckout(page);
  await fillDelivery(co, address);
  await co.getByLabel("Ghi nhớ thông tin cho lần sau").check();
  await co.getByRole("button", { name: /Đặt lò 17:00/ }).click();
  await expect(co.getByText("Đơn #1 đã giữ chỗ")).toBeVisible({ timeout: 10_000 });
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "th_c")).toMatchObject({ httpOnly: true, sameSite: "Lax" });

  // Cùng máy (có cookie), nháp đã mất → gõ SĐT là tự điền đầy đủ.
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  co = await addPepperoniAndCheckout(page);
  await co.getByLabel("Số điện thoại").fill("0912 345 678");
  await expect(co.getByLabel("Tên", { exact: true })).toHaveValue("Tuấn");
  await expect(co.getByLabel("Mô tả nhà")).toHaveValue(address);
  await expect(co.getByLabel("Thôn/Khu phố")).toHaveValue("2");

  // Máy lạ: không cookie, không nháp.
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  co = await addPepperoniAndCheckout(page);
  await co.getByLabel("Số điện thoại").fill("0912345678");
  await expect(co.getByText("👋 Mừng Tuấn quay lại! Giao tới địa chỉ lần trước (Khu phố 2)?")).toBeVisible();
  await expect(co.getByLabel("Mô tả nhà")).toHaveValue("");
  expect(await page.content()).not.toContain("sơn vàng");
  await co.getByRole("button", { name: "Dùng địa chỉ này" }).click();
  await expect(co.getByText("Giao tới địa chỉ lần trước · Khu phố 2")).toBeVisible();
  await noSeriousA11y(page);
  await co.getByRole("button", { name: "Đặt lò 17:00 · 169.000đ" }).click();
  await expect(co.getByText("Đơn #2 đã giữ chỗ ở mẻ 17:00")).toBeVisible({ timeout: 10_000 });
});
