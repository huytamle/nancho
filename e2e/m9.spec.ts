import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { closeDb, PIN, resetOrders, seedStaff, seedTimeEntries, STAFF } from "./db";

// M9 (§17.7): vào/ra ca một chạm; quản lý gửi bảng công tháng trước → nhân viên xác nhận bằng PIN (khoá);
// chủ quán đặt đơn giá → tính phiếu lương → duyệt → trả → nhân viên bấm Đã nhận. TEST_NOW = 06/11/2026.

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

const tabs = (page: Page) => page.getByRole("navigation", { name: "Khu vực vận hành" });
// So với bề rộng viewport thật: Chromium mobile tự thu nhỏ trang khi tràn (innerWidth tăng theo) nên so innerWidth không bắt được.
const noHorizontalScroll = (page: Page) => page.evaluate((w) => document.documentElement.scrollWidth <= w, page.viewportSize()!.width);

test.beforeEach(async () => {
  await resetOrders();
  await seedStaff();
});
test.afterAll(closeDb);

test("pha chế vào ca → ra ca một chạm", async ({ page }) => {
  await login(page, STAFF.barista);
  await tabs(page).getByRole("button", { name: "Công" }).click();
  await expect(page).toHaveURL(/tab=cong/);
  const clock = page.getByRole("region", { name: "Chưa vào ca" });
  await clock.getByRole("button", { name: "Vào ca" }).click();
  await expect(page.getByRole("heading", { name: /^Đang trong ca từ \d\d:\d\d$/ })).toBeVisible();
  await expect(page.getByText(/^Đã vào ca \d\d:\d\d$/)).toBeVisible();
  // Không có phần quản lý cho nhân viên.
  await expect(page.getByRole("region", { name: /Cần xem lại/ })).toHaveCount(0);
  await expect(page.getByRole("region", { name: /^Lịch ca \d/ })).toHaveCount(0);
  expect(await noHorizontalScroll(page)).toBe(true);
  await noSeriousA11y(page);

  await page.getByRole("button", { name: "Ra ca" }).click();
  await expect(page.getByRole("heading", { name: "Chưa vào ca" })).toBeVisible();
  await expect(page.getByText(/^Đã ra ca · \d+ phút$/)).toBeVisible();
  await page.getByText(/^Các lượt \(1\)$/).click();
  await expect(page.getByRole("region", { name: "Giờ công 11/2026" }).getByRole("listitem")).toHaveCount(1);
});

test("bảng công tháng 10 → xác nhận PIN → phiếu lương → đã nhận", async ({ page }) => {
  await seedTimeEntries(STAFF.barista, [
    ["2026-10-02", "16:00", "22:20"],
    ["2026-10-03", "16:00", "22:00"],
  ]);

  // Quản lý: thấy bảng công 10/2026 của Vy (không phải của mình), xếp lịch, gửi.
  await login(page, STAFF.manager);
  await page.goto("/admin/van-hanh?tab=cong");
  await expect(tabs(page).getByRole("button")).toHaveText(["Ca & két", "Việc", "Công", "Chi phí", "Sổ tay", "Nhân viên"]);
  const sheets = page.getByRole("region", { name: "Bảng công 10/2026" });
  await expect(sheets.getByText("Pha chế Vy")).toBeVisible();
  await expect(sheets.getByText("Quản lý Mai")).toHaveCount(0);
  await expect(sheets.getByText("12 giờ 20 phút")).toBeVisible();
  await expect(page.getByText(/\dđ/)).toHaveCount(0); // không một số tiền nào ở màn Công của quản lý
  expect(await noHorizontalScroll(page)).toBe(true);
  await noSeriousA11y(page);
  await sheets.getByRole("button", { name: "Gửi để xác nhận" }).click();
  await expect(sheets.getByText("chờ xác nhận")).toBeVisible();

  // Nhân viên: xác nhận bằng PIN.
  await login(page, STAFF.barista);
  await page.goto("/admin/van-hanh?tab=cong");
  const mine = page.getByRole("region", { name: "Bảng công 10/2026" });
  await expect(mine.getByText("Quản lý đã gửi")).toBeVisible();
  await mine.getByLabel("PIN của bạn (6 số)").fill("000000");
  await mine.getByRole("button", { name: "Xác nhận bảng công" }).click();
  await expect(page.getByText("Sai PIN — thử lại.")).toBeVisible();
  await mine.getByLabel("PIN của bạn (6 số)").fill(PIN);
  await mine.getByRole("button", { name: "Xác nhận bảng công" }).click();
  await expect(page.getByText("Đã xác nhận — bảng công đã khoá.")).toBeVisible();
  await expect(mine.getByText(/^Đã xác nhận \d\d:\d\d \d\d\/\d\d · mã [0-9a-f]{8}$/)).toBeVisible();

  // Chủ quán: đơn giá → tính phiếu → duyệt → chuyển khoản.
  await login(page, STAFF.owner);
  await page.goto("/admin/van-hanh?tab=luong");
  await expect(tabs(page).getByRole("button")).toHaveText(["Ca & két", "Việc", "Công", "Chi phí", "Lương", "Sổ tay", "Nhân viên"]);
  expect(await noHorizontalScroll(page)).toBe(true);
  await tabs(page).getByRole("button", { name: "Công" }).click();
  expect(await noHorizontalScroll(page)).toBe(true);
  await tabs(page).getByRole("button", { name: "Lương" }).click();
  const rates = page.getByRole("region", { name: "Đơn giá giờ" });
  const vyRate = rates.getByRole("listitem").filter({ hasText: STAFF.barista });
  await vyRate.getByLabel("Đơn giá (đ/giờ)").fill("25000");
  await vyRate.getByLabel("Áp dụng từ ngày").fill("2026-10-01");
  await vyRate.getByRole("button", { name: "Lưu" }).click();
  await expect(vyRate.getByText("25.000đ/giờ")).toBeVisible();

  await page.getByRole("button", { name: "Tính phiếu lương" }).click();
  await expect(page.getByText("Đã tính 1 phiếu")).toBeVisible();
  const slip = page.getByRole("region", { name: STAFF.barista });
  // 740 phút × 25.000đ/60 = 308.333đ; 20 phút đêm × 30% = 2.500đ; không doanh thu → quỹ thưởng 0.
  await expect(slip.getByRole("row", { name: /Lương theo giờ/ })).toContainText("308.333đ");
  await expect(slip.getByRole("row", { name: /Phụ cấp làm đêm/ })).toContainText("2.500đ");
  await noSeriousA11y(page);
  await slip.getByRole("button", { name: "Duyệt lương" }).click();
  await expect(slip.getByText("đã duyệt")).toBeVisible();
  await slip.getByRole("button", { name: "Đã chuyển khoản" }).click();
  await expect(slip.getByText("đã trả", { exact: true })).toBeVisible();

  // Nhân viên: phiếu lương của mình, bấm Đã nhận.
  await login(page, STAFF.barista);
  await page.goto("/admin/van-hanh?tab=cong");
  const paid = page.getByRole("region", { name: "Phiếu lương 10/2026" });
  await expect(paid.getByText(/Đã trả .* · chuyển khoản/)).toBeVisible();
  await paid.getByRole("button", { name: "Đã nhận lương" }).click();
  await expect(paid.getByText(/Đã nhận ✓/)).toBeVisible();
});
