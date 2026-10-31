import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { closeDb, orderStatus, PIN, resetOrders, seedAppendixB, seedStaff, STAFF } from "./db";

// Kitchen Dashboard (M5). TEST_NOW = Thứ Sáu 06/11/2026 10:00 → Bảng Chuẩn Bị là bản tạm tính của 12 đơn Phụ lục B.

async function noSeriousA11y(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

async function login(page: Page, name: string, pin = PIN) {
  await page.goto("/admin/login");
  await page.getByRole("button", { name }).click();
  await page.getByRole("textbox", { name: `PIN của ${name}` }).fill(pin);
  if (pin === PIN) await expect(page).toHaveURL(/\/admin\/kitchen$/);
}

const tabs = (page: Page) => page.getByRole("navigation", { name: "Khu vực bếp" });

test.beforeEach(async () => {
  await resetOrders();
  await seedStaff();
  await seedAppendixB();
});
test.afterAll(closeDb);

test("chưa đăng nhập bị chuyển về /admin/login; sai PIN báo lỗi", async ({ page }) => {
  await page.goto("/admin/kitchen?ngay=2026-11-06&tab=don");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await login(page, STAFF.owner, "000000");
  await expect(page.locator("#pin-msg")).toHaveText("Sai PIN — thử lại.");
  await noSeriousA11y(page);
});

test("owner: Bảng Chuẩn Bị khớp Phụ lục B; trang đạt axe", async ({ page }) => {
  await login(page, STAFF.owner);
  await expect(page).toHaveURL(/\/admin\/kitchen$/);
  await expect(tabs(page).getByRole("button")).toHaveText(["Chuẩn bị", "Mẻ nướng", "Đơn", "Giao", "Cài đặt"]);

  await expect(page.getByText(/⏳ TẠM TÍNH · còn 5 giờ \d+ phút · 12 đơn/)).toBeVisible();
  await expect(page.getByTestId("prep-mains")).toHaveText("9 Pizza · 6 BBQ");
  await expect(page.getByTestId("ing-pan-dough")).toHaveText("9 đế");
  await expect(page.getByTestId("ing-ribs-bag")).toHaveText("6 túi (≈3 kg)");
  await expect(page.getByTestId("ing-mozzarella")).toHaveText("1.620 g");
  await expect(page.getByTestId("ing-jar-garlic-butter")).toHaveText("7 hũ");
  await expect(page.getByText("4 bán · 3 tặng")).toBeVisible();
  await expect(page.getByTestId("ing-cold-brew-bottle")).toHaveText("4 chai");
  await expect(page.getByRole("button", { name: /Mẻ 16:40 → Giao 17:00 · 3 Pizza \+ 2 BBQ/ })).toContainText("Tuấn · Lan · Huy");
  await expect(page.getByRole("button", { name: /Mẻ 17:40 → Giao 18:00 · 4 Pizza \+ 3 BBQ/ })).toContainText("Cà phê Rêu: Khánh");
  await expect(page.getByRole("button", { name: /Mẻ 18:40 → Giao 19:00 · 2 Pizza \+ 1 BBQ/ })).toBeVisible();
  await expect(page.getByText('#7 ghi chú: "Ít cay, dị ứng đậu phộng"')).toBeVisible();

  // Tick "đã lấy" nhớ theo ngày.
  const dough = page.getByRole("checkbox", { name: /Đế Pan đã ủ/ });
  await dough.check();
  await page.reload();
  await expect(dough).toBeChecked();
  await noSeriousA11y(page);
});

test("Mẻ nướng: [Đút lò] / [Ra lò] đổi trạng thái cả mẻ", async ({ page }) => {
  await login(page, STAFF.kitchen);
  await expect(tabs(page).getByRole("button")).toHaveText(["Chuẩn bị", "Mẻ nướng", "Đơn", "Giao"]);
  await page.getByRole("button", { name: /Mẻ 16:40 → Giao 17:00/ }).click();
  const card = page.getByRole("region", { name: "Giao 17:00" });
  await expect(card).toContainText("#1");
  await card.getByRole("button", { name: /Đút lò \(3\)/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã chuyển 3 đơn" })).toBeVisible();
  expect(await orderStatus("TH-0611-01")).toBe("baking");
  await card.getByRole("button", { name: /Ra lò \(3\)/ }).click();
  await expect.poll(() => orderStatus("TH-0611-03")).toBe("ready");
  expect(await orderStatus("TH-0611-04")).toBe("confirmed"); // mẻ khác không đổi
  await noSeriousA11y(page);
});

test("shipper chỉ thấy tab Giao; bắt đầu giao tuyến & kết thúc điểm", async ({ page }) => {
  await login(page, STAFF.kitchen);
  await page.getByRole("button", { name: /Mẻ 16:40 → Giao 17:00/ }).click();
  const card = page.getByRole("region", { name: "Giao 17:00" });
  await card.getByRole("button", { name: /Đút lò/ }).click();
  await expect.poll(() => orderStatus("TH-0611-01")).toBe("baking");
  await card.getByRole("button", { name: /Ra lò \(3\)/ }).click();
  await expect.poll(() => orderStatus("TH-0611-01")).toBe("ready");
  await page.getByRole("button", { name: /Đăng xuất/ }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);

  await login(page, STAFF.shipper);
  await expect(tabs(page).getByRole("button")).toHaveText(["Giao"]);
  const route = page.getByRole("article", { name: "Tuyến Khu phố 2" }).first();
  await expect(route).toContainText("3 điểm · Thu 616.000đ");
  await route.getByRole("button", { name: "Bắt đầu giao tuyến" }).click();
  await expect.poll(() => orderStatus("TH-0611-02")).toBe("delivering");
  await route.getByRole("listitem").filter({ hasText: "#1 Tuấn" }).getByRole("button", { name: "Đã giao" }).click();
  await expect.poll(() => orderStatus("TH-0611-01")).toBe("completed");
  // Shipper không vào được bản in / tab khác.
  await page.goto("/admin/kitchen?ngay=2026-11-06&tab=chuan-bi");
  await expect(tabs(page).getByRole("button")).toHaveText(["Giao"]);
  await noSeriousA11y(page);
});

test("link Telegram mở tab Đơn; thêm đơn nhanh gọi điện", async ({ page }) => {
  await login(page, STAFF.kitchen);
  await page.goto("/admin/kitchen?ngay=2026-11-06&tab=don");
  await expect(page.getByRole("heading", { level: 1, name: "Đơn" })).toBeAttached();
  await expect(page.getByText("12 đơn", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.getByLabel("Tìm SĐT, tên, mã đơn").fill("vy");
  await expect(page.getByText("1 đơn", { exact: true })).toBeVisible();
  await page.getByLabel("Tìm SĐT, tên, mã đơn").fill("");

  await page.getByRole("button", { name: "+ Thêm đơn nhanh" }).click();
  const sheet = page.getByRole("dialog", { name: "Thêm đơn nhanh" });
  await sheet.getByLabel("Số điện thoại").fill("0977123456");
  await sheet.getByLabel("Tên khách").fill("Cô Ba");
  await sheet.getByRole("button", { name: "+ Pepperoni" }).click();
  await sheet.getByRole("radio", { name: "Nhận tại Cà phê Rêu" }).click();
  await sheet.getByRole("radio", { name: /^19:00/ }).click();
  await sheet.getByRole("button", { name: "Lưu đơn" }).click();
  // Toast "Đã thêm #13" có thể bị toast "Đơn mới #13" của lần làm mới thay thế → kiểm tra danh sách.
  await expect(page.getByRole("button", { name: /^#13 Cô Ba 0977 123 456 Đã xác nhận Mẻ 19:00 · Nhận tại Cà phê Rêu · Gọi điện/ })).toBeVisible();
  await expect(page.getByText("13 đơn", { exact: true })).toBeVisible();
  expect(await orderStatus("TH-0611-13")).toBe("confirmed");
  await noSeriousA11y(page);
});
