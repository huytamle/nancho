import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { closeDb, PIN, resetOrders, seedStaff, STAFF } from "./db";

// M8 (§17.5–17.6): checklist mở ca theo vai trò (số đo ngoài ngưỡng, ảnh), sổ tay theo vai trò (công thức đọc
// recipe_lines, in mờ tên người xem), quản lý thêm trang. Cần DB đã `db:seed` (mẫu checklist & trang sổ tay).

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
const PHOTO = "public/icons/icon-192.png";

test.beforeEach(async () => {
  await resetOrders();
  await seedStaff();
});
test.afterAll(closeDb);

test("pha chế làm checklist mở ca: tick, số đo ngoài ngưỡng báo đỏ, xong 6/6", async ({ page }) => {
  await login(page, STAFF.barista, /\/admin\/van-hanh$/);
  await expect(tabs(page).getByRole("button")).toHaveText(["Ca & két", "Việc", "Công", "Kho", "Sổ tay", "Nhân viên"]);
  await tabs(page).getByRole("button", { name: "Việc" }).click();
  await expect(page).toHaveURL(/tab=viec/);

  // Chỉ checklist của vai pha chế/phục vụ — không có "Mở ca — Bếp". Kho (M10): cảnh báo ở đầu, kiểm nhanh ở cuối.
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Kho cần chú ý",
    "Mở ca — Quầy café",
    "Nhiệt độ tủ (giữa ca)",
    "Đóng ca",
    "Vệ sinh tuần",
    "Kiểm nhanh cuối ca",
  ]);
  const open = page.getByRole("region", { name: "Mở ca — Quầy café" });
  await expect(open.getByTestId("run-2-progress")).toHaveText("0/6");

  await open.getByRole("checkbox", { name: /Bật máy espresso/ }).check();
  await expect(open.getByTestId("run-2-progress")).toHaveText("1/6");
  await expect(open.getByText(/Pha chế Vy · \d\d:\d\d/)).toBeVisible();

  // Tủ mát 7 °C > 5 °C → đỏ + toast; nhóm Telegram nhận ⚠ (server ghi log khi thiếu token).
  await open.getByLabel(/Nhiệt độ tủ mát quầy/).fill("7");
  await open.getByRole("button", { name: "Lưu Nhiệt độ tủ mát quầy" }).click();
  await expect(page.getByText("⚠ Ngoài ngưỡng — đã báo nhóm.")).toBeVisible();
  await expect(open.getByText("7 °C · ngoài chuẩn ≤ 5 °C")).toBeVisible();
  await expect(open.getByTestId("run-2-progress")).toHaveText("2/6");

  for (const label of [/Kiểm sữa/, /Lau bàn ghế/, /Bật đèn/, /đếm két/]) await open.getByRole("checkbox", { name: label }).check();
  await expect(open.getByTestId("run-2-progress")).toHaveText("Xong ✓");

  // Bỏ tick được mục của chính mình.
  await open.getByRole("checkbox", { name: /Bật đèn/ }).uncheck();
  await expect(open.getByTestId("run-2-progress")).toHaveText("5/6");

  // Mục cần ảnh (Đóng ca → Lau sàn): chụp xong là tự đánh dấu.
  const close = page.getByRole("region", { name: "Đóng ca" });
  await close.locator("#ck-4-floor").setInputFiles(PHOTO);
  await expect(close.getByTestId("run-4-progress")).toHaveText("1/7");
  await expect(close.getByRole("link", { name: "Xem ảnh" })).toBeVisible();

  expect(await noHorizontalScroll(page)).toBe(true);
  await noSeriousA11y(page);
});

