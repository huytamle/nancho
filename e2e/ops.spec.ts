import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { closeDb, expenseRows, linkTelegram, PIN, resetOrders, seedStaff, STAFF } from "./db";

// Vận hành nội bộ (M7, §17): mở/đóng ca đếm mù, ảnh Sapo, chi phí & tiền túi, hộp chi, phân công, webhook Telegram.

async function noSeriousA11y(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

async function login(page: Page, name: string, landing: RegExp) {
  await page.goto("/admin/login");
  await page.getByRole("button", { name }).click();
  await page.getByRole("textbox", { name: `PIN của ${name}` }).fill(PIN);
  await expect(page).toHaveURL(landing);
}

const tabs = (page: Page) => page.getByRole("navigation", { name: "Khu vực vận hành" });
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

// Ảnh bất kỳ cho ô "Ảnh báo cáo chốt ca Sapo" — client nén lại thành JPEG trước khi tải lên.
const PHOTO = "public/icons/icon-192.png";

test.beforeEach(async () => {
  await resetOrders();
  await seedStaff();
});
test.afterAll(closeDb);

test("pha chế: vào thẳng Vận hành, mở ca → đóng ca kèm ảnh Sapo; số đáng có chỉ hiện sau khi đếm", async ({ page }) => {
  await login(page, STAFF.barista, /\/admin\/van-hanh$/);
  await expect(tabs(page).getByRole("button")).toHaveText(["Ca & két", "Việc", "Công", "Kho", "Sổ tay", "Nhân viên"]);
  await expect(page.getByRole("link", { name: "Bếp" })).toHaveCount(0);

  await page.getByRole("textbox", { name: "Số tờ 500.000" }).first().fill("2");
  await expect(page.getByTestId("open-total")).toHaveText("1.000.000đ");
  await page.getByRole("button", { name: "Mở ca", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Lần mở ca đầu tiên" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Ca đang mở · từ \d\d:\d\d · Pha chế Vy/ })).toBeVisible();
  // Đếm mù: chưa có chữ "đáng có" trước khi đóng ca.
  await expect(page.getByText(/đáng có/)).toHaveCount(0);

  await page.getByLabel("Tiền mặt").fill("350000");
  await page.getByLabel("Chuyển khoản / MoMo").fill("120000");
  await expect(page.getByRole("button", { name: "Đóng ca", exact: true })).toBeDisabled();
  await page.locator("#sapo-photo").setInputFiles(PHOTO);
  await expect(page.getByText("Đổi ảnh")).toBeVisible();
  await page.locator("#close-500000").fill("2");
  await page.locator("#close-100000").fill("3");
  await page.locator("#close-10000").fill("3");
  await expect(page.getByTestId("close-total")).toHaveText("1.330.000đ");
  await page.getByLabel("Số tiền").fill("1tr");
  await expect(page.getByText("= 1.000.000đ")).toBeVisible();
  await page.getByRole("button", { name: "Đóng ca", exact: true }).click();
  // Checklist Đóng ca (M8) chưa làm → hỏi lại một lần, không chặn cứng.
  await expect(page.getByRole("alert").filter({ hasText: "Checklist chưa xong: Đóng ca (0/7)" })).toBeVisible();
  await page.getByRole("button", { name: "Vẫn đóng ca" }).click();
  // Đáng có = 1.000.000 + 350.000 → thiếu 20.000.
  await expect(page.getByRole("status").filter({ hasText: "Đếm được 1.330.000đ · đáng có 1.350.000đ" })).toContainText("lệch −20.000đ");
  await expect(page.getByRole("heading", { name: "Mở ca — đếm két" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Các ca gần đây" })).toContainText("để lại 330.000đ");
  expect(await noHorizontalScroll(page)).toBe(true);
  await noSeriousA11y(page);
});

test("quản lý ghi chi; tiền túi không tự duyệt; chủ quán duyệt + hoàn từ hộp chi; hộp chi cập nhật", async ({ page }) => {
  await login(page, STAFF.manager, /\/admin\/kitchen$/);
  await page.getByRole("link", { name: "Vận hành" }).click();
  await expect(page).toHaveURL(/\/admin\/van-hanh/);
  await tabs(page).getByRole("button", { name: "Chi phí" }).click();

  await page.getByLabel("Số tiền").fill("150k");
  await page.getByLabel("Chi cho gì").fill("đá viên");
  await expect(page.getByLabel("Nhóm")).toHaveValue("nl-cafe");
  await page.getByRole("button", { name: "Ghi chi" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Đã ghi C\d+/ })).toBeVisible();
  await expect(page.getByTestId("month-total")).toHaveText("150.000đ");

  await page.getByLabel("Số tiền").fill("1tr2");
  await page.getByLabel("Chi cho gì").fill("phô mai 5kg");
  await page.getByRole("radio", { name: "Tiền túi" }).click();
  await page.getByRole("button", { name: "Ghi chi" }).click();
  const pocket = page.getByRole("region", { name: "Tiền túi chờ duyệt / hoàn" });
  await expect(pocket).toContainText("phô mai 5kg");
  await expect(pocket.getByRole("button", { name: "Duyệt" })).toHaveCount(0);
  await noSeriousA11y(page);

  await page.getByRole("button", { name: /Đăng xuất/ }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await login(page, STAFF.owner, /\/admin\/kitchen$/);
  await page.goto("/admin/van-hanh?tab=chi");
  await pocket.getByRole("button", { name: "Duyệt" }).click();
  await pocket.getByRole("button", { name: "Hoàn từ hộp chi" }).click();
  await expect(pocket).toHaveCount(0);
  expect((await expenseRows()).map((e) => [e.amount, e.source, e.status])).toEqual([
    [150_000, "petty", "recorded"],
    [1_200_000, "pocket", "reimbursed"],
  ]);

  await tabs(page).getByRole("button", { name: "Ca & két" }).click();
  await expect(page.getByTestId("petty-state")).toHaveText("Định mức 1.000.000đ · đã chi chưa nạp bù 1.350.000đ");
  await page.getByRole("button", { name: "Nạp bù 1.350.000đ" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã nạp bù 1.350.000đ cho 2 chứng từ" })).toBeVisible();
  await expect(page.getByTestId("petty-state")).toContainText("đã chi chưa nạp bù 0đ");
});

test("phân công: quản lý thêm vai Bếp cho pha chế, không cấp được Quản lý", async ({ page }) => {
  await login(page, STAFF.manager, /\/admin\/kitchen$/);
  await page.goto("/admin/van-hanh?tab=nhan-vien");
  const row = page.getByRole("group", { name: `Phân công vai trò: ${STAFF.barista}` });
  await expect(row.getByRole("checkbox", { name: "Quản lý" })).toBeDisabled();
  await row.getByText("Bếp", { exact: true }).click();
  await page.getByRole("button", { name: "Lưu vai trò" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã lưu" })).toBeVisible();
  await expect(row.getByRole("checkbox", { name: "Bếp" })).toBeChecked();
  await expect(page.getByRole("button", { name: "Liên kết Telegram" })).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  await noSeriousA11y(page);
});

test("webhook Telegram: sai secret 401; /chi của quản lý đã liên kết → chứng từ; gửi lại không ghi đôi", async ({ request }) => {
  await linkTelegram(STAFF.manager, 55501);
  const url = "/api/webhooks/telegram";
  const update = {
    update_id: 880001,
    message: { message_id: 1, from: { id: 55501 }, chat: { id: -100777, type: "supergroup" }, text: "/chi@TheHeatTestBot 320.000 gas #ck" },
  };
  expect((await request.post(url, { data: update })).status()).toBe(401);
  expect((await request.post(url, { data: update, headers: { "x-telegram-bot-api-secret-token": "sai" } })).status()).toBe(401);
  const headers = { "x-telegram-bot-api-secret-token": "e2e-telegram-secret" };
  expect((await request.post(url, { data: update, headers })).status()).toBe(200);
  expect((await request.post(url, { data: update, headers })).status()).toBe(200);
  expect(await expenseRows()).toEqual([{ amount: 320_000, description: "gas", source: "bank", status: "recorded", category: "dien-nuoc" }]);
  // Ảnh vận hành cần đăng nhập.
  expect((await request.get("/api/ops/files/00000000-0000-4000-8000-000000000000")).status()).toBe(401);
});
