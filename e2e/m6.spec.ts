import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { closeDb, orderRow, resetOrders } from "./db";

// M6: link chia sẻ /m/[slug] + OG, VietQR, webhook SePay, ?src=, /chinh-sach, robots/sitemap/manifest.

async function noSeriousA11y(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
}

const SEPAY = { Authorization: "Apikey e2e-sepay-key" };

test.beforeEach(resetOrders);
test.afterAll(closeDb);

test("/m/[slug]: OG riêng, sheet món mở sẵn, đóng → về /", async ({ page }) => {
  await page.goto("/m/ribs-sv");
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", /\/m\/ribs-sv$/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/m\/ribs-sv\/opengraph-image/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://theheatpizza.vn");
  const sheet = page.getByRole("dialog", { name: /Sườn heo/ });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Đóng" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);

  const og = await page.request.get("/m/ribs-sv/opengraph-image");
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toBe("image/png");
  expect((await page.request.get("/m/khong-co-mon")).status()).toBe(404);
});

test("?src= → cookie → đơn; chuyển khoản hiện VietQR; SePay báo tiền → đơn tự paid + xác nhận", async ({ page }) => {
  await page.goto("/?src=fb-post");
  await page.getByRole("button", { name: "Thêm Pan Pizza Pepperoni vào đơn" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã thêm" })).toBeVisible();
  await page.getByRole("button", { name: /Mở đơn hàng/ }).click();
  const co = page.getByRole("dialog", { name: "Chốt đơn" });
  await co.getByRole("radio", { name: /Ghé Rêu lấy/ }).click();
  await co.getByLabel("Số điện thoại").fill("0912345678");
  await co.getByLabel("Tên", { exact: true }).fill("Lan");
  await co.getByLabel("Chuyển khoản (mã QR)").check();
  await expect(co.getByRole("link", { name: "chính sách bảo mật & điều khoản đặt hàng" })).toHaveAttribute("href", "/chinh-sach");
  await co.getByRole("button", { name: /Đặt lò 17:00/ }).click();

  const box = co.getByRole("region", { name: "Chuyển khoản để hoàn tất" });
  await expect(box).toBeVisible({ timeout: 10_000 });
  const qr = box.getByRole("img", { name: /Mã VietQR chuyển khoản 159\.000đ/ });
  await expect(qr).toHaveAttribute("src", /^https:\/\/img\.vietqr\.io\/image\/970436-1012345678-compact2\.png\?amount=159000&addInfo=TH061101/);
  await expect(box).toContainText("1012345678");
  await expect(box).toContainText("Vietcombank");
  await expect(box.getByRole("button", { name: "Sao chép số tài khoản" })).toBeVisible();
  await expect(box.getByRole("link", { name: "Lưu mã QR" })).toHaveAttribute("target", "_blank");

  const before = await orderRow("TH-0611-01");
  expect(before).toMatchObject({ source: "fb-post", payment_status: "unpaid", status: "placed" });

  const body = { id: 555001, gateway: "Vietcombank", transactionDate: "2026-11-06 10:05:00", accountNumber: "1012345678", code: null, content: "TH061101 Lan chuyen", transferType: "in", transferAmount: before!.total, accumulated: 0, subAccount: null, referenceCode: "FT1", description: "" };
  expect((await page.request.post("/api/webhooks/sepay", { data: body })).status()).toBe(401);
  const ok = await page.request.post("/api/webhooks/sepay", { data: body, headers: SEPAY });
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toEqual({ success: true });
  // SePay gửi lại → vẫn 200, không ghi lần hai
  expect((await page.request.post("/api/webhooks/sepay", { data: body, headers: SEPAY })).status()).toBe(200);
  expect(await orderRow("TH-0611-01")).toMatchObject({ payment_status: "paid", status: "confirmed" });

  await co.getByRole("link", { name: "Theo dõi đơn" }).click();
  await expect(page).toHaveURL(/\/o\//);
  const receipt = page.getByRole("article").filter({ hasText: "TH-0611-01" });
  await expect(receipt).toContainText("Đã thanh toán");
  await expect(receipt.getByRole("region", { name: "Chuyển khoản để hoàn tất" })).toHaveCount(0);
});

test("webhook SePay: sai payload → 400", async ({ request }) => {
  const res = await request.post("/api/webhooks/sepay", { data: { hello: 1 }, headers: SEPAY });
  expect(res.status()).toBe(400);
});

test("/chinh-sach: link từ footer, nội dung, axe", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Chính sách & điều khoản" }).click();
  await expect(page).toHaveURL(/\/chinh-sach$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chính sách bảo mật & điều khoản đặt hàng");
  await expect(page.getByRole("main")).toContainText("tự động xoá sau 90 ngày");
  await noSeriousA11y(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("robots, sitemap, manifest, JSON-LD", async ({ page, request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /admin");
  expect(robots).toContain("Disallow: /o/");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("<loc>https://theheatpizza.vn/m/combo-doi</loc>");
  expect(sitemap).toContain("/chinh-sach");
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: "/?src=pwa", theme_color: "#000000" });
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);

  await page.goto("/");
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}");
  expect(ld["@type"]).toBe("Restaurant");
  expect(ld.potentialAction["@type"]).toBe("OrderAction");
  expect(ld.hasMenu.hasMenuSection[0].hasMenuItem.length).toBeGreaterThan(0);
});