test("sổ tay theo vai trò: pha chế không mở được công thức; bếp xem định lượng từ recipe_lines kèm tên in mờ", async ({ page }) => {
  await login(page, STAFF.barista, /\/admin\/van-hanh$/);
  await tabs(page).getByRole("button", { name: "Sổ tay" }).click();
  await expect(page.getByRole("link", { name: /Phục vụ tại quán/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Pepperoni Pan/ })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Công thức" })).toHaveCount(0);

  // Gõ thẳng URL → như trang không tồn tại, không lộ nội dung.
  await page.goto("/admin/van-hanh?tab=so-tay&trang=pepperoni-pan");
  await expect(page.getByRole("alert").filter({ hasText: "Không tìm thấy trang này" })).toBeVisible();
  await expect(page.getByText("Mozzarella")).toHaveCount(0);

  await page.context().clearCookies();
  await login(page, STAFF.kitchen, /\/admin\/kitchen/);
  await page.getByRole("link", { name: "Vận hành" }).click();
  await tabs(page).getByRole("button", { name: "Sổ tay" }).click();
  await page.getByRole("link", { name: /Pepperoni Pan/ }).click();
  await expect(page).toHaveURL(/tab=so-tay&trang=pepperoni-pan/);
  const article = page.getByRole("article");
  await expect(article.getByRole("heading", { name: "Pepperoni Pan", level: 2 })).toBeVisible();
  await expect(article.getByRole("listitem").first()).toContainText("Phết dầu khuôn");
  const recipe = article.getByRole("table");
  await expect(recipe.getByRole("row", { name: /Mozzarella/ })).toContainText("180 g");
  await expect(recipe.getByRole("row", { name: /Pepperoni lát/ })).toContainText("60 g");
  await expect(article.locator("svg text")).toHaveText(/^Bếp Tâm · \d\d\/\d\d\/\d{4}$/);
  // Bếp không có nút sửa / thêm trang.
  await expect(page.getByText("Sửa trang")).toHaveCount(0);

  // Đổi tab rồi quay lại: vẫn đúng trang đang xem.
  await tabs(page).getByRole("button", { name: "Việc" }).click();
  await tabs(page).getByRole("button", { name: "Sổ tay" }).click();
  await expect(page).toHaveURL(/trang=pepperoni-pan/);

  expect(await noHorizontalScroll(page)).toBe(true);
  await noSeriousA11y(page);
});

test("quản lý thêm trang sổ tay: Markdown hiển thị đúng, chỉ vai được chọn mới thấy", async ({ page }) => {
  // Quản lý làm ở bếp (như kitchen) → đăng nhập vào Bếp, sang Vận hành.
  await login(page, STAFF.manager, /\/admin\/kitchen/);
  await page.goto("/admin/van-hanh?tab=so-tay");
  // Quản lý thấy cả công thức của bếp.
  await expect(page.getByRole("link", { name: /Pepperoni Pan/ })).toBeVisible();

  await page.getByText("+ Thêm trang").click();
  await page.getByLabel("Tiêu đề", { exact: true }).fill("Pha cold brew");
  await expect(page.getByLabel("Đường dẫn")).toHaveValue("pha-cold-brew");
  await page.getByRole("group", { name: /Ai được xem/ }).getByText("Pha chế").click();
  await page.getByLabel(/Nội dung/).fill("## Tỉ lệ\n\n1. 100 g bột\n2. 1 lít nước\n\n<script>alert(1)</script>");
  await page.getByRole("button", { name: "Lưu trang" }).click();

  await expect(page).toHaveURL(/trang=pha-cold-brew/);
  const article = page.getByRole("article");
  await expect(article.getByRole("heading", { name: "Tỉ lệ" })).toBeVisible();
  await expect(article.getByRole("listitem")).toHaveText(["100 g bột", "1 lít nước"]);
  await expect(article.getByText("<script>alert(1)</script>")).toBeVisible();
  await expect(article).toContainText("Quy trình · bản 1 · Quản lý Mai sửa");

  await page.context().clearCookies();
  await login(page, STAFF.barista, /\/admin\/van-hanh$/);
  await page.goto("/admin/van-hanh?tab=so-tay&trang=pha-cold-brew");
  await expect(page.getByRole("article").getByRole("heading", { name: "Pha cold brew" })).toBeVisible();
});
