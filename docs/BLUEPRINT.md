# THE HEAT PIZZA — Blueprint Web App Đặt Món `theheatpizza.vn`

> **Loại tài liệu:** Kiến trúc tổng thể + đặc tả sản phẩm, dùng làm "nguồn sự thật" cho AI Agent triển khai.
> **Phiên bản:** 1.8 · 31/10/2026 · **Trạng thái:** Đề xuất. Các mục ở §16 cần chủ quán chốt; trong lúc chờ, Agent dùng **giá trị mặc định** ghi ở đó. Mục đã chốt được đánh dấu ✅.
> **Thay đổi 1.8 (M9.5):** Gói "Ngày bán" xong (§15 M9.5, §18) · migration `0005_sale_day`: `orders.hold_until`, bảng `cash_handovers`, `feedback`; `payments.provider` thêm `'refund'`, `order_events.type` thêm `'refunded'`; `settings.payment.holdMinutes` (15) · chữ tắt add-on trên nắp hộp lấy từ **tên** món (§18.3 — `products.short` là mô tả) · lỗi action mới `refund_required` · lệnh bot `/khoalo` `/molo`.
> **Thay đổi 1.7 (M9 + kế hoạch mới, chủ quán duyệt 31/10/2026):** M9 xong (§15 M9, §17.7) · ✅ thêm **M9.5 — Gói "Ngày bán"** (§18: khoá lò khẩn cấp, giữ suất có hạn cho đơn trả trước, mã ghi nắp hộp, bàn giao tiền shipper, chấm điểm khẩu vị) · M10 thêm **công nợ nhà cung cấp**, hàng bán lại, **giá vốn & biên lợi nhuận theo món**, kiểm nhanh **ABC** cuối ca (§17.8) · M11 thêm báo cáo tối & trợ thủ Telegram (§17.10) · quyết định §16 #19–#22 · lỗi action mới của M9 (`clocked_in`, `not_clocked_in`, `wrong_pin`, `rate_limited`, `unresolved`, `period_open`, `missing_rate`, `below_min`).
> **Thay đổi 1.6 (M8):** checklist & sổ tay xong (§15 M8, §17.5–17.6) · thư viện `marked` (§5.2) · lỗi action mới `value_required`, `photo_needed`, `duplicate`.
> **Thay đổi 1.5:** ✅ Thêm **vận hành nội bộ** `/admin/van-hanh` (§17, M7–M11): vai trò nhiều giá trị, ca & két, hộp chi, chi phí qua Telegram, checklist, sổ tay, chấm công, bảng công/lương, kho 2 mức, chỉ số · route mới ở §5.4 · ✅ pizza nhận tiền qua TK **TPBank riêng** (SePay), café giữ **MoMo kinh doanh** (§17.9) · pizza bán T6–CN (§16 #5).
> **Thay đổi 1.4 (M2):** `slot_templates` thêm `UNIQUE (weekday, ready_time)`; thêm CHECK thời gian mẻ (`cutoff_at ≤ oven_at ≤ ready_at`), `order_items.line_total = unit_price × qty` (§6.2) · `ensureBatches` chỉ sinh mẻ cho ngày **chưa có** `service_days` (§15 M2) · dev dependency `tsx` cho script seed (§5.2).
> **Thay đổi 1.3 (M1):** `priceOrder` trả kết quả có kiểu (§7.4) · làm rõ quyền bếp/shipper (§7.5) · Prep trả `split`/`byProduct` có cấu trúc thay cho chuỗi `breakdown`, điểm giao trong tuyến xếp theo khu vực rồi số thứ tự (§7.6, Phụ lục B) · regex mã chuyển khoản chặn số dính liền (§7.8) · seed Phụ lục A ở `data/seed.ts`.
> **Thay đổi 1.2:** ✅ Giữ **Café, KOLD Gelato và Đặt bàn** của quán THE HEAT thành mục riêng `/tai-quan` (§5.4) — không thuộc luồng đặt món · Thêm token `--on-accent` (chữ đen trên nền cam, §9.1) · M0 hoàn tất.
> **Thay đổi 1.1:** ✅ Rêu vừa là **bếp** vừa là **điểm nhận** · ✅ Thực đơn & giá theo Phụ lục A là chính thức · Database mặc định đổi từ Neon sang **Supabase (Postgres, Singapore)**.
> **Ngôn ngữ:** Văn bản tiếng Việt, tên code/biến/bảng bằng tiếng Anh.
> **Tài liệu kèm theo:** [`docs/MARKETING.md`](./MARKETING.md) — chiến lược marketing đa kênh tại thị trấn.

---

## Mục lục

0. [Dành cho AI Agent — đọc trước khi code](#0-dành-cho-ai-agent--đọc-trước-khi-code)
1. [Tóm tắt điều hành](#1-tóm-tắt-điều-hành)
2. [Đánh giá codebase hiện tại](#2-đánh-giá-codebase-hiện-tại)
3. [Mô hình vận hành "Đặt trước mới làm" & khái niệm domain](#3-mô-hình-vận-hành-đặt-trước-mới-làm--khái-niệm-domain)
4. [Những nâng cấp so với brief gốc (và lý do)](#4-những-nâng-cấp-so-với-brief-gốc-và-lý-do)
5. [Kiến trúc kỹ thuật](#5-kiến-trúc-kỹ-thuật)
6. [Mô hình dữ liệu](#6-mô-hình-dữ-liệu)
7. [Logic nghiệp vụ lõi (thuần, test được)](#7-logic-nghiệp-vụ-lõi-thuần-test-được)
8. [Hợp đồng API (Server Actions & Route Handlers)](#8-hợp-đồng-api-server-actions--route-handlers)
9. [Đặc tả UI/UX — Trang đặt món](#9-đặc-tả-uiux--trang-đặt-món)
10. [Khu vực 4 — Kitchen Dashboard `/admin/kitchen`](#10-khu-vực-4--kitchen-dashboard-adminkitchen)
11. [Thanh toán & thông báo](#11-thanh-toán--thông-báo)
12. [Bảo mật, quyền riêng tư & pháp lý](#12-bảo-mật-quyền-riêng-tư--pháp-lý)
13. [Hiệu năng, SEO, PWA, giám sát](#13-hiệu-năng-seo-pwa-giám-sát)
14. [Chiến lược kiểm thử](#14-chiến-lược-kiểm-thử)
15. [Lộ trình triển khai (Milestones cho Agent)](#15-lộ-trình-triển-khai-milestones-cho-agent)
16. [Quyết định cần chủ quán chốt (kèm mặc định)](#16-quyết-định-cần-chủ-quán-chốt-kèm-mặc-định)
17. [Vận hành nội bộ `/admin/van-hanh` (M7–M11)](#17-vận-hành-nội-bộ-adminvan-hanh-m7m11)
18. [Gói "Ngày bán" (M9.5)](#18-gói-ngày-bán-m95)
- [Phụ lục A — Seed data mẫu](#phụ-lục-a--seed-data-mẫu)
- [Phụ lục B — Bộ dữ liệu kiểm thử Prep (khớp ví dụ trong brief)](#phụ-lục-b--bộ-dữ-liệu-kiểm-thử-prep-khớp-ví-dụ-trong-brief)

---

## 0. Dành cho AI Agent — đọc trước khi code

**Thứ tự đọc:** §1 → §3 → §5 → milestone đang làm ở §15 → các mục mà milestone đó tham chiếu.

**Luật bất di bất dịch**

1. **Đây là Next.js 16.3, không phải Next.js trong trí nhớ của bạn.** Trước khi dùng một API, đọc tài liệu tương ứng trong `node_modules/next/dist/docs/` (xem `AGENTS.md`). Những thay đổi chắc chắn sẽ gặp:
   - `proxy.ts` thay cho `middleware.ts` (hàm export tên `proxy`, chỉ chạy runtime Node).
   - `cacheComponents: true` → dữ liệu **mặc định là động**; muốn cache thì `'use cache'` + `cacheLife()` + `cacheTag()`. Đọc dữ liệu động/`cookies()`/`connection()` phải nằm trong `<Suspense>`.
   - Sau mutation: `updateTag(tag)` (đọc-lại-ngay, chỉ trong Server Action), `revalidateTag(tag, 'max')` (bắt buộc 2 tham số), `refresh()`.
   - `params`, `searchParams`, `cookies()`, `headers()` đều **async**.
   - `<Image preload />` thay cho `priority` (đã deprecated). `images.qualities` mặc định chỉ `[75]`.
   - `next lint` đã bị bỏ → dùng `npx eslint .`. Kiểu `LayoutProps`/`PageProps` được sinh bởi `npx next typegen`.
2. **Thời gian luôn theo giờ Việt Nam** qua `lib/domain/time.ts` (UTC+7, VN không có DST). **Cấm** `Date#getHours()`/`getDate()` ở server và cấm `new Date("YYYY-MM-DDTHH:mm")` không có offset.
3. **Server là nguồn sự thật** cho giá, phí ship, quà tặng, suất lò, trạng thái đơn. Client chỉ hiển thị và gửi *ý định* (id món, số lượng, mẻ).
4. **Logic nghiệp vụ thuần** (`lib/domain/*`) không import DB, Next, React → unit test 100%.
5. **Mọi Server Action** theo thứ tự: parse bằng zod → xác thực (nếu admin) → rate-limit (nếu public) → gọi DAL → trả về DTO tối giản (không trả record DB thô).
6. **Tiền là số nguyên VND** (`integer`). Không dùng float.
7. **Không thêm trang/route ngoài danh sách ở §5.4.** Sản phẩm là *ứng dụng đặt món một trang*, không phải website nhiều trang.
8. **Mobile-first thật sự:** dựng & kiểm tra ở viewport 390×844 trước, sau đó mới desktop.
9. Không thêm thư viện ngoài danh sách §5.2 nếu không ghi lý do vào PR.
10. **Ưu tiên tái sử dụng:** chức năng đã có lời giải ổn (GitHub, StackOverflow, tài liệu chính thức, gói npm có uy tín & còn bảo trì) thì lấy lại và ghi nguồn; không có mới tự code.

**Definition of Done cho mỗi ticket**

- `npx eslint .` 0 lỗi · `npx next typegen && npx tsc --noEmit` sạch · unit test pass · e2e liên quan pass.
- Không vượt ngân sách hiệu năng (§13.1).
- Nếu thay đổi hợp đồng (schema, API, trạng thái), cập nhật tài liệu này trong cùng PR.

---

## 1. Tóm tắt điều hành

`theheatpizza.vn` là **ứng dụng đặt món đơn trang, mobile-first, giao diện tối**, phục vụ mô hình **Hybrid Cloud Kitchen "đặt trước mới làm"**: khách chọn món + chọn mẻ nướng trước giờ chốt sổ; bếp nhìn **Bảng Tổng Hợp Chuẩn Bị** để lấy nguyên liệu theo con số tổng và nướng theo từng mẻ.

**12 quyết định then chốt**

| # | Quyết định | Vì sao |
|---|---|---|
| 1 | **Pivot hoàn toàn** codebase "THE HEAT" (nhà hàng ăn tại chỗ) sang app đặt món; giữ lại design token, font, logo, ảnh món còn dùng được | Khung kỹ thuật tốt (Next 16, Tailwind 4, TS strict), nhưng sản phẩm cũ là website nhiều section, không có DB, đơn hàng bị **mất** (chỉ `console.info`) |
| 2 | **Chỉ tiếng Việt, chỉ giao diện tối** | Bỏ `LanguageProvider` (đang ép mọi component thành Client Component) → dùng được Server Components, JS nhẹ hơn cho máy Android tầm trung trên 4G |
| 3 | **Mẻ nướng (Batch)** là thực thể trung tâm; "suất" đo theo **tài nguyên** (khay pan, phần BBQ), không đo theo số đơn | 1 Combo chiếm 1 khay pizza + 1 phần BBQ; đếm theo đơn sẽ overbook lò |
| 4 | **Khung giờ là thuộc tính của đơn**, không phải của từng món; chọn ngay trên Oven Bar | Một đơn nhiều món chỉ có một giờ nhận; tránh mâu thuẫn dữ liệu |
| 5 | **Giỏ hàng + thanh "Xem đơn" nổi** + **Checkout một màn hình** trong bottom sheet | Giữ trải nghiệm "1 bước" của brief nhưng vẫn cho đặt nhiều món |
| 6 | **Nhận diện khách cũ an toàn**: tự điền đầy đủ chỉ trên thiết bị đã "ghi nhớ"; tra SĐT từ thiết bị lạ chỉ trả **tên gọi + khu vực**, địa chỉ chi tiết được che và tham chiếu phía server | Tra SĐT → trả tên & địa chỉ đầy đủ = lộ dữ liệu cá nhân của bất kỳ ai (vi phạm NĐ 13/2023 & Luật BVDLCN) |
| 7 | **Giữ suất nguyên tử** bằng một câu `UPDATE … WHERE used + n <= cap` trong transaction | Hai khách bấm cùng lúc vào "Còn 1 suất" → chỉ một người thắng |
| 8 | **BOM (định lượng)** cho mỗi món → Prep Calculator ra cả gram phô mai, số hũ sốt, số hộp, phần gừng | Bếp lấy nguyên liệu theo con số tổng, không phải tự nhẩm |
| 9 | **Thanh toán:** Tiền mặt + Chuyển khoản **VietQR** (tự xác nhận qua webhook SePay ở M6); **trả trước theo rủi ro** (khách từng bom hàng mới bị yêu cầu) | Giảm bom hàng mà không làm khó khách quen |
| 10 | **Thông báo bếp qua Telegram Bot** (miễn phí, tức thì); Zalo ZNS cho khách ở giai đoạn 2 | Rẻ, nhanh, không phụ thuộc OA được duyệt |
| 11 | **Stack ít nhà cung cấp:** Next 16 + Postgres (Drizzle) + Telegram; rate-limit bằng chính Postgres; triển khai được trên Vercel *hoặc* 1 VPS | Doanh nghiệp nhỏ: càng ít dịch vụ càng ít điểm hỏng & chi phí |
| 12 | **Đo lường marketing tích hợp**: mọi QR/link mang `?src=…`, lưu vào đơn; link chia sẻ từng món `/m/[slug]` có ảnh OG riêng | Biết kênh nào ra đơn thật (xem `MARKETING.md`) |

---

## 2. Đánh giá codebase hiện tại

### 2.1 Hiện trạng (commit `71dc123`)

- **Framework:** Next.js 16.3.5 (App Router, Turbopack), React 19.2.8, Tailwind CSS 4, TypeScript strict, ESLint 9 flat config. Alias `@/*` trỏ về gốc repo.
- **Sản phẩm:** website một trang cho nhà hàng **THE HEAT** (162 Nguyễn Thuật, xã Thăng Bình, TP Đà Nẵng): Header → Hero (logo + carousel) → Menu 6 nhóm/22 món (café, pizza Detroit, BBQ, fries, sốt, KOLD Gelato) → Delivery (giỏ hàng + form) → Gallery → Visit (bản đồ) → Reservation (đặt bàn) → Footer.
- **Dữ liệu:** tĩnh trong `data/*.ts`; song ngữ vi/en trong `data/i18n.ts` (490 dòng) qua React Context + `localStorage`.
- **Server Actions:** `app/actions/delivery.ts`, `app/actions/reservation.ts` — validate tốt, **tính giá lại phía server** (điểm cộng), nhưng **không lưu ở đâu cả** (`console.info`).
- **Design system:** CSS variables kiểu Apple (`--bg #000`, `--surface #1d1d1f`, `--elevated #2c2c2e`, `--text #f5f5f7`, `--secondary #a1a1a6`, `--accent #ff3d00`), font Be Vietnam Pro (có subset tiếng Việt), bo góc 28px, easing `cubic-bezier(0.22,1,0.36,1)`.
- **Chưa có:** DB, auth, test, CI, `proxy.ts`, cấu hình `next.config.ts` (rỗng).

### 2.2 Giữ / Bỏ / Viết lại

| Hạng mục | Quyết định | Ghi chú |
|---|---|---|
| Next 16 + Tailwind 4 + TS strict + ESLint flat | **Giữ** | Bật thêm `cacheComponents`, `reactCompiler` |
| Token màu trong `app/globals.css`, font Be Vietnam Pro, easing | **Giữ & mở rộng** | Bỏ nhánh `html.light`; thêm token trạng thái (§9.1) |
| `lib/format.ts` (`formatPrice`) | **Giữ**, bỏ tham số `lang` | |
| Regex & chuẩn hoá SĐT trong 2 action | **Gộp** vào `lib/domain/phone.ts` | Hiện bị lặp code ở 2 file |
| Mẫu "server tính lại giá" trong `delivery.ts` | **Giữ tư duy**, viết lại thành `placeOrder` | |
| `useActionState` + thông điệp lỗi theo key | **Giữ tư duy** | |
| `components/json-ld.tsx`, `app/icon.tsx`, `app/opengraph-image.*` | **Viết lại** nội dung cho THE HEAT PIZZA | |
| Logo (`public/images/brand/logo-*.jpg`) | **Giữ** | Cần bản SVG/PNG nền trong suốt (§16) |
| Ảnh món: `menu/bbq-ribs.jpg`, `menu/pan-bbq.jpg`, `pizza/…carrousel03.jpg` (pepperoni), `menu/sauce-*.jpg`, `menu/cold-brew.jpg` | **Giữ** làm ảnh tạm | Cần chụp mới cho Pizza Phô mai Bơ tỏi, BBQ #2, Combo |
| Café, KOLD Gelato, Reservation (đặt bàn) | **Giữ thành mục riêng** `/tai-quan` | ✅ Chủ quán chốt: giữ cho quán ăn tại chỗ, sau này có thể cần. Server Components, chỉ tiếng Việt, không chung giỏ/catalog với app đặt món. Đặt bàn vẫn chỉ ghi log — lưu DB + Telegram khi cần (dùng lại hạ tầng M4) |
| Fries, Gallery, Visit/Map nhúng iframe, Hero carousel | **Bỏ** | Ngoài phạm vi app đặt món |
| `LanguageProvider`, `LanguageToggle`, `ThemeToggle`, script `themeInit` | **Bỏ** | Chuỗi UI chuyển vào `data/copy.ts` (chỉ `vi`, cấu trúc sẵn cho i18n sau này) |
| `Header` với nav anchor | **Thay** bằng Oven Bar | |

### 2.3 Lỗi & nợ kỹ thuật phát hiện

| Mức | Vấn đề | Vị trí | Bài học cho bản mới |
|---|---|---|---|
| 🔴 | Đơn giao hàng và đặt bàn **không được lưu** — chỉ `console.info` | `app/actions/*.ts` | Phải có DB + thông báo bếp + màn hình theo dõi đơn |
| 🔴 | **Lỗi múi giờ:** `new Date("2026-11-06T18:00")` được parse theo giờ *server* (Vercel = UTC) rồi kiểm tra `getHours()` → kiểm tra "giờ mở cửa" và "thời điểm tương lai" lệch 7 tiếng | `app/actions/reservation.ts` (✅ đã sửa ở M0) | §7.1: mọi tính toán qua `lib/domain/time.ts` với offset `+07:00` |
| 🟠 | 4 lỗi ESLint `react-hooks/set-state-in-effect` | `delivery.tsx:26`, `language-provider.tsx:28`, `reservation-form.tsx:25`, `theme-toggle.tsx:33` | Dùng `useSyncExternalStore` cho dữ liệu từ `localStorage`; reset state theo `key` thay vì effect |
| 🟠 | Toàn bộ UI là Client Component vì `useLanguage()` | `components/*` | Bỏ i18n runtime → Server Components mặc định |
| 🟡 | `priority` trên `<Image>` đã deprecated ở Next 16 | `logo.tsx`, `hero.tsx`, `hero-gallery.tsx` | Dùng `preload` / `fetchPriority="high"` |
| 🟡 | ~6 MB ảnh không dùng (`Logo-The-Heat.png` 1,4 MB, `kold-gelato*.png` 3,1 MB, `pizza.jpg`, `chicken.jpg`, `coffee.jpg`, `hero.jpg`, 4 ảnh `menu/pizza-*.jpg` trùng `menu/pan-*.jpg`, các SVG mẫu của create-next-app) | `public/` | Xoá ở M0 |
| 🟡 | `metadataBase` = `theheat.vn`; `package.json` name = `nanchos` | `app/layout.tsx`, `package.json` | Đổi sang `theheatpizza.vn`, `theheat-pizza` |
| 🟡 | Phí ship cố định 20.000đ | `data/delivery.ts` | Phí theo khu vực (10–15k) từ DB |
| ⚪ | `tsc` báo thiếu `LayoutProps` khi chưa chạy `next typegen` | CI | Chạy `npx next typegen` trước `tsc` |

---

## 3. Mô hình vận hành "Đặt trước mới làm" & khái niệm domain

### 3.1 Dòng thời gian của một ngày phục vụ (ví dụ mặc định)

```
08:00 ──────── 15:30 ───── 15:45 ─────── 16:40 ── 17:00 ── 17:40 ── 18:00 ── 18:40 ── 19:00 ──── 21:00
  │  Nhận đặt trước  │ CHỐT SỔ │ Lấy NL theo  │ Mẻ 1    │ Giao/    │ Mẻ 2    │ Giao/    │ Mẻ 3    │ Giao/
  │  (cả ngày & các  │ (cutoff)│ Bảng Tổng Hợp│ đút lò  │ nhận 1   │ đút lò  │ nhận 2   │ đút lò  │ nhận 3
  │  ngày tới)       │         │              │         │          │         │          │         │
```

- Đế pan pizza cần ủ trước trong khay nhiều giờ, túi BBQ sous-vide đã nấu sẵn → **giờ chốt sổ quyết định số đế cần chuẩn bị**. Sau giờ chốt, mặc định không nhận đơn cho tối đó (giai đoạn 2 có "suất muộn" từ đế dự phòng — §4, mục 14).
- Khách có thể đặt **trước cho các ngày tới** (mặc định 4 ngày — ✅ 31/10/2026, để Thứ Hai đặt được mẻ Thứ Sáu) — mỗi ngày có giờ chốt riêng.

### 3.2 Từ điển khái niệm (dùng thống nhất trong code, UI và tài liệu)

| Thuật ngữ (UI) | Tên trong code | Định nghĩa |
|---|---|---|
| Ngày phục vụ | `ServiceDay` / `service_date` | Một ngày bếp hoạt động (theo giờ VN). Trạng thái: `open` · `closed` (ngày nghỉ) · `paused` (tạm ngưng: mưa bão, mất điện…) |
| Mẻ nướng / Khung giờ | `Batch` | Một lượt nướng gắn với **giờ sẵn sàng** `readyAt` (17:00). Có `ovenAt` = `readyAt − ovenLeadMin` (16:40) và `cutoffAt` (15:30) |
| Giờ chốt sổ | `cutoffAt` | Sau thời điểm này không nhận thêm đơn cho mẻ đó. Mặc định mọi mẻ trong ngày cùng giờ chốt |
| Suất | `capacity` | Sức chứa của mẻ theo 2 tài nguyên: `pan` (khay pizza trong lò) và `bbq` (phần BBQ hoàn thiện). Số "Còn N suất" hiển thị = suất **pizza** còn lại (§7.3) |
| Món chính | `kind: 'pizza' \| 'bbq' \| 'combo'` | Combo = 1 pizza (chọn) + 1 BBQ (chọn) |
| Món kèm / Upsell | `kind: 'addon'` | Hũ sốt, chai cold brew Rêu… Là dòng riêng trong đơn để đếm Prep chính xác |
| Quà tặng | `isGift` | Dòng giá 0đ do hệ thống tự thêm (VD: nhận tại Rêu → tặng 1 hũ Sốt Bơ Tỏi) |
| Khu vực | `Zone` | Thôn/Khu phố khách chọn trong dropdown; có phí ship riêng |
| Tuyến | `Route` | Nhóm khu vực mà shipper giao chung một chuyến (VD "Tuyến Quốc lộ / Thị trấn") |
| Bếp / Điểm nhận | `PickupPoint` | ✅ **Rêu vừa là bếp vừa là điểm nhận**: bánh ra lò là có ngay tại quầy, không mất thời gian vận chuyển; mọi tuyến giao xuất phát từ Rêu. Bảng `pickup_points` vẫn giữ để sau này mở thêm điểm nhận |
| Định lượng | `RecipeLine` (BOM) | Món X tiêu tốn bao nhiêu nguyên liệu Y (1 đế, 180 g mozzarella, 1 phần gừng, 1 hộp…) |
| Bảng Tổng Hợp Chuẩn Bị | `PrepReport` | Tổng hợp nguyên liệu và chia theo mẻ/tuyến cho một ngày |
| Kênh | `channel` | Đơn đến từ `web`, `phone`, `zalo`, `walkin` (quầy Rêu), sau này `grab`/`shopee` — **mọi kênh đều trừ suất chung** |

---

## 4. Những nâng cấp so với brief gốc (và lý do)

Brief gốc rất đúng hướng. Các điểm dưới đây làm nó **chạy được ngoài đời** và tốt hơn:

1. **Khung giờ nằm ở cấp đơn hàng.** Brief đặt "Chọn khung giờ" trong sheet của từng món — nếu khách đặt 2 món sẽ có 2 khung giờ mâu thuẫn. Giải pháp: chạm vào chip giờ trên Oven Bar để chọn; sheet món chỉ hiển thị dòng tóm tắt "Nhận lúc 18:00 · Đổi".
2. **Giỏ hàng nhiều món mà vẫn "một bước".** Sheet món → "Thêm vào đơn" → thanh **Xem đơn** nổi ở đáy → sheet **Chốt đơn** chứa *tất cả* (món, giờ, SĐT, tên, cách nhận, địa chỉ, thanh toán) trên **một màn hình**.
3. **Suất tính theo tài nguyên lò.** Combo chiếm cả khay pizza lẫn phần BBQ. Khi mẻ không đủ chỗ cho một món cụ thể, chip giờ của món đó bị vô hiệu kèm lý do ("Mẻ 18:00 hết khay pizza").
4. **Tra SĐT an toàn.** Xem §7.7. Vẫn đạt mục tiêu "gõ xong 10 số là xong" mà không biến website thành công cụ dò địa chỉ người khác.
5. **Đặt trước nhiều ngày** ("Tối nay · T7 07/11 · CN 08/11") → doanh thu ổn định hơn, bếp có kế hoạch sớm.
6. **State machine cho Oven Bar** (§7.2): đang nhận · sắp chốt · kín lò · đã chốt sổ · nghỉ · tạm ngưng — mỗi trạng thái có câu chữ và CTA riêng (VD kín lò → "Đặt trước cho Thứ Bảy").
7. **Khan hiếm thật, không giả.** "Còn 1 suất 🔥" lấy từ DB. Không bao giờ hiển thị con số bịa — vừa là đạo đức, vừa tránh rủi ro pháp lý về quảng cáo gây nhầm lẫn.
8. **Ghim vị trí GPS** (tuỳ chọn) bên cạnh "Mô tả nhà": nông thôn ít số nhà, shipper mở thẳng Google Maps.
9. **Chống mất đơn trên mạng 3G/4G chập chờn:** `idempotencyKey` cho mỗi lần bấm "Đặt", nút có trạng thái chờ, và **phương án dự phòng** (gọi/Zalo kèm nội dung đơn đã copy sẵn) nếu server lỗi.
10. **Prep Calculator theo BOM**: không chỉ "9 đế", mà còn 1.620 g mozzarella, 7 hũ sốt bơ tỏi (4 bán + 3 tặng), 15 phần gừng hồng, 9 hộp pizza, 6 khay BBQ, 4 chai cold brew lấy từ tủ quầy Rêu. Có trạng thái "số liệu tạm tính" khi chưa tới giờ chốt.
11. **Trả trước theo rủi ro** qua VietQR: khách mới/khách quen đặt COD bình thường; khách từng "bom" bị yêu cầu chuyển khoản. Giảm bom hàng mà không gây ma sát cho số đông.
12. **Đơn từ mọi kênh trừ chung một kho suất**: chủ quán có form "Thêm đơn nhanh" trong dashboard cho đơn gọi điện/Zalo/khách tại quầy Rêu → không bao giờ overbook lò.
13. **Danh sách khách lấy tại quầy & đối soát với Rêu**: Rêu là bếp, điểm nhận và nơi cung cấp cold brew → khi bếp đang bận đút lò, nhân viên quầy café vẫn giao bánh đúng người nhờ danh sách khách lấy tại quầy từng mẻ (số thứ tự, tên, số tiền cần thu); kèm báo cáo số chai cold brew bán qua app để đối soát nếu The Heat Pizza và Rêu tách sổ sách.
14. *(Giai đoạn 2)* **Suất muộn & danh sách chờ**: chủ quán chuẩn bị thêm vài đế dự phòng; sau giờ chốt bán "suất muộn"; khi kín lò, khách để lại SĐT để được báo khi có đơn huỷ.
15. *(Giai đoạn 2)* **"Ship chung tuyến"**: hàng xóm đặt cùng tuyến + cùng mẻ được giảm phí ship — vừa lan truyền, vừa giảm chi phí giao (xem `MARKETING.md`).

---

## 5. Kiến trúc kỹ thuật

### 5.1 Sơ đồ tổng thể

```
                    ┌────────────────────────── Khách (điện thoại) ─────────────────────────┐
                    │  theheatpizza.vn  (Next.js App Router · RSC · dark · vi)               │
                    │  ┌───────────┐  ┌────────────┐  ┌───────────────┐  ┌───────────────┐  │
                    │  │ Oven Bar  │  │ Bento Menu │  │ Item Sheet    │  │ Checkout Sheet│  │
                    │  │ (stream + │  │ (cached    │  │ (client)      │  │ (client)      │  │
                    │  │  poll 30s)│  │  shell)    │  │               │  │               │  │
                    │  └─────┬─────┘  └────────────┘  └───────────────┘  └──────┬────────┘  │
                    └────────┼──────────────────────────────────────────────────┼───────────┘
                     GET /api/oven                                   Server Actions: lookupCustomer,
                             │                                       placeOrder, cancelOrderByToken
┌───────────────┐   ┌────────▼─────────────────────────────────────────────────▼──────────────┐
│ Chủ quán/Bếp  │──▶│  Next.js server (Node runtime)                                           │
│ /admin/kitchen│   │  proxy.ts (gác /admin, ghi ?src=)                                        │
└───────────────┘   │  app/actions/*  ──▶  lib/server/dal/*  ──▶  lib/domain/* (thuần)         │
                    │  app/api/cron/daily · app/api/webhooks/sepay · instrumentation.ts        │
                    └───────┬──────────────────────────┬───────────────────────┬───────────────┘
                            │ Drizzle (postgres.js)    │ after(): notify       │ webhook
                    ┌───────▼────────┐        ┌────────▼────────┐     ┌────────▼────────┐
                    │ PostgreSQL     │        │ Telegram Bot API│     │ SePay (đối soát │
                    │ (Supabase SG)  │        │ nhóm "Bếp"      │     │ chuyển khoản)   │
                    └────────────────┘        └─────────────────┘     └─────────────────┘
                                   VietQR: ảnh QR tạo từ img.vietqr.io (không cần API key)
```

### 5.2 Stack & lý do

| Lớp | Lựa chọn | Lý do / ghi chú |
|---|---|---|
| Framework | **Next.js 16.3** (đã có), React 19.2, `cacheComponents: true`, `reactCompiler: true` | PPR: shell tĩnh tức thì + phần động stream vào |
| Style | **Tailwind CSS 4** (đã có), CSS variables | Không thêm UI kit nặng |
| Ngôn ngữ | TypeScript strict | |
| DB | **PostgreSQL trên Supabase**, region ~~Singapore~~ **Mumbai (`ap-south-1`)** — chủ quán đã tạo, chốt 31/10/2026 |  có Table Editor để chủ quán xem/sửa dữ liệu, sao lưu hằng ngày (gói Pro), Realtime dùng được sau này. **Chỉ dùng phần Postgres**: không dùng `supabase-js` trên trình duyệt, không dùng Supabase Auth. Có thể thay bằng Neon hoặc Postgres trên VPS mà không đổi code |
| ORM / driver | **Drizzle ORM** + **`postgres` (postgres.js)** | Type-safe, migration bằng SQL thuần. Trên Vercel kết nối qua **Supavisor transaction pooler** (cổng 6543) với `prepare: false`; `drizzle-kit migrate` dùng kết nối trực tiếp/session (`DIRECT_URL`). Cần transaction thật cho giữ suất |
| Validate | **Zod 4** | Dùng chung schema cho client (gợi ý lỗi) và server (bắt buộc) |
| Auth admin | Phiên **JWT ký bằng `jose`** trong cookie httpOnly + PIN băm bằng **`@node-rs/argon2`** | Theo hướng dẫn "Stateless Sessions" trong `02-guides/authentication.md`; 1–3 nhân viên không cần dịch vụ auth bên ngoài |
| Rate limit | **Bảng Postgres** (fixed window) | Lưu lượng thị trấn nhỏ; bớt một nhà cung cấp (Upstash) |
| Thông báo bếp | **Telegram Bot API** | Miễn phí, tức thì, có trên mọi điện thoại |
| Thanh toán | **VietQR** (ảnh QR từ `img.vietqr.io`) + **SePay webhook** (M6) | QR chuẩn Napas, mọi app ngân hàng quét được; SePay báo giao dịch tự động |
| Markdown (sổ tay, M8) | **`marked`** (MIT, ghim 18.1.1) — **chỉ ở server** | 0 KB JS client. Lọc ở renderer: HTML thô bị escape, ảnh thành chữ alt, link chỉ `http(s)/mailto/tel/` nội bộ (`lib/server/markdown.ts`) — không cần thêm thư viện sanitize |
| Script | **`tsx`** (dev) | Chạy `db:seed` bằng TypeScript + alias `@/` với `--conditions=react-server` (để `server-only` không ném lỗi) |
| Test | **Vitest** (unit/integration), **Playwright** (e2e, viewport iPhone 13 & Pixel 7), `@axe-core/playwright` | Theo `02-guides/testing/*` |
| Hosting | **Phương án A (khuyến nghị):** Vercel **Pro**, function region `bom1` (Mumbai — cùng vùng Supabase `ap-south-1`). **Phương án B (rẻ nhất):** 1 VPS 2 GB (Docker: `next start` standalone + Postgres + Caddy) | Gói Hobby của Vercel chỉ dành cho mục đích **phi thương mại** → app bán hàng cần Pro hoặc tự host. Code không phụ thuộc API riêng của Vercel |
| Analytics | Vercel Web Analytics *hoặc* Umami tự host + sự kiện tuỳ chỉnh | Nhẹ, không cookie quảng cáo |

**Không dùng** (và lý do): Redux/Zustand (giỏ hàng nhỏ, `useReducer` + `useSyncExternalStore` đủ), thư viện drawer bên thứ ba (tự dựng trên `<dialog>` để kiểm soát hiệu năng & a11y), Framer Motion (CSS transition + Pointer Events đủ cho bottom sheet), Supabase client trên trình duyệt (DB chỉ truy cập từ server), next-intl (chỉ tiếng Việt).

### 5.3 Chiến lược render với Next 16 (`cacheComponents`)

| Phần | Cách render | Chi tiết |
|---|---|---|
| Layout, brand strip, Bento Menu | **Shell tĩnh + `'use cache'`** | `getCatalog()` dùng `'use cache'`, `cacheLife('hours')`, `cacheTag('catalog')`. Admin bật/tắt món → `updateTag('catalog')` |
| Oven Bar | **Động, stream trong `<Suspense>`** | Server component `OvenBarServer` gọi `await connection()` rồi `getOvenStatus(now)`; truyền `initialStatus` + `serverNow` cho client component `OvenBarLive`. Fallback skeleton cùng chiều cao để CLS = 0 |
| Cập nhật Oven Bar | **Poll** `GET /api/oven` mỗi 30 s khi tab hiển thị + khi `visibilitychange`/`focus` + ngay sau `placeOrder` | `Cache-Control: public, s-maxage=10, stale-while-revalidate=30` |
| Sheet món / Checkout | **Client Components** | Trạng thái mở/đóng phản ánh trên URL (`?mon=…`, `?buoc=chot-don`) để nút Back của Android đóng sheet và để link chia sẻ mở thẳng món. `useSearchParams` phải nằm trong `<Suspense>` |
| `/o/[token]` (theo dõi đơn) | Động trong `<Suspense>` | Poll 30 s khi đơn chưa hoàn tất |
| `/admin/*` | Động; `requireStaff()` trong DAL; `router.refresh()` mỗi 20 s khi tab hiển thị | Không cache dữ liệu admin |

> Lưu ý `Activity`: khi `cacheComponents` bật, route cũ được *ẩn* chứ không unmount. Sheet đang mở có thể "còn mở" khi quay lại trang — đóng sheet khi điều hướng đi (xem `02-guides/preserving-ui-state.md`).

### 5.4 Danh sách route (đầy đủ — không thêm route khác)

| Route | Mục đích | Ghi chú |
|---|---|---|
| `/` | **App đặt món** (Oven Bar, Bento Menu, sheets) | Query: `?mon=<slug>`, `?buoc=chot-don`, `?ngay=YYYY-MM-DD`, `?src=<kênh>` |
| `/m/[slug]` | Link chia sẻ từng món, có `opengraph-image` riêng | Render **cùng** trang đặt món với sheet món mở sẵn — **không** redirect HTTP (crawler Facebook/Zalo phải đọc OG của chính URL này). `alternates.canonical = /`; đóng sheet → `router.replace('/')`. `generateStaticParams` từ catalog |
| `/o/[token]` | Biên nhận & theo dõi đơn | `token` ngẫu nhiên 128-bit; `noindex` |
| `/chinh-sach` | Chính sách bảo mật & điều khoản đặt hàng | Bắt buộc về pháp lý; chỉ link từ footer & checkout |
| `/tai-quan` | Quán ăn tại chỗ THE HEAT: thực đơn Café & KOLD Gelato, giờ mở cửa, form **đặt bàn** (`app/actions/reservation.ts`) | ✅ Thêm ở v1.2. Trang tĩnh; link từ trang đặt món (footer/brand strip), không nằm trong luồng đặt món |
| `/admin/login` | Đăng nhập nhân viên (tên + PIN) | |
| `/admin/kitchen` | **Dashboard bếp** (tab: Chuẩn bị · Mẻ nướng · Đơn · Giao · Cài đặt) | Query `?ngay=`, `?tab=` |
| `/admin/kitchen/in` | Bản in Bảng Tổng Hợp (khổ A4/A5 hoặc giấy nhiệt 80 mm) | |
| `/admin/van-hanh` | ✅ (v1.5) **Vận hành nội bộ** (tab: Ca · Chi · Việc · Sổ tay · Công · Lương · Kho · Chỉ số) | Query `?tab=`, `?trang=` (sổ tay), `?ky=YYYY-MM` — §17 |
| `GET /api/oven` | Trạng thái lò cho client poll | Public, cache 10 s |
| `GET /api/cron/daily` | Tạo mẻ cho N ngày tới; gửi Telegram tổng hợp sau giờ chốt | Bảo vệ bằng header `Authorization: Bearer ${CRON_SECRET}` |
| `POST /api/webhooks/sepay` | Nhận giao dịch chuyển khoản | Xác thực API key header; idempotent theo mã giao dịch |
| `POST /api/webhooks/telegram` | ✅ (v1.5) Lệnh `/chi`, ảnh hoá đơn, nút bấm, liên kết tài khoản | Header `X-Telegram-Bot-Api-Secret-Token`; idempotent theo `update_id` — §17.4 |
| `GET /api/ops/files/[id]` | ✅ (M7) Ảnh báo cáo Sapo / hoá đơn | Cần phiên nhân viên; hoá đơn chỉ owner/manager hoặc người tải lên |
| `app/manifest.ts`, `robots.ts`, `sitemap.ts`, `icon`, `opengraph-image` | Metadata | `/admin`, `/o` bị `disallow` |

### 5.5 Cấu trúc thư mục đích

Giữ quy ước hiện có (`components/`, `data/`, `lib/` ở gốc; Server Actions trong `app/actions/`).

```
app/
  layout.tsx                    # html lang="vi", dark, font, JSON-LD, viewport-fit=cover
  page.tsx                      # Trang đặt món (Server Component)
  globals.css
  m/[slug]/page.tsx             # trang đặt món + sheet mở sẵn; opengraph-image.tsx
  o/[token]/page.tsx
  chinh-sach/page.tsx
  tai-quan/page.tsx             # Café & KOLD Gelato + đặt bàn (quán ăn tại chỗ)
  admin/
    login/page.tsx
    kitchen/page.tsx
    kitchen/in/page.tsx
    layout.tsx                  # gọi requireStaff(); robots noindex
  actions/
    order.ts                    # placeOrder, cancelOrderByToken
    customer.ts                 # lookupCustomer
    admin.ts                    # mọi mutation của dashboard
    auth.ts                     # login, logout
    reservation.ts              # createReservation (trang /tai-quan)
  api/
    oven/route.ts
    cron/daily/route.ts
    webhooks/sepay/route.ts
  manifest.ts  robots.ts  sitemap.ts  icon.tsx  opengraph-image.tsx
components/
  ui/                           # primitive: sheet.tsx, button.tsx, chip.tsx, segmented.tsx,
                                #   stepper.tsx, field.tsx, toast.tsx, skeleton.tsx
  store/                        # oven-bar-live.tsx, oven-bar-server.tsx, slot-chips.tsx,
                                #   brand-strip.tsx, bento-menu.tsx, product-tile.tsx,
                                #   item-sheet.tsx, cart-bar.tsx, checkout-sheet.tsx,
                                #   phone-field.tsx, fulfillment-picker.tsx, order-success.tsx,
                                #   why-preorder-sheet.tsx, store-footer.tsx, cart-provider.tsx
  admin/                        # prep-board.tsx, batch-card.tsx, order-list.tsx,
                                #   order-detail-sheet.tsx, route-sheet.tsx, quick-order-form.tsx,
                                #   settings-panel.tsx, tab-bar.tsx, wake-lock.tsx
data/
  copy.ts                       # toàn bộ chuỗi UI tiếng Việt (typed object)
  dine-in.ts                    # thực đơn Café & KOLD Gelato cho /tai-quan
  seed.ts                       # Phụ lục A (dùng chung: fixture test M1 + db:seed M2)
  site.ts                       # thông tin thương hiệu, hotline, Zalo, pháp lý
lib/
  domain/                       # THUẦN — không import DB/Next/React
    time.ts  phone.ts  oven-status.ts  capacity.ts  pricing.ts
    order-status.ts  prep.ts  order-code.ts  types.ts
    __tests__/*.test.ts
  server/                       # mỗi file có `import 'server-only'`
    db/schema.ts  db/client.ts  db/seed.ts
    dal/catalog.ts  dal/schedule.ts  dal/customers.ts  dal/orders.ts
    dal/prep.ts  dal/settings.ts
    auth/session.ts             # encrypt/decrypt, requireStaff(role?)
    customer-cookie.ts          # cookie "ghi nhớ" ký HMAC
    rate-limit.ts
    notify/telegram.ts
    payments/vietqr.ts  payments/sepay.ts
  client/
    cart-store.ts               # reducer + persist localStorage (try/catch)
    use-server-clock.ts         # bù lệch đồng hồ client/server
    use-countdown.ts
  format.ts                     # formatPrice, formatPhone, formatVnTime
drizzle/                        # migrations SQL sinh bởi drizzle-kit
drizzle.config.ts
proxy.ts
instrumentation.ts              # onRequestError → Telegram cảnh báo lỗi
e2e/*.spec.ts
docs/BLUEPRINT.md  docs/MARKETING.md
```

### 5.6 Biến môi trường

| Biến | Bắt buộc | Mô tả |
|---|---|---|
| `DATABASE_URL` | ✅ | Supabase **transaction pooler** (cổng 6543) — dùng cho app |
| `DIRECT_URL` | ✅ | Supabase kết nối trực tiếp/session pooler (cổng 5432) — chỉ dùng cho migration |
| `SESSION_SECRET` | ✅ | ≥ 32 byte, ký JWT phiên admin |
| `CUSTOMER_COOKIE_SECRET` | ✅ | Ký HMAC cookie "ghi nhớ khách" |
| `NEXT_PUBLIC_SITE_URL` | ✅ | `https://theheatpizza.vn` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | ✅ | Bot & nhóm "Bếp The Heat" |
| `CRON_SECRET` | ✅ | Bảo vệ `/api/cron/*` |
| `VIETQR_BANK_BIN`, `VIETQR_ACCOUNT_NO`, `VIETQR_ACCOUNT_NAME` | ✅ (M6) | Tài khoản nhận tiền |
| `VIETQR_BANK_NAME` | tuỳ chọn | Tên ngân hàng hiện cạnh số TK |
| `SEPAY_WEBHOOK_KEY` | M6 | Xác thực webhook |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Phương án B | Khoá cố định khi tự host nhiều instance |
| `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_OPS_CHAT_ID` | M7 | Webhook bot vận hành (§17.4) |

Không commit file `.env*` (đã có trong `.gitignore`). Thêm `.env.example` liệt kê tên biến.

---

## 6. Mô hình dữ liệu

### 6.1 Sơ đồ quan hệ

```
products ─┬─< recipe_lines >── ingredients
          └─(combo_config: lựa chọn pizza/bbq)
zones >── routes                       pickup_points
slot_templates ──(sinh)──▶ batches >── service_days
customers ─< addresses >── zones
customers ─< orders >── batches
orders ─< order_items >── products
orders ─< order_events
orders ─< payments
staff        settings        rate_limits        (GĐ2: waitlist, day_stock)
```

### 6.2 Bảng (Drizzle; tên cột snake_case trong DB, camelCase trong TS)

**`products`** — thực đơn (ít món, đổi hiếm; chỉnh từ dashboard tab Cài đặt)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | text PK | slug: `pepperoni-pan` |
| `kind` | enum `pizza·bbq·combo·addon` | |
| `name`, `short`, `description` | text | `short` ≤ 40 ký tự cho ô Bento |
| `price` | integer | VND |
| `image` | text | đường dẫn `/images/...` |
| `badge` | text null | "Bán chạy", "Mới" |
| `uses_pan`, `uses_bbq` | smallint default 0 | pizza: 1/0, bbq: 0/1, combo: 1/1, addon: 0/0 |
| `combo_config` | jsonb null | `[{ "key":"pizza","label":"Chọn pizza","options":["pepperoni-pan","garlic-cheese-pan"] }, { "key":"bbq", ... }]` |
| `upsell_ids` | text[] | add-on gợi ý trong sheet món |
| `supplier` | text null | `reu` cho cold brew → báo cáo đối soát |
| `is_active` | bool | Có trong thực đơn |
| `is_available` | bool | Công tắc nhanh "Hết hôm nay" |
| `sort` | smallint | |

**`ingredients`**: `id` text PK (`pan-dough`), `label` ("Đế Pan đã ủ"), `unit` (`đế·túi·g·hũ·phần·hộp·khay·chai`), `unit_weight_g` int null (túi sườn 500 → hiển thị ≈ kg), `storage` (`tủ đông·tủ mát·kệ·quầy Rêu`), `sort`.

**`recipe_lines`**: (`product_id`, `ingredient_id`) PK, `qty` numeric(10,2). Combo **không** có recipe riêng — được "nổ" thành các món thành phần theo lựa chọn khi tính Prep.

**`routes`**: `id` serial, `name` ("Tuyến Khu phố 2"), `sort`.
**`zones`**: `id` serial, `name` ("Khu phố 2"), `route_id` FK, `ship_fee` int, `sort`, `is_active`.
**`pickup_points`**: `id` serial, `name` ("Cà phê Rêu"), `address`, `maps_url`, `gift_product_id` FK null (`sauce-garlic-butter`), `is_active`.

**`slot_templates`**: `id`, `weekday` smallint (0 = CN … 6 = T7), `ready_time` time (`17:00`), `oven_lead_min` smallint (20), `cutoff_time` time (`15:30`), `cap_pan` smallint, `cap_bbq` smallint, `is_active`. `UNIQUE (weekday, ready_time)`; `CHECK (cutoff_time < ready_time)`.

**`service_days`**: `date` date PK, `status` enum `open·closed·paused`, `pause_message` text null, `order_seq` int default 0, `summary_sent_at` timestamptz null, `note`.

**`batches`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | serial PK | |
| `service_date` | date FK | |
| `ready_at`, `oven_at`, `cutoff_at` | timestamptz | luôn tính từ giờ VN (§7.1) |
| `cap_pan`, `cap_bbq` | smallint | |
| `used_pan`, `used_bbq` | smallint default 0 | `CHECK (used_pan <= cap_pan AND used_bbq <= cap_bbq)` |
| `status` | enum `open·closed·baking·done` | `closed` = chủ quán đóng sớm |
| | | `UNIQUE (service_date, ready_at)` |

**`customers`**: `id` uuid, `phone` text UNIQUE (dạng chuẩn `0xxxxxxxxx`), `name`, `remember` bool, `order_count`, `completed_count`, `no_show_count` int, `last_order_at`, `is_blocked` bool, `staff_note` text, `marketing_opt_in` bool, `created_at`.

**`addresses`**: `id` uuid, `customer_id` FK, `zone_id` FK, `description` text, `lat`/`lng` double null, `last_used_at`.

**`orders`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `code` | text UNIQUE | `TH-0611-12` (ngày-tháng + số thứ tự trong ngày); khách thấy "Đơn #12" |
| `seq` | int | `UNIQUE (service_date, seq)` |
| `service_date`, `batch_id` | FK | |
| `channel` | enum `web·phone·zalo·walkin·grab·shopee` | |
| `customer_id` | FK | |
| `customer_name`, `customer_phone` | text | **snapshot** tại thời điểm đặt |
| `fulfillment` | enum `delivery·pickup` | |
| `zone_id` / `pickup_point_id` | FK null | đúng một trong hai khác null (CHECK) |
| `address_text`, `lat`, `lng` | snapshot | |
| `pan_units`, `bbq_units` | smallint | để trả suất khi huỷ |
| `subtotal`, `ship_fee`, `discount`, `total` | integer | |
| `payment_method` | enum `cod·transfer` | |
| `payment_status` | enum `unpaid·paid·refunded` | |
| `status` | enum `placed·confirmed·baking·ready·delivering·completed·cancelled·no_show` | §7.5 |
| `note` | text ≤ 300 | |
| `source` | text null | từ cookie `th_src` |
| `tracking_token` | text UNIQUE | 22 ký tự base64url |
| `idempotency_key` | uuid UNIQUE | |
| `cancel_reason` | text null | |
| `created_at`, `updated_at` | timestamptz | |
| | | Index: `(service_date, batch_id)`, `(customer_phone)`, `(status)` |

**`order_items`**: `id`, `order_id` FK, `product_id` FK, `name` (snapshot), `unit_price`, `qty`, `line_total`, `parent_item_id` FK null (add-on gắn với món chính nào — chỉ để hiển thị), `combo_choices` jsonb null (`{"pizza":"pepperoni-pan","bbq":"ribs-sv"}`), `is_gift` bool.

**`order_events`** (nhật ký kiểm toán): `id`, `order_id`, `type` (`placed`, `status_changed`, `paid`, `cancelled`, `edited`), `data` jsonb, `actor` (`customer`·`staff:<id>`·`system`), `created_at`.

**`payments`**: `id`, `order_id` FK null (null nếu chưa khớp), `provider` (`sepay`·`manual`), `provider_txn_id` UNIQUE, `amount`, `memo`, `raw` jsonb, `created_at`.

**`staff`**: `id`, `name`, `role` enum `owner·kitchen·shipper`, `pin_hash`, `is_active`. **M7:** đổi thành `roles` mảng enum `owner·manager·kitchen·server·barista·shipper` + `telegram_user_id` bigint null UNIQUE (§17.2). Bảng vận hành: §17.

**`settings`** (key/value jsonb, các key cố định, kiểu được định nghĩa trong `lib/domain/types.ts`):

| key | Giá trị mặc định |
|---|---|
| `ordering` | `{ "daysAhead": 4, "closingSoonMin": 45, "fewThreshold": 2, "deliveryWindowMin": 20, "maxQtyPerLine": 10 }` |
| `payment` | `{ "prepayPolicy": "risk_based", "prepayOverTotal": 1000000 }` |
| `shipping` | `{ "freeShipFrom": null }` |
| `contact` | `{ "hotline": "…", "zaloPhone": "…" }` |

**`rate_limits`**: (`key` text, `window_start` timestamptz) PK, `count` int. Dọn bản ghi cũ trong cron hằng ngày.

### 6.3 Bất biến (invariant) phải được test

1. Với mọi batch: `used_pan = Σ pan_units` và `used_bbq = Σ bbq_units` của các đơn có `status ≠ cancelled`. Chỉ `cancelled` mới trả suất; `no_show` **không** trả (bánh đã nướng, lò đã dùng).
2. `orders.total = subtotal + ship_fee − discount ≥ 0`; `subtotal = Σ order_items.line_total`.
3. Prep: tổng toàn ngày = Σ các mẻ (§7.6).
4. Mỗi đơn có đúng một trong `zone_id`/`pickup_point_id`.

---

## 7. Logic nghiệp vụ lõi (thuần, test được)

### 7.1 `lib/domain/time.ts` — múi giờ Việt Nam

```ts
export const VN_TZ = "Asia/Ho_Chi_Minh";      // UTC+7, không có giờ mùa hè
export type ISODate = `${number}-${number}-${number}`; // "2026-11-06"

export function vnInstant(date: ISODate, hhmm: string): Date;   // new Date(`${date}T${hhmm}:00+07:00`)
export function vnDateOf(instant: Date): ISODate;               // ngày theo giờ VN
export function vnTimeLabel(instant: Date): string;             // "17:00"
export function vnWeekday(date: ISODate): 0|1|2|3|4|5|6;        // 0 = Chủ nhật
export function vnDayLabel(date: ISODate, today: ISODate): string; // "Tối nay" | "Mai" | "T7 07/11"
export function addDays(date: ISODate, n: number): ISODate;
export function formatRemaining(ms: number): string;
// > 60 phút: "còn 2 giờ 15 phút" · 10–60 phút: "còn 18 phút" · < 10 phút: "còn 09:42" · ≤ 0: "đã chốt"
```

Mọi hàm nhận `now: Date` làm tham số (không tự gọi `Date.now()`) để test được và tương thích quy tắc "Random values and timestamps" của `cacheComponents`.

### 7.2 `lib/domain/oven-status.ts` — state machine của Oven Bar

```ts
type SlotView = {
  batchId: number;
  date: ISODate;
  readyAt: string;          // ISO
  readyLabel: string;       // "18:00"
  cutoffAt: string;
  remainingPan: number;     // max(0, cap_pan - used_pan)
  remainingBbq: number;
  level: "plenty" | "few" | "last" | "bbq_only" | "full" | "closed";
};

type OvenStatus =
  | { kind: "open";         date: ISODate; nextCutoffAt: string; batchIndex: number; slots: SlotView[]; upcoming: DayTab[] }
  | { kind: "closing_soon"; date: ISODate; nextCutoffAt: string; batchIndex: number; slots: SlotView[]; upcoming: DayTab[] }
  | { kind: "sold_out";     date: ISODate; nextOpenDate: ISODate | null; slots: SlotView[]; upcoming: DayTab[] }
  | { kind: "after_cutoff"; date: ISODate; nextOpenDate: ISODate | null; upcoming: DayTab[] }
  | { kind: "day_off";      date: ISODate; nextOpenDate: ISODate | null; upcoming: DayTab[] }
  | { kind: "paused";       date: ISODate; message: string; upcoming: DayTab[] };

type DayTab = { date: ISODate; label: string; hasCapacity: boolean };

export function computeOvenStatus(input: {
  now: Date;
  days: { date: ISODate; status: "open" | "closed" | "paused"; pauseMessage?: string;
          batches: { id: number; readyAt: Date; cutoffAt: Date; capPan: number; usedPan: number;
                     capBbq: number; usedBbq: number; status: string }[] }[];
  settings: { closingSoonMin: number; fewThreshold: number };
}): OvenStatus;
```

**Quy tắc (theo thứ tự ưu tiên, xét ngày hôm nay theo giờ VN):**

1. `service_days.status = paused` → `paused`.
2. Không có ngày hôm nay / `closed` / không có mẻ nào → `day_off`.
3. `openBatches` = các mẻ `status = open` và `now < cutoffAt`.
   - Rỗng → `after_cutoff`.
   - Tất cả `level ∈ {full}` → `sold_out`.
   - `nextCutoffAt` = cutoff sớm nhất trong các mẻ còn suất; nếu `nextCutoffAt − now ≤ closingSoonMin` → `closing_soon`, ngược lại `open`.
4. `level` của slot: `remainingPan = 0 && remainingBbq > 0` → `bbq_only`; `remainingPan = 0 && remainingBbq = 0` → `full`; `remainingPan = 1` → `last`; `remainingPan ≤ fewThreshold` → `few`; còn lại `plenty`; mẻ qua cutoff hoặc `closed` → `closed`.
5. `batchIndex` = thứ tự (1-based) của mẻ có `nextCutoffAt` trong ngày → "mẻ 1".
6. `nextOpenDate` = ngày gần nhất trong `daysAhead` tới có ít nhất một slot chưa `full`.

**Bảng câu chữ (đặt trong `data/copy.ts`):**

| kind | Dòng trạng thái | Màu chấm | CTA phụ |
|---|---|---|---|
| `open` | 🟢 Đang nhận đặt trước cho **tối nay** · ⏳ Chốt đơn mẻ 1 lúc **15:30** (còn 2 giờ 15 phút) | xanh `--live` có nhịp thở | — |
| `closing_soon` | 🟠 Sắp chốt đơn mẻ 1 · **còn 18 phút** (dưới 10 phút: đếm `mm:ss`) | cam `--warn` | — |
| `sold_out` | 🔴 Tối nay đã kín lò | đỏ `--danger` | "Đặt trước cho T7 07/11 →" |
| `after_cutoff` | 🌙 Đã chốt sổ tối nay · Đang nhận đặt cho **T7 07/11** | xám | "Chọn T7 →" |
| `day_off` | 🌙 Hôm nay lò nghỉ · Mở đặt cho **T7 07/11** | xám | "Chọn T7 →" |
| `paused` | ⏸ Tạm ngưng nhận đơn: *{message}* | cam | "Gọi quán" |

Hàng chip giờ: `[17:00 · Còn 3 suất]` `[18:00 · Còn 1 suất 🔥]` `[19:00 · Còn 4 suất]`; `bbq_only` → `[18:00 · Chỉ còn BBQ]`; `full` → `[19:00 · Kín lò]` (disabled).

### 7.3 `lib/domain/capacity.ts`

```ts
type Requirement = { pan: number; bbq: number };
export function requirementOf(lines: { product: Product; qty: number }[]): Requirement;
// Σ product.usesPan × qty, Σ product.usesBbq × qty (add-on = 0)

export function fits(req: Requirement, slot: { remainingPan: number; remainingBbq: number }): boolean;
export function availabilityForProduct(product: Product, slot: SlotView):
  { ok: true; maxQty: number } | { ok: false; reason: "no_pan" | "no_bbq" | "closed" };
```

**Giữ suất phía server (trong transaction của `placeOrder`):**

```sql
UPDATE batches
   SET used_pan = used_pan + $pan,
       used_bbq = used_bbq + $bbq
 WHERE id = $batch_id
   AND status = 'open'
   AND now() < cutoff_at
   AND used_pan + $pan <= cap_pan
   AND used_bbq + $bbq <= cap_bbq
RETURNING id;
```

0 dòng trả về → đọc lại batch để xác định lý do (`cutoff_passed` hay `slot_full`) → rollback → trả về `alternatives` (các slot khác cùng ngày & ngày kế tiếp vừa với `Requirement`). Huỷ đơn: trừ ngược trong cùng transaction với việc đổi trạng thái (`WHERE status NOT IN ('cancelled','no_show')` để không trả suất hai lần).

### 7.4 `lib/domain/pricing.ts`

```ts
export function priceOrder(input: {
  lines: { product: Product; qty: number; comboChoices?: Record<string, string>;
           addons?: { product: Product; qty: number }[] }[];
  fulfillment: { type: "delivery"; zone: Zone } | { type: "pickup"; point: PickupPoint; giftProduct?: Product };
  shipping: { freeShipFrom: number | null };
}): {
  items: PricedItem[];      // gồm cả dòng quà isGift, unitPrice 0
  subtotal: number; shipFee: number; discount: number; total: number;
};
```

Kết quả: `{ ok: true, … } | { ok: false; error: { reason: "invalid_qty" | "invalid_combo" | "invalid_addon"; productId } | { reason: "unavailable"; productIds } }` — không ném lỗi; mỗi `PricedItem` có `parentIndex` (add-on gắn món nào). Quà hết hàng → bỏ qua, không chặn đơn.

Quy tắc: phí ship = `zone.shipFee` (0 nếu `subtotal ≥ freeShipFrom`); nhận tại điểm → phí 0 + thêm **1** dòng quà `giftProduct` mỗi đơn; tổng là số nguyên; không cho tổng âm. Lựa chọn combo phải thuộc `combo_config.options`; add-on phải thuộc `upsell_ids` của món cha hoặc là món `addon` mua riêng.

### 7.5 `lib/domain/order-status.ts` — vòng đời đơn

```
placed ──▶ confirmed ──▶ baking ──▶ ready ──┬──▶ delivering ──▶ completed
   │            │                            ├──▶ completed (pickup đã lấy)
   └────────────┴──▶ cancelled               └──▶ no_show
                                         delivering ──▶ no_show
```

- `placed → confirmed` **tự động** nếu: khách có `completed_count ≥ 1` và `no_show_count = 0`, **hoặc** đã thanh toán. Ngược lại chờ chủ quán bấm xác nhận (thường sau một cuộc gọi).
- Huỷ bởi khách (qua `/o/[token]`): chỉ khi `status ∈ {placed, confirmed}` **và** `now < cutoff_at`.
- Huỷ bởi nhân viên: bất kỳ lúc nào trước `baking`; sau đó cần `owner` + lý do.
- `no_show` → `customers.no_show_count += 1` (kích hoạt trả trước cho lần sau).
- `completed` → `customers.completed_count += 1`.
- Trạng thái hiển thị cho khách: *Đã nhận đơn* (placed/confirmed) → *Đang nướng* → *Ra lò* → *Đang giao* / *Chờ bạn ở Rêu* → *Hoàn tất*.

Export `canTransition(from, to, ctx)` và dùng nó ở mọi action đổi trạng thái. `ctx = { actor, fulfillment, now, cutoffAt, reason? }`; lỗi trả `invalid_transition · forbidden · too_late · reason_required`.

- Đơn giao: `ready → delivering` bắt buộc; đơn nhận tại điểm: `ready → completed | no_show` (không qua `delivering`).
- **Quyền (chốt ở M1):** `system` chỉ `placed → confirmed`. `kitchen` tới `ready` **và** bàn giao đơn nhận tại quầy (`ready → completed | no_show`) vì bếp đặt tại Rêu. `shipper`: đơn giao `ready → delivering → completed | no_show`, không được huỷ.
- Kèm `shouldAutoConfirm`, `releasesCapacity`, `customerStage` (khoá giai đoạn; nhãn chữ nằm ở `data/copy.ts`).

### 7.6 `lib/domain/prep.ts` — Bảng Tổng Hợp Chuẩn Bị

```ts
type PrepReport = {
  date: ISODate;
  generatedAt: string;
  isFinal: boolean;                  // now ≥ giờ chốt muộn nhất trong ngày
  orderCount: number;
  totals: {
    mains: { pizza: number; bbq: number };
    byProduct: { productId: string; name: string; qty: number; kind: Kind }[];   // combo đã nổ
    ingredients: { ingredientId: string; label: string; qty: number; unit: string; storage: string;
                   approxKg?: number;
                   split?: { sold: number; gift: number };                        // có hàng tặng → "4 bán · 3 tặng"
                   byProduct?: { productId: string; name: string; qty: number }[] // ≥ 2 món cùng loại → "5 Pepperoni · 4 Bơ tỏi"
                 }[];
    supplier: { supplier: "reu"; productId: string; qty: number }[];             // đối soát
  };
  batches: {
    batchId: number; readyLabel: string; ovenLabel: string;
    pizza: { name: string; qty: number }[]; bbq: { name: string; qty: number }[];
    addons: { name: string; qty: number }[];
    routes: { routeId: number; routeName: string;
              stops: { code: string; seq: number; name: string; phone: string; zone: string;
                       address: string; mapsUrl?: string; collect: number; paid: boolean; note?: string }[] }[];
    pickups: { pointName: string; orders: { code: string; seq: number; name: string; collect: number }[] }[];
  }[];
  warnings: { kind: "unpaid_transfer" | "allergy_note" | "unconfirmed"; orderCode: string; text: string }[];
};

export function buildPrepReport(input: { date: ISODate; now: Date; orders: OrderWithItems[];
  products: Product[]; recipes: RecipeLine[]; ingredients: Ingredient[]; batches: Batch[];
  zones: Zone[]; routes: Route[]; points: PickupPoint[] }): PrepReport;
```

Thuật toán:
1. Lọc đơn của ngày, bỏ `cancelled`.
2. Với mỗi dòng: combo → thay bằng các món thành phần theo `combo_choices` (mỗi thành phần qty = qty combo). Dòng quà vẫn tính vào nguyên liệu, **ghi rõ** "(x bán · y tặng)".
3. Cộng dồn theo sản phẩm → nhân BOM → cộng dồn theo nguyên liệu. `approxKg = qty × unit_weight_g / 1000`.
4. Chia theo mẻ (mẻ trống vẫn liệt kê); trong mẻ, đơn giao nhóm theo tuyến (`routes.sort`), trong tuyến xếp theo `zones.sort` rồi `seq`; khu vực không tìm thấy → nhóm "Chưa rõ tuyến" cuối danh sách. Đơn nhận tại chỗ nhóm theo điểm nhận.
5. `collect` = `total` nếu `payment_status = unpaid`, ngược lại 0.
6. Cảnh báo: chuyển khoản chưa nhận tiền; ghi chú chứa từ khoá (`dị ứng`, `không`, `ít`, `chay`) → `allergy_note`; đơn còn `placed`.
7. **Bất biến:** `totals.mains` = Σ các mẻ; test bắt buộc với bộ dữ liệu ở Phụ lục B.

### 7.7 `lib/domain/phone.ts` & nhận diện khách cũ

```ts
export function normalizePhone(raw: string): string | null;
// bỏ khoảng trắng . - ( ); "+84"/"84" → "0"; hợp lệ nếu /^0(3|5|7|8|9)\d{8}$/ → trả "0912345678"
export function formatPhone(p: string): string;     // "0912 345 678"
export function maskName(name: string): string;     // "Nguyễn Văn Tuấn" → "Tuấn"
```

**Luồng nhận diện (quan trọng về quyền riêng tư):**

| Tình huống | Hệ thống làm gì | Dữ liệu trả về client |
|---|---|---|
| Thiết bị có cookie `th_c` hợp lệ (khách đã bật "Ghi nhớ") và SĐT khớp | Tự điền **đầy đủ** tên, khu vực, mô tả nhà | Đầy đủ (của chính họ, trên máy của họ) |
| Thiết bị lạ, SĐT là khách cũ | Chào "Mừng **Tuấn** quay lại! Giao tới địa chỉ lần trước (**Khu phố 2**)?" → [Dùng địa chỉ này] [Nhập địa chỉ khác] | Chỉ **tên gọi** + **tên khu vực** + `savedAddressToken` (token ký, hết hạn 30 phút, server dùng để tra địa chỉ thật). **Không** trả mô tả nhà, họ tên đầy đủ, toạ độ |
| SĐT mới | Không hiện gì đặc biệt, khách điền tiếp | `{ status: "new" }` |
| Khách cần trả trước (từng bom hàng) | Khoá lựa chọn "Tiền mặt", giải thích nhẹ nhàng | `requiresPrepay: true` |

Bảo vệ: rate-limit `lookup` 5 lần/10 phút/IP và 30 lần/ngày/IP; debounce 300 ms phía client; chỉ gọi khi đủ 10 số hợp lệ. Cookie `th_c` chỉ được đặt khi khách **chủ động bật** "Ghi nhớ thông tin cho lần sau" (mặc định tắt), httpOnly, `SameSite=Lax`, 180 ngày.

### 7.8 `lib/domain/order-code.ts`

`code = "TH-" + DD + MM + "-" + seq(2+ chữ số)` → `TH-0611-12`. Nội dung chuyển khoản (ASCII, không dấu cách): `TH061112`. Webhook khớp bằng regex `/TH(\d{2})(\d{2})(\d{2,3})(?!\d)/i` (không ăn nhầm số tham chiếu dính liền) + `service_date` = ngày cùng DD/MM gần nhất trong ±7 ngày (`matchTransferMemo`). `seq` lấy bằng `UPDATE service_days SET order_seq = order_seq + 1 … RETURNING order_seq` trong cùng transaction.

---

## 8. Hợp đồng API (Server Actions & Route Handlers)

### 8.1 `placeOrder` — `app/actions/order.ts`

```ts
const PlaceOrderInput = z.object({
  idempotencyKey: z.uuid(),
  batchId: z.number().int().positive(),
  lines: z.array(z.object({
    productId: z.string().max(40),
    qty: z.number().int().min(1).max(10),
    comboChoices: z.record(z.string(), z.string()).optional(),
    addons: z.array(z.object({ productId: z.string().max(40), qty: z.number().int().min(1).max(10) })).max(5).optional(),
  })).min(1).max(15),
  customer: z.object({
    phone: z.string().max(20),
    name: z.string().trim().min(2).max(40),
    remember: z.boolean(),
  }),
  fulfillment: z.discriminatedUnion("type", [
    z.object({ type: z.literal("delivery"), zoneId: z.number().int(),
               addressText: z.string().trim().min(8).max(200).optional(),
               savedAddressToken: z.string().max(200).optional(),
               lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional() }),
    z.object({ type: z.literal("pickup"), pickupPointId: z.number().int() }),
  ]),
  paymentMethod: z.enum(["cod", "transfer"]),
  note: z.string().trim().max(300).optional(),
  website: z.string().max(0).optional(),     // honeypot — phải rỗng
  startedAt: z.number().int(),               // ms; từ chối nếu điền < 3 giây
});

type PlaceOrderResult =
  | { ok: true; code: string; seq: number; trackingPath: string; readyLabel: string; dayLabel: string;
      etaLabel: string;          // "khoảng 18:00–18:20" (giao) · "18:00 tại Cà phê Rêu" (nhận)
      cutoffLabel: string;       // "15:30" — câu "Huỷ miễn phí trước …"
      total: number; status: "placed" | "confirmed";
      payment: { method: "cod" } | { method: "transfer"; qrUrl: string; memo: string; amount: number } }
  | { ok: false; reason: "invalid"; fieldErrors: Partial<Record<FieldKey, ErrorKey>> }
  | { ok: false; reason: "slot_full" | "cutoff_passed"; alternatives: SlotView[] }
  | { ok: false; reason: "unavailable"; productIds: string[] }
  | { ok: false; reason: "prepay_required" }
  | { ok: false; reason: "rate_limited" | "paused" | "contact_us" | "server_error" };
```

**Pipeline:** parse → honeypot/thời gian điền → rate-limit (`order:ip` 5/10 phút, `order:phone` 3/10 phút) → chuẩn hoá SĐT → tải catalog (cached) & kiểm tra `is_active && is_available` → kiểm tra lựa chọn combo/add-on → `requirementOf` + `priceOrder` → nếu đã có đơn với `idempotencyKey` → trả lại kết quả cũ → kiểm tra khách bị chặn (`contact_us`, không nói lý do) & chính sách trả trước → **transaction** {upsert khách (+ địa chỉ nếu `remember`), giữ suất (§7.3), tăng `seq`, insert `orders` + `order_items` + `order_events`} → đặt cookie `th_c` nếu `remember` → `after(() => notifyNewOrder(...))` → trả kết quả.

### 8.2 Các action/route còn lại

| Tên | Loại | Input | Output | Bảo vệ |
|---|---|---|---|---|
| `lookupCustomer` | Action | `{ phone }` | `{status:"new"} \| {status:"known"; greetingName; zoneId; zoneName; savedAddressToken; requiresPrepay} \| {status:"self"; name; zoneId; addressText; lat; lng; requiresPrepay}` | rate-limit §7.7 |
| `cancelOrderByToken` | Action | `{ token, reason? }` | `{ok} \| {ok:false; reason:"too_late"\|"not_found"\|"rate_limited"}` | token + `now < cutoff_at`; rate-limit 10/10 phút/IP |
| `GET /api/oven` | Route | — | `OvenSnapshot = { serverNow, status: OvenStatus, days: DaySlots[], rules: { maxQtyPerLine, freeShipFrom, deliveryWindowMin } }` — `days` = mọi ngày còn mẻ nhận (hôm nay … +daysAhead) kèm chip giờ, để tab ngày & chọn mẻ không cần gọi thêm | public, cache 10 s |
| `login` / `logout` | Action | `{ staffId, pin }` | redirect | rate-limit 5/15 phút/IP |
| `advanceOrders` | Action (admin) | `{ orderIds[], to }` | `{ updated }` | `requireStaff()` + `canTransition` |
| `advanceBatch` | Action (admin) | `{ batchId, to: "baking"\|"ready" }` | | `requireStaff()` |
| `markPaid` | Action (admin) | `{ orderId, method }` | | `requireStaff("owner")` |
| `cancelOrder` | Action (admin) | `{ orderId, reason }` | | `requireStaff()`; sau `baking` cần `owner` |
| `createQuickOrder` | Action (admin) | như `placeOrder` + `channel` | | `requireStaff()`; bỏ qua honeypot/cutoff nếu `owner` chọn "vượt giờ chốt" (ghi event) |
| `updateBatch` | Action (admin) | `{ batchId, capPan?, capBbq?, status? }` | | `owner`; không cho `cap < used` |
| `setDayStatus` | Action (admin) | `{ date, status, pauseMessage? }` | | `owner` |
| `toggleProduct` | Action (admin) | `{ productId, isAvailable }` | `updateTag('catalog')` | `owner` |
| `GET /api/cron/daily` | Route | — | `{ created, summarySent }` | `CRON_SECRET` |
| `POST /api/webhooks/sepay` | Route | payload SePay | `200 {success:true}` | API key header; idempotent `provider_txn_id` |

Mọi action admin ghi `order_events` với `actor = staff:<id>`.

---

## 9. Đặc tả UI/UX — Trang đặt món

### 9.1 Ngôn ngữ thiết kế ("Apple-tier, dark, ấm như lửa")

**Nguyên tắc:** (1) Món ăn là nhân vật chính — ảnh lớn, nền đen tuyệt đối để màu phô mai cháy nổi bật. (2) Một hành động chính mỗi màn hình. (3) Con số thật (suất, giờ, tiền) dùng `tabular-nums`. (4) Chuyển động có mục đích, mềm, tôn trọng `prefers-reduced-motion`. (5) Mọi vùng chạm ≥ 44×44 px.

**Token (mở rộng `app/globals.css`, bỏ nhánh light):**

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--bg` | `#000000` | nền trang |
| `--surface` | `#1c1c1e` | ô Bento, sheet |
| `--elevated` | `#2c2c2e` | input, chip |
| `--line` | `rgba(255,255,255,.10)` | viền |
| `--text` / `--secondary` / `--tertiary` | `#f5f5f7` / `#a1a1a6` / `#6e6e73` | chữ |
| `--accent` | `#ff3d00` | màu lửa thương hiệu: CTA chính, 🔥 |
| `--on-accent` | `#000000` | chữ trên nền `--accent`. **Không dùng chữ trắng**: trắng/#ff3d00 chỉ 3,5:1 (trượt WCAG AA), đen đạt ≈ 5,9:1 |
| `--accent-glow` | `color-mix(in srgb, #ff3d00 22%, transparent)` | gradient ấm sau ô Combo |
| `--live` | `#30d158` | chấm "đang nhận" |
| `--warn` | `#ff9f0a` | sắp chốt, tạm ngưng |
| `--danger` | `#ff453a` | kín lò, lỗi |
| Bo góc | ô 28 px · sheet 32 px (trên) · input 16 px · chip/nút 999 px | |
| Easing | `--ease-out: cubic-bezier(0.22,1,0.36,1)` (đã có) · `--ease-sheet: cubic-bezier(0.32,0.72,0,1)` | |
| Font | Be Vietnam Pro 400/500/600/700 (đã có) | tiêu đề 600, giá 600 `tabular-nums` |

Giao diện chỉ tối: `color-scheme: dark`, `theme-color #000000`, viewport `viewport-fit=cover` để dùng `env(safe-area-inset-*)`.

### 9.2 Bố cục trang (mobile 390 px, từ trên xuống)

```
┌──────────────────────────────────────────┐
│● Đang nhận đặt trước cho tối nay         │  ◀ KHU VỰC 1: Live Oven Bar (sticky)
│⏳ Chốt đơn mẻ 1 lúc 15:30 · còn 2g15p     │
│ Tối nay │ T7 07/11 │ CN 08/11             │  ◀ chỉ hiện khi daysAhead > 0
│[17:00·Còn 3][18:00·Còn 1 🔥][19:00·Còn 4]│
├──────────────────────────────────────────┤
│ [H] THE HEAT PIZZA                        │  ◀ Brand strip (1 dòng + 1 câu)
│ Pan pizza kiểu Mỹ & BBQ sous-vide         │
│ Nướng theo mẻ · Đặt trước mới làm  (?)    │  ◀ chạm "(?)" mở sheet "Vì sao đặt trước?"
├──────────────────────────────────────────┤
│┌────────────────────────────────────────┐│  ◀ KHU VỰC 2: Bento Menu
││  COMBO ĐÔI   Pizza + BBQ     [Bán chạy]││     ô hero, col-span-2, 16:10
││  289.000đ                          ( + )││
│└────────────────────────────────────────┘│
│┌──────────────────┐┌──────────────────┐ │
││ PEPPERONI PAN    ││ PHÔ MAI BƠ TỎI   │ │     ô dọc 3:4
││ 159.000đ   ( + ) ││ 149.000đ   ( + ) │ │
│└──────────────────┘└──────────────────┘ │
│┌────────────────────────────────────────┐│
││ SƯỜN BBQ SOUS-VIDE 24H         ( + )   ││     ô ngang 2:1
│└────────────────────────────────────────┘│
│┌────────────────────────────────────────┐│
││ BBQ #2                          ( + )  ││
│└────────────────────────────────────────┘│
│┌──────────────────┐┌──────────────────┐ │
││ SỐT CHẤM  10k    ││ COLD BREW RÊU 18k│ │     ô nhỏ 1:1 (add-on mua riêng)
│└──────────────────┘└──────────────────┘ │
├──────────────────────────────────────────┤
│ 1 Chọn món · 2 Chọn mẻ · 3 Nhận nóng hổi │  ◀ "Cách đặt" 1 dòng
│ ☕ Nhận tại Rêu: … · Bản đồ               │
│ ☎ 09xx · Zalo · Chính sách · Thông tin KD │  ◀ footer tối giản (bắt buộc pháp lý)
└──────────────────────────────────────────┘
        ┌────────────────────────────────┐
        │ 2 món · Nhận 18:00   348.000đ ▶ │      ◀ Cart bar nổi (khi giỏ có món)
        └────────────────────────────────┘
```

Desktop (≥ 1024 px): nội dung `max-w-5xl`, Bento 4 cột (Combo 2×2, pizza 1×2, BBQ 2×1, add-on 1×1); sheet hiển thị dạng panel giữa màn hình rộng 480 px.

### 9.3 Khu vực 1 — Live Oven Bar

- **Sticky** `top-0`, nền `rgba(0,0,0,.72)` + `backdrop-blur-xl` (giống header hiện có), viền dưới `--line`.
- **Hai trạng thái chiều cao:** mở rộng (≈ 104 px: dòng trạng thái + tab ngày + chip) và thu gọn (≈ 48 px: một dòng "● Chốt 15:30 · còn 2g15p · [18:00 ▾]") khi cuộn quá 120 px. Dùng `IntersectionObserver` với phần tử mốc, **không** dùng scroll listener. Chuyển đổi bằng `grid-template-rows` transition 240 ms.
- **Đồng hồ:** server gửi `serverNow`; client tính `offset = serverNow − Date.now()` lúc nhận, mọi đếm ngược dùng `Date.now() + offset`. Cập nhật mỗi 30 s khi > 10 phút, mỗi 1 s khi < 10 phút. Khi chạm `cutoffAt` → gọi lại `/api/oven` ngay.
- **Trợ năng:** chuỗi đếm ngược không đặt trong `aria-live` (tránh đọc mỗi giây); chỉ thông báo `aria-live="polite"` khi `kind` đổi (VD chuyển sang `closing_soon`).
- **Chip giờ:** chạm → chọn mẻ cho đơn (lưu trong cart store), hiệu ứng scale 0.97 + rung nhẹ `navigator.vibrate?.(8)` trên Android, toast "Đã chọn nhận lúc 18:00". Mặc định chọn mẻ sớm nhất còn suất. Chip `few/last` có 🔥 và viền `--accent`. Hàng chip cuộn ngang với `scroll-snap`.
- **Chấm xanh "live":** 8 px, `box-shadow` nhịp thở 2 s; tắt animation khi reduced-motion.

### 9.4 Khu vực 2 — Bento Menu "Ít mà Chất"

- 6 ô tối đa. Thứ tự & kích thước do `products.sort` + `kind` quyết định: Combo (hero) → 2 pizza → 2 BBQ → ô add-on.
- **Ô món:** ảnh full-bleed (`next/image`, `sizes` chính xác, ô hero `preload`), lớp phủ gradient đen 0→70% ở đáy, tên (600, 17 px), mô tả ngắn (13 px, `--secondary`), giá, nút "+" tròn 44 px góc phải dưới. Huy hiệu nhỏ "Kèm gừng hồng" trên món chính.
- **Trạng thái ô:** `is_available = false` hoặc mẻ đang chọn không còn chỗ cho món đó → ảnh grayscale 60%, nhãn "Hết mẻ 18:00 · Xem mẻ khác" (vẫn bấm được để mở sheet và đổi mẻ). Món đã có trong giỏ → huy hiệu số lượng trên nút "+".
- **Tương tác:** chạm cả ô = mở Item Sheet; chạm "+" ở món đơn giản (không combo, không lựa chọn bắt buộc) = thêm nhanh 1 vào giỏ + toast "Đã thêm · Hoàn tác". Hover desktop: ảnh zoom 1.04 (easing hiện có).

### 9.5 Item Sheet (Bottom Sheet chi tiết món)

```
            ━━━━━  (tay nắm)
┌──────────────────────────────────────────┐
│ [ảnh 16:10, bo 24]                        │
│ Pan Pizza Pepperoni             159.000đ  │
│ Đế pan giòn, viền phô mai cháy caramel,   │
│ pepperoni cuộn mép.                       │
│ ✓ Kèm 1 phần Gừng hồng muối chống ngấy    │  ◀ ghi chú bắt buộc của brief
│                                           │
│ (chỉ Combo) Chọn pizza  ◉ Pepperoni ○ Bơ tỏi │
│             Chọn BBQ    ◉ Sườn      ○ BBQ #2 │
│                                           │
│ THÊM CHO NGON                             │
│ ☐ Hũ Sốt Bơ Tỏi chấm viền bánh  +10.000đ  │
│ ☐ Hũ Sốt BBQ khói               +10.000đ  │
│ ☐ Chai Cà phê ủ lạnh Rêu        +18.000đ  │
│                                           │
│ 🕕 Nhận lúc 18:00 · tối nay        Đổi ›  │  ◀ mở danh sách chip ngay trong sheet
│ Số lượng                       [−  1  +]  │
├──────────────────────────────────────────┤
│ [      Thêm vào đơn · 159.000đ       ]    │  ◀ footer dính, có safe-area
└──────────────────────────────────────────┘
```

- Mở ở ~88% chiều cao; nội dung cuộn bên trong với `overscroll-behavior: contain`.
- Add-on là **dòng riêng** trong giỏ (gắn `parentKey` để hiển thị thụt lề dưới món cha).
- Nếu mẻ đang chọn không đủ chỗ cho món: dòng giờ chuyển đỏ "Mẻ 18:00 hết khay pizza" + tự gợi ý mẻ gần nhất còn chỗ ("Chọn 19:00?").
- Số lượng tối đa = `min(maxQtyPerLine, availability.maxQty)`.
- Giá trên nút cập nhật theo số lượng + add-on (tween số 150 ms).

### 9.6 Cart Bar nổi

- Xuất hiện (trượt từ dưới, 280 ms) khi giỏ ≥ 1 món; cố định `bottom: calc(12px + env(safe-area-inset-bottom))`, rộng `min(100% − 32px, 480px)`, nền trắng `--text` chữ đen `--bg` (đảo màu kiểu Apple Pay, nổi trên nền tối). Màu `--accent` để dành riêng cho nút cuối "Đặt lò".
- Nội dung: "2 món · Nhận 18:00" | "348.000đ" | "Đặt ngay ›". Chạm → `?buoc=chot-don` mở Checkout Sheet.
- Khi số liệu đổi: hiệu ứng "nảy" 1 lần (scale 1.03).

### 9.7 Khu vực 3 — One-Step Checkout (Sheet "Chốt đơn")

```
            ━━━━━
┌──────────────────────────────────────────┐
│ Chốt đơn                          Đóng ✕ │
│ 1× Combo Đôi (Pepperoni + Sườn) 289.000  │ [−1+]
│    + Hũ Sốt Bơ Tỏi               10.000  │
│ 1× Pan Pizza Bơ tỏi             149.000  │ [−1+]
│ Gợi ý: [+ Cold brew Rêu 18k] [+ Sốt BBQ] │
├──────────────────────────────────────────┤
│ NHẬN LÚC   Tối nay ▾                      │
│ [17:00·3] [18:00·2🔥] [19:00·Kín lò]      │
├──────────────────────────────────────────┤
│ Số điện thoại                             │
│ [ 0912 345 678                      ✓ ]   │  ◀ inputMode="numeric", autocomplete="tel"
│ 👋 Mừng Tuấn quay lại! Giao tới Khu phố 2?│
│ [Dùng địa chỉ này]  [Nhập địa chỉ khác]   │
│ Tên        [ Tuấn                     ]   │
│                                           │
│ CÁCH NHẬN                                 │
│ ┌──────────────────┐┌──────────────────┐  │
│ │🛵 Giao tận nhà   ││☕ Ghé Rêu lấy     │  │
│ │ +10.000–15.000đ  ││ Free ship        │  │
│ │                  ││ + Tặng Sốt Bơ Tỏi│  │
│ └──────────────────┘└──────────────────┘  │
│ Thôn/Khu phố [ Khu phố 2 — 10.000đ    ▾]  │  ◀ <select> gốc của OS
│ Mô tả nhà    [ Nhà mái tôn xanh, cạnh   ] │
│              [ tạp hoá Cô Ba…           ] │
│ 📍 Ghim vị trí hiện tại (giúp shipper)     │
│                                           │
│ THANH TOÁN  ◉ Tiền mặt khi nhận           │
│             ○ Chuyển khoản (mã QR)        │
│ + Ghi chú cho bếp                          │
│ ☐ Ghi nhớ thông tin cho lần sau           │
├──────────────────────────────────────────┤
│ Tạm tính 448.000 · Ship 10.000            │
│ [  Đặt lò 18:00 · 458.000đ  ]             │  ◀ CTA màu --accent
│ Đặt hàng là đồng ý Chính sách · Huỷ miễn  │
│ phí trước 15:30                            │
└──────────────────────────────────────────┘
```

**Hành vi chi tiết**

- **Thứ tự trường cố ý:** SĐT trước (để tự điền) → Tên → Cách nhận → Khu vực + Mô tả nhà (ẩn mượt khi chọn "Ghé Rêu lấy") → Thanh toán.
- **SĐT:** tự định dạng nhóm `0912 345 678` khi gõ; chấp nhận dán `+84…`. Đủ 10 số hợp lệ → spinner nhỏ → kết quả `lookupCustomer` (§7.7). Bàn phím số. Lỗi hiển thị khi blur, không phải khi đang gõ.
- **Khu vực:** `<select>` gốc (thân thiện mobile, có sẵn a11y), mỗi option ghi phí. Lần đầu mở sheet, nếu có cookie "ghi nhớ" → chọn sẵn.
- **Mô tả nhà:** placeholder hướng dẫn mốc nhận diện (màu nhà, cạnh tiệm gì, đối diện gì). Tối thiểu 8 ký tự.
- **Ghim vị trí:** `navigator.geolocation.getCurrentPosition` (timeout 8 s, `enableHighAccuracy`); thành công → "Đã ghim · sai số ~15 m · Bỏ ghim". Thất bại → im lặng, không chặn đơn.
- **Cách nhận:** 2 thẻ lớn dạng segmented. Chọn "Ghé Rêu lấy" → dòng quà "🎁 Hũ Sốt Bơ Tỏi — Tặng" xuất hiện trong tóm tắt, phí ship = 0.
- **Thanh toán:** "Chuyển khoản" → sau khi đặt hiển thị VietQR. Nếu `requiresPrepay` → chỉ còn "Chuyển khoản", kèm câu "Đơn này cần chuyển khoản trước để giữ suất".
- **Bàn phím ảo iOS/Android:** lắng nghe `visualViewport.resize` → cập nhật biến CSS `--kb` để footer CTA nằm trên bàn phím và trường đang focus luôn hiển thị (`scrollIntoView({block:'center'})`).
- **Gửi đơn:** nút có 3 trạng thái (bình thường → "Đang giữ suất…" + spinner → thành công). Tạo `idempotencyKey` (UUID) khi mở sheet, giữ nguyên khi bấm lại. Chống bấm đúp.
- **Lỗi:**
  - `invalid` → lỗi dưới từng trường, cuộn tới lỗi đầu tiên, rung 2 nhịp.
  - `slot_full`/`cutoff_passed` → banner trong sheet: "Mẻ 18:00 vừa kín lò 😢 · [19:00 còn 2 suất] [T7 18:00]" — chạm 1 lần để chuyển và đặt lại.
  - `unavailable` → đánh dấu món hết, gợi ý thay thế.
  - `server_error`/mất mạng → "Chưa gửi được đơn. [Thử lại] hoặc [Gọi quán] [Nhắn Zalo]" — nút Zalo sao chép sẵn nội dung đơn vào clipboard.
- **Lưu nháp:** giỏ + thông tin checkout lưu `localStorage` (`th_cart_v1`, try/catch, hết hạn khi ngày phục vụ đã qua) — khách thoát ra vào lại không mất.

### 9.8 Thành công & theo dõi đơn

Sheet chuyển sang màn thành công (cùng sheet, không chuyển trang):

```
               ✓  (vẽ nét 400 ms)
     Đơn #12 đã giữ chỗ ở mẻ 18:00
 Bếp đút lò 17:40 · Giao tới Khu phố 2 khoảng 18:00–18:20
 ┌──────────────────────────────┐
 │  [VietQR]  458.000đ           │   ◀ chỉ khi chuyển khoản
 │  Nội dung: TH061112           │
 │  [Lưu mã QR]  [Sao chép STK]  │
 └──────────────────────────────┘
 [ Theo dõi đơn ]   [ Nhắn Zalo cho quán ]
 Huỷ miễn phí trước 15:30 hôm nay.
```

- `/o/[token]`: dòng thời gian trạng thái (§7.5), chi tiết đơn, thời gian dự kiến, nút gọi/Zalo, nút **Huỷ đơn** (đến giờ chốt), VietQR nếu chưa trả, và sau khi hoàn tất: "Đặt lại đơn này" + "Đánh giá trên Google".
- Giỏ được xoá sau khi đặt thành công (bằng action của reducer, **không** dùng `useEffect` + `setState`).

### 9.9 Bottom Sheet primitive (`components/ui/sheet.tsx`)

- Nền tảng: phần tử **`<dialog>`** + `showModal()` → có sẵn focus trap, `Esc`, nền `inert`. `::backdrop` đen 50% + blur 4 px.
- Mở: `transform: translateY(100%) → 0`, 420 ms `--ease-sheet`; đóng 280 ms. Reduced-motion → fade 120 ms.
- **Kéo để đóng:** Pointer Events trên tay nắm & phần header; kéo xuống > 120 px hoặc vận tốc > 0,5 px/ms → đóng; ngược lại bật về. Không kéo khi nội dung bên trong đang cuộn chưa ở đỉnh.
- **Đồng bộ URL:** mở sheet = `history.pushState` (qua router) với query tương ứng; nút Back đóng sheet. Đóng bằng tay = `history.back()` nếu sheet được mở bằng push trong phiên này, ngược lại `replace`.
- Khoá cuộn nền: `html { overflow: hidden }` khi mở; trả focus về phần tử đã mở sheet khi đóng.
- Props: `open`, `onOpenChange`, `title` (gắn `aria-labelledby`), `snap: "auto" | "tall" | "full"`, `footer` (slot dính đáy).

### 9.10 Microcopy & giọng văn

- Ấm, ngắn, địa phương; xưng "bạn" trong UI chung. **Không** đoán giới tính khách ("anh/chị") khi chào theo tên — dùng "Mừng Tuấn quay lại!".
- Động từ thương hiệu: "Đặt lò", "Ra lò", "Mẻ", "Chốt sổ".
- Con số luôn cụ thể: "Còn 1 suất", "còn 18 phút", "khoảng 18:00–18:20".
- Lỗi không đổ lỗi cho khách: "Số này có vẻ thiếu 1 chữ số" thay cho "SĐT không hợp lệ".
- Toàn bộ chuỗi nằm trong `data/copy.ts`.

### 9.11 Trợ năng (WCAG 2.2 AA)

Tương phản ≥ 4.5:1 (đã kiểm tra `--secondary` trên `--bg`); mọi ảnh có `alt` mô tả món; sheet có `aria-labelledby`; chip giờ là `role="radio"` trong `role="radiogroup"`; stepper có nhãn "Giảm/Tăng số lượng Pepperoni"; trạng thái gửi đơn qua `aria-live`; kiểm tra phóng to 200% và VoiceOver/TalkBack cho luồng đặt món; `@axe-core/playwright` 0 lỗi nghiêm trọng.

---

## 10. Khu vực 4 — Kitchen Dashboard `/admin/kitchen`

### 10.1 Nguyên tắc

- **Dùng trên điện thoại trong bếp** (tay dính bột): chữ lớn, nút ≥ 56 px, tương phản cao, thao tác hàng loạt.
- **Một màn hình, 5 tab** (tab bar dưới đáy trên mobile, sidebar trên tablet ngang): **Chuẩn bị · Mẻ nướng · Đơn · Giao · Cài đặt**. Bộ chọn ngày ở header (mặc định hôm nay).
- **Giữ màn hình sáng:** Screen Wake Lock API (nút "Chế độ bếp"), tự xin lại khi tab hiển thị trở lại.
- **Tự làm mới:** `router.refresh()` mỗi 20 s khi tab hiển thị; có đơn mới → toast + âm "ding" (mở khoá âm thanh sau lần chạm đầu) + huy hiệu trên tab Đơn.
- Hiển thị "Cập nhật 12 giây trước"; mất mạng → banner "Đang ngoại tuyến — số liệu có thể cũ".

### 10.2 Tab "Chuẩn bị" — Bảng Tổng Hợp Chuẩn Bị (Batch Prep Calculator)

```
┌ THE HEAT · BẾP ──────────── Thứ Sáu 06/11 ▾ ┐
│ 🔒 ĐÃ CHỐT SỔ 15:30 · 12 đơn đặt trước       │  ◀ trước giờ chốt: "⏳ TẠM TÍNH · còn 1g05p"
│ TỔNG HỢP NƯỚNG TỐI NAY                        │
│ 9 Pizza · 6 BBQ                                │
├───────────────────────────────────────────────┤
│ LẤY RA TỦ (chạm để đánh dấu đã lấy)           │
│ ☐ Đế Pan Pizza ................ 9 đế          │
│     5 Pepperoni · 4 Phô mai Bơ tỏi            │
│ ☐ Túi Sườn sous-vide .......... 6 túi (≈3,0kg)│
│ ☐ Mozzarella .................. 1.620 g       │
│ ☐ Pepperoni lát ............... 300 g         │
│ ☐ Hũ Sốt Bơ Tỏi ............... 7 hũ          │
│     4 bán · 3 tặng                             │
│ ☐ Hũ Sốt BBQ khói ............. 3 hũ          │
│ ☐ Gừng hồng muối .............. 15 phần       │
│ ☐ Hộp pizza / Khay BBQ ........ 9 / 6         │
│ ☐ Cold brew Rêu (tủ quầy) ..... 4 chai        │
├───────────────────────────────────────────────┤
│ CHIA THEO CA NƯỚNG                             │
│ ▸ Mẻ 16:40 → Giao 17:00 · 3 Pizza + 2 BBQ     │
│   🛵 Tuyến Khu phố 2: Tuấn · Lan · Huy         │
│ ▸ Mẻ 17:40 → Giao 18:00 · 4 Pizza + 3 BBQ     │
│   🛵 Tuyến Quốc lộ / Thị trấn: Minh · Hoa ·   │
│      Phúc · Vy · Ngọc                          │
│   ☕ Rêu: Khánh                                │
│ ▸ Mẻ 18:40 → Giao 19:00 · 2 Pizza + 1 BBQ     │
│   🛵 Tuyến Khu phố 2: Trang                    │
│   ☕ Rêu: Dũng · Bảo                           │
├───────────────────────────────────────────────┤
│ ⚠ 2 đơn chuyển khoản chưa nhận tiền (#5, #9)  │
│ ⚠ #7 ghi chú: "Ít cay, dị ứng đậu phộng"       │
├───────────────────────────────────────────────┤
│ [🖨 In bảng]  [📤 Gửi Telegram]  [📋 Copy]      │
└───────────────────────────────────────────────┘
```

> Ghi chú cho chủ quán: ví dụ trong brief có 9 pizza tổng nhưng chỉ liệt kê 2 mẻ (3 + 4 = 7). Hệ thống luôn đảm bảo **tổng = Σ các mẻ**; ví dụ trên có thêm mẻ 18:40 để khớp số. Bộ dữ liệu đầy đủ ở Phụ lục B.

- Tick "đã lấy" lưu `localStorage` theo ngày (tiện ích cá nhân, không cần DB).
- Nhấn vào một mẻ → nhảy sang tab Mẻ nướng tại mẻ đó.
- Telegram tự động gửi bảng này **một lần** sau giờ chốt muộn nhất của ngày (cron, idempotent bằng `summary_sent_at`).

### 10.3 Tab "Mẻ nướng"

Thẻ cho từng mẻ, sắp theo giờ, có đếm ngược tới `ovenAt` ("Đút lò sau 12 phút"); liệt kê từng đơn (số thứ tự lớn, món, add-on, ghi chú nổi bật). Nút hàng loạt: **[Đút lò]** (confirmed → baking), **[Ra lò]** (baking → ready). Đơn còn `placed` hiển thị viền cam + nút "Gọi xác nhận" (`tel:`).

### 10.4 Tab "Đơn"

Danh sách đơn của ngày; lọc theo trạng thái/mẻ/thanh toán; tìm theo SĐT/tên/mã. Chạm → sheet chi tiết: gọi (`tel:`), Zalo (`https://zalo.me/<sđt>`), copy địa chỉ, mở Google Maps (`https://www.google.com/maps/search/?api=1&query=<lat>,<lng>`), đánh dấu đã trả tiền, đổi mẻ (kiểm tra suất), huỷ (lý do), sửa ghi chú, xem lịch sử `order_events`. Nút nổi **"+ Thêm đơn nhanh"** cho đơn gọi điện/Zalo/khách tại Rêu (`createQuickOrder`, chọn `channel`).

### 10.5 Tab "Giao"

Theo từng mẻ → từng tuyến: danh sách điểm giao (thứ tự kéo-thả), tổng tiền cần thu (COD) của tuyến, nút:
- **"Copy gửi shipper"** — văn bản định dạng sẵn để dán vào Zalo:
  ```
  🛵 MẺ 17:00 · TUYẾN KHU PHỐ 2 · 3 điểm · Thu 616.000đ
  1) #01 Tuấn 0912 345 678 — Nhà mái tôn xanh cạnh tạp hoá Cô Ba — THU 317.000đ
     📍 https://www.google.com/maps/search/?api=1&query=15.7412,108.3615
  2) #02 Lan … — ĐÃ CK
  3) #03 Huy … — THU 299.000đ
  ```
- **"Bắt đầu giao tuyến"** → các đơn chuyển `delivering`.
- **Danh sách khách lấy tại quầy Rêu** (đơn nhận tại chỗ của mẻ: số thứ tự, tên, tiền cần thu) — có nút Copy/In cho nhân viên quầy café. Link Google Maps của tuyến lấy Rêu làm điểm xuất phát.

### 10.6 Tab "Cài đặt" (chỉ `owner`)

Tạm ngưng/mở lại hôm nay (kèm lời nhắn) · Đóng một ngày · Sức chứa từng mẻ (không cho thấp hơn đã dùng) · Bật/tắt "Hết hôm nay" cho từng món · Mẫu khung giờ theo thứ trong tuần · Khu vực & phí ship · Nhân viên & PIN · **"Tạo bài đăng"**: sinh sẵn nội dung đăng Facebook/Zalo từ số suất thật ("🔥 Tối nay còn 4 suất mẻ 19:00 — đặt tại theheatpizza.vn/?src=fb-post") — xem `MARKETING.md`.

### 10.7 Bản in `/admin/kitchen/in`

CSS `@media print` cho A5 và giấy nhiệt 80 mm (`@page { size: 80mm auto; margin: 4mm }`), chữ đen trên trắng, chỉ gồm Bảng Tổng Hợp + danh sách theo mẻ. Giai đoạn 2: nhãn dán hộp (mã đơn, tên, mẻ, món) khổ 50×30 mm.

### 10.8 Đăng nhập & phân quyền

`/admin/login`: chọn tên nhân viên → nhập PIN 6 số (bàn phím số lớn). Phiên JWT 30 ngày, httpOnly, Secure, `SameSite=Lax`. `proxy.ts` chỉ kiểm tra *lạc quan* (có cookie hay không) để redirect; **kiểm tra thật** ở `requireStaff(role?)` trong DAL, gọi trong mọi page/action admin.

| Quyền | owner | kitchen | shipper |
|---|---|---|---|
| Xem Chuẩn bị/Mẻ/Đơn/Giao | ✅ | ✅ | Giao (tuyến được giao) |
| Đổi trạng thái đơn | ✅ | ✅ (đến `ready`) | `delivering`→`completed`/`no_show` |
| Đánh dấu đã trả tiền, huỷ sau khi nướng | ✅ | ❌ | ❌ |
| Cài đặt | ✅ | ❌ | ❌ |

Từ M7 nhân viên có thể kiêm nhiều vai trò và có thêm `manager · server · barista` — bảng quyền vận hành ở §17.2. `manager` có quyền dashboard bếp như `kitchen`.

---

## 11. Thanh toán & thông báo

### 11.1 VietQR (M6)

- Ảnh QR: `https://img.vietqr.io/image/${BANK_BIN}-${ACCOUNT_NO}-compact2.png?amount=${total}&addInfo=${memo}&accountName=${encodeURIComponent(ACCOUNT_NAME)}` — `memo` dạng `TH061112` (ASCII, không dấu cách).
- Hiển thị: ảnh QR + số tiền + nội dung + nút "Lưu mã QR" (tải ảnh) + "Sao chép số tài khoản" + "Sao chép nội dung".
- Kiểm tra lại tài liệu VietQR trước khi code (tham số template có thể đổi).

### 11.2 SePay webhook (M6)

- Chủ quán đăng ký SePay, liên kết tài khoản nhận, cấu hình webhook tới `/api/webhooks/sepay` kèm API key.
- Xử lý: xác thực header → lưu `payments` (idempotent theo `provider_txn_id`) → tìm mã đơn trong nội dung → nếu `amount ≥ order.total` → `payment_status = paid`, ghi event, nếu `placed` thì chuyển `confirmed` → Telegram "💰 #12 đã chuyển khoản 458.000đ". Không khớp → lưu `order_id = null` và cảnh báo Telegram để chủ quán khớp tay. **Từ M7:** khoản không có mẫu mã đơn = doanh thu café, không cảnh báo (§17.9).
- **Agent phải đọc tài liệu SePay hiện hành** để lấy đúng tên trường payload và cách xác thực; không đoán.

### 11.3 Telegram (M4)

| Sự kiện | Nội dung |
|---|---|
| Đơn mới | "🆕 #12 · Mẻ 18:00 · Tuấn 0912 345 678 · KP2 · 1 Combo + 1 Pizza Bơ tỏi · 458k · COD" + link mở đơn trong dashboard |
| Đơn cần xác nhận | thêm dòng "⚠ Khách mới — gọi xác nhận" |
| Huỷ đơn | "❌ #12 huỷ bởi khách · trả 2 suất mẻ 18:00" |
| Thanh toán | "💰 …" |
| Sắp kín lò | "🔥 Mẻ 18:00 còn 1 suất" (một lần/mẻ) |
| Sau giờ chốt | Bảng Tổng Hợp dạng text (giống §10.2) |
| Lỗi server | từ `instrumentation.ts` `onRequestError` (giới hạn 1 tin/phút) |

Gửi trong `after()` để không làm chậm phản hồi cho khách; lỗi gửi Telegram không được làm hỏng đơn.

### 11.4 Thông báo cho khách

- **M1–M6:** màn hình thành công + trang `/o/[token]` + nút "Nhắn Zalo cho quán".
- **Giai đoạn 2:** Zalo OA + ZNS (cần OA doanh nghiệp đã xác thực, mẫu tin được duyệt, có phí mỗi tin) cho "Đã xác nhận", "Bánh ra lò", "Shipper đang tới".

---

## 12. Bảo mật, quyền riêng tư & pháp lý

**Bảo mật ứng dụng**
- Mọi Server Action: zod + kiểm tra quyền + không tin dữ liệu client (theo `02-guides/data-security.md`). Dùng `import 'server-only'` cho `lib/server/*`.
- Rate-limit bảng Postgres: `lookup`, `order`, `login`, `cancel`. Honeypot + thời gian điền tối thiểu. Cloudflare Turnstile chỉ thêm khi thấy lạm dụng.
- Cookie: httpOnly, Secure, `SameSite=Lax`. Header bảo mật trong `next.config.ts` (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy: geolocation=(self)`), CSP cơ bản theo `02-guides/content-security-policy.md`.
- **Supabase:** bật **RLS cho mọi bảng và không tạo policy nào** → Data API công khai của Supabase (dùng anon key) không đọc/ghi được gì; app kết nối Postgres trực tiếp bằng role chủ bảng nên không bị ảnh hưởng. Không đưa `anon`/`service_role` key vào code client. Mật khẩu DB chỉ nằm trong biến môi trường (Vercel/`.env.local`), không bao giờ commit hay dán vào chat.
- `/admin/*`, `/o/*`: `noindex` + `disallow` trong `robots.ts`.
- Token theo dõi đơn ngẫu nhiên 128-bit; mã đơn ngắn (`TH-0611-12`) **không** đủ để xem đơn.

**Quyền riêng tư (Nghị định 13/2023/NĐ-CP & Luật Bảo vệ dữ liệu cá nhân hiệu lực từ 01/01/2026)**
- Thu thập tối thiểu: SĐT, tên gọi, khu vực, mô tả nhà, (tuỳ chọn) toạ độ.
- Trang `/chinh-sach`: mục đích, thời gian lưu (đề xuất: địa chỉ của khách không bật "ghi nhớ" được xoá/ẩn danh sau 90 ngày), quyền xoá dữ liệu (liên hệ hotline/Zalo).
- "Ghi nhớ thông tin" và "nhận tin khuyến mãi" là **hai lựa chọn riêng**, mặc định tắt.
- Tra SĐT không trả dữ liệu nhạy cảm (§7.7).
- Nên tham vấn chuyên môn pháp lý trước khi ra mắt chính thức.

**Thương mại điện tử**
- Website bán hàng phải **thông báo với Bộ Công Thương** (online.gov.vn) theo NĐ 52/2013/NĐ-CP (sửa đổi bởi NĐ 85/2021/NĐ-CP) → gắn logo "Đã thông báo" ở footer khi được duyệt.
- Footer hiển thị: tên hộ kinh doanh/doanh nghiệp, số ĐKKD/MST, địa chỉ, hotline, email.
- Giá hiển thị là giá cuối cùng khách trả (đã gồm ship khi chọn khu vực).

---

## 13. Hiệu năng, SEO, PWA, giám sát

### 13.1 Ngân sách hiệu năng (đo trên Android tầm trung, Lighthouse mobile throttling)

| Chỉ số | Mục tiêu |
|---|---|
| LCP (ảnh ô Combo) | ≤ 2,0 s |
| INP | ≤ 150 ms |
| CLS | ≤ 0,05 (skeleton Oven Bar cùng chiều cao) |
| JS tải lần đầu trang `/` | ≤ 180 KB gzip (✅ chốt 31/10/2026; gồm framework ≈ 139 KB) |

> ✅ **Chủ quán chốt (31/10/2026):** tổng JS trang `/` ≤ **180 KB gzip** cho trình duyệt hiện đại (không tính polyfill `noModule`). Lý do: riêng runtime Next 16.3 + React 19.2 đã ≈ 139 KB nên mục tiêu cũ 110 KB không khả thi. Sau M3 đo được ≈ 170 KB (app ≈ 31 KB) — phần app nên giữ ≤ 40 KB.

| Tổng ảnh màn hình đầu | ≤ 350 KB (AVIF/WebP qua `next/image`, `images.formats: ['image/avif','image/webp']`) |

Kỹ thuật: Server Components mặc định; chỉ các phần tương tác là client; React Compiler; font chỉ subset `latin` + `vietnamese`; ảnh ô hero `preload`, các ảnh khác lazy; không nhúng bản đồ iframe (dùng link Google Maps).

### 13.2 SEO & chia sẻ

- `metadataBase: https://theheatpizza.vn`; title "THE HEAT PIZZA — Pan pizza kiểu Mỹ & BBQ sous-vide · Thăng Bình".
- JSON-LD `Restaurant` (tên, địa chỉ, `areaServed`, `servesCuisine`, `hasMenu` lấy từ catalog, `potentialAction: OrderAction`), cập nhật `json-ld.tsx`.
- `/m/[slug]` có `opengraph-image.tsx` riêng (ảnh món + giá + "Đặt lò tại theheatpizza.vn") → chia sẻ Facebook/Zalo đẹp.
- `sitemap.ts`: `/`, `/m/*`, `/chinh-sach`.
- Liên kết Google Business Profile ↔ website (xem `MARKETING.md`).

### 13.3 PWA

`app/manifest.ts` (tên, icon 192/512, `display: standalone`, `theme_color: #000000`, `start_url: /?src=pwa`) để khách quen và bếp "Thêm vào màn hình chính". Service worker/Web Push để giai đoạn 2 (Telegram đã đủ cho bếp).

### 13.4 Giám sát & vận hành

- `instrumentation.ts` → `onRequestError` gửi Telegram (giới hạn tần suất).
- Log có cấu trúc (JSON) cho `placeOrder` (không log SĐT đầy đủ — che 4 số giữa).
- Analytics sự kiện: `view_item`, `add_to_cart`, `begin_checkout`, `lookup_known`, `place_order`, `slot_full`, `cancel_order` (kèm `src`).
- Sao lưu DB: dùng PITR của nhà cung cấp hoặc `pg_dump` hằng ngày (GitHub Action/cron VPS) vào kho riêng tư.

---

## 14. Chiến lược kiểm thử

| Tầng | Công cụ | Phạm vi bắt buộc |
|---|---|---|
| Unit (thuần) | Vitest | `time` (offset +07:00, qua nửa đêm UTC, nhãn ngày) · `oven-status` (mọi `kind`, biên đúng giây `cutoffAt`, `bbq_only`) · `capacity` (combo tiêu 2 tài nguyên) · `pricing` (quà khi pickup, phí theo khu vực, freeship) · `order-status` (bảng chuyển trạng thái) · `prep` (**khớp chính xác Phụ lục B** + bất biến tổng = Σ mẻ) · `phone` |
| Integration | Vitest + Postgres thật (Docker service trong CI) | `placeOrder`: idempotency, giữ suất; **đua tranh**: 10 request song song vào mẻ còn 3 suất → đúng 3 thành công; huỷ trả suất đúng một lần |
| E2E | Playwright (iPhone 13, Pixel 7, Desktop Chrome) | Đặt combo + add-on + giao tận nhà; nhận tại Rêu có quà; mẻ kín → chuyển mẻ gợi ý; khách cũ (cookie) tự điền; Back của Android đóng sheet; admin đăng nhập → số liệu Bảng Chuẩn Bị đúng; axe 0 lỗi nghiêm trọng |
| CI | GitHub Actions | `npm ci` → `eslint` → `next typegen && tsc --noEmit` → unit → integration → `next build` → e2e (trên build) |

Đồng hồ trong test: luôn truyền `now` vào hàm domain; server lấy giờ qua `serverNow()` (`lib/server/clock.ts`). `TEST_NOW` (ISO có offset) cố định mốc giờ — chỉ được nhận khi không phải production **hoặc** `E2E=1` (Playwright đặt cả hai cho `next start`; `db:seed` dùng cùng `TEST_NOW` để có mẻ quanh mốc đó). Mặc định e2e: Thứ Sáu 06/11/2026 10:00 giờ VN.

---

## 15. Lộ trình triển khai (Milestones cho Agent)

Mỗi milestone là một PR (hoặc chuỗi PR nhỏ) có thể review độc lập.

### M0 — Dọn nền (≈ 1 ngày) ✅
- Xoá: fries/gallery/visit/hero carousel/giỏ giao hàng cũ, `LanguageProvider`, `LanguageToggle`, `ThemeToggle`, script `themeInit`, ảnh không dùng (§2.3).
- **Giữ** café, KOLD Gelato, đặt bàn → chuyển sang `/tai-quan` (Server Components, chỉ tiếng Việt). Action đặt bàn dùng zod + `lib/domain/phone.ts` + `lib/domain/time.ts` (sửa lỗi lệch múi giờ §2.3).
- `data/copy.ts` (vi), `data/site.ts` mới (THE HEAT PIZZA, hotline, Zalo, Rêu, thông tin pháp lý placeholder).
- `globals.css`: chỉ dark + token mới (§9.1). `layout.tsx`: `metadataBase` mới, `viewport-fit=cover`.
- `next.config.ts`: `cacheComponents: true`, `reactCompiler: true`, `images.formats`, security headers.
- Thêm phụ thuộc: `zod`, `drizzle-orm`, `postgres`, `jose`, `@node-rs/argon2`, `server-only`; dev: `drizzle-kit`, `babel-plugin-react-compiler` (bắt buộc cho `reactCompiler: true`), `vitest`, `@playwright/test`, `@axe-core/playwright`.
- Scripts: `test`, `test:e2e`, `db:generate`, `db:migrate`, `db:seed`, `typecheck`. `.env.example`. Workflow CI.
- Ghi chú triển khai: `@playwright/test` ghim `1.63.0` (+ `overrides.playwright-core`) để khớp trình duyệt; e2e chạy cả 3 thiết bị trên Chromium. `@types/node` ^22 (Vitest 5 yêu cầu). `postgres` dùng nhánh 3.x (4.0 vừa ra, chờ ổn định).
- **Chấp nhận:** trang `/` hiển thị placeholder tối; lint/typecheck/CI xanh.

### M1 — Domain lõi thuần + test (≈ 1–2 ngày) ✅
- `lib/domain/*` theo §7 + test; Phụ lục B làm fixture.
- **Chấp nhận:** coverage `lib/domain` ≥ 95%; test Prep khớp từng con số của §10.2.

### M2 — DB & DAL (≈ 1–2 ngày) ✅
- Chủ quán tạo dự án Supabase (region Singapore) và nhập `DATABASE_URL`/`DIRECT_URL` vào biến môi trường; Agent không cần mật khẩu trong chat.
- Schema Drizzle §6, migration (kèm bật RLS cho mọi bảng), seed Phụ lục A, `ensureBatches(from, days)` idempotent, DAL đọc catalog (`'use cache'` + tag) và lịch.
- **Chấp nhận:** `db:migrate && db:seed` trên DB trống chạy được; `getOvenStatus(now)` trả đúng với dữ liệu seed.
- Ghi chú triển khai: `ensureBatches` chỉ sinh mẻ cho ngày chưa có `service_days` → mẻ chủ quán sửa/xoá tay không bị tạo lại; ngày không có template không có bản ghi (= `day_off`). Seed chạy lại không ghi đè dữ liệu đã sửa. Mỗi DAL có hàm `load*(db)` thuần (test được) + bản `'use cache'` (`getCatalog`). Integration test: `npm run test:int` với `TEST_DATABASE_URL` (DB bị xoá sạch); CI dùng service `postgres:16`.

### M3 — Giao diện đặt món (≈ 3–4 ngày) ✅
- Sheet primitive (§9.9), Oven Bar (stream + poll), Brand strip, Bento Menu, Item Sheet, Cart store + Cart bar, Checkout Sheet (chưa nối server: dùng action giả), màn thành công, sheet "Vì sao đặt trước?".
- **Chấp nhận:** đạt ngân sách §13.1 ở bản build; luồng UI đầy đủ trên iPhone 13/Pixel 7 trong Playwright; Back đóng sheet; reduced-motion hoạt động.
- Ghi chú triển khai: `GET /api/oven` làm luôn ở M3 (cần cho poll). `placeOrder` giả kiểm tra thật (zod, catalog, giá, suất đang còn) nhưng **không ghi DB/không giữ suất**; production trả `server_error` (khách thấy "Gọi quán/Nhắn Zalo") trừ khi `E2E=1` → **không ra mắt trước M4**. Client không tải zod (kiểm tra nhẹ trong `lib/order-contract.ts`, cùng mã lỗi). Add-on chọn trong Item Sheet = 1 phần cho cả dòng (không nhân theo số bánh). Đo bản build: JS trang `/` ≈ 170 KB gzip (framework ≈ 139 + app ≈ 31), CLS 0,005 kể cả khi thu gọn Oven Bar. Chưa làm: `?ngay=` (tab ngày giữ trong giỏ), sheet "Vì sao đặt trước?" không gắn URL, link `/chinh-sach` (M6), tra khách cũ (M4).

### M4 — Đặt đơn thật (≈ 2 ngày) ✅
- `placeOrder`, `lookupCustomer` (+ cookie ghi nhớ), rate-limit, Telegram, `/o/[token]`, `cancelOrderByToken`, `/api/oven`.
- **Chấp nhận:** test đua tranh pass; đơn xuất hiện trong DB + Telegram trong ≤ 3 s; tra SĐT từ thiết bị lạ **không** lộ mô tả nhà.
- Ghi chú triển khai: nghiệp vụ nằm trong `lib/server/dal/orders.ts` (`placeOrderCore`, `cancelOrderByTokenCore`, `getOrderView`) để integration test gọi thẳng; Server Action chỉ parse/rate-limit/cookie/`after()`. Giữ suất dùng `now` của `serverNow()` (không dùng `now()` SQL) để e2e với `TEST_NOW` đúng; điều kiện thêm: ngày phục vụ `open` (ngày `paused` → `paused`). `savedAddressToken` trỏ tới **đơn giao gần nhất** của khách (không phụ thuộc "Ghi nhớ"); bảng `addresses` chỉ ghi khi khách bật "Ghi nhớ" và là nguồn tự điền khi có cookie `th_c`. Token & cookie ký HMAC-SHA256 (`node:crypto`, không cần `jose`). Trả trước: `requiresPrepay` trong `lib/domain/pricing.ts` — `risk_based` = từng bom hàng **hoặc** tổng ≥ `prepayOverTotal`; COD bị từ chối bằng `prepay_required` (VietQR ảnh để M6, hiện chỉ có nội dung CK). Telegram: "sắp kín lò" gửi khi đơn làm mẻ còn đúng 1 khay (tự nhiên một lần/mẻ); thiếu biến môi trường → bỏ qua. Huỷ hai lần = `ok` (không trả suất lần hai). `lookupCustomer` vượt rate-limit/lỗi → `{status:"new"}`; `self` cũng kèm `requiresPrepay`. E2E ghi DB thật → `workers: 1`, mỗi test dọn đơn/khách/rate-limit (`e2e/db.ts`). Sheet primitive đóng `<dialog>` khi trang bị ẩn trong `<Activity>` (chuyển route), nếu không nó chặn trang mới.

### M5 — Kitchen Dashboard (≈ 3 ngày) ✅
- Auth (login, `proxy.ts`, `requireStaff`), 5 tab §10, Thêm đơn nhanh, bản in, wake lock, cron `daily` (tạo mẻ + gửi bảng tổng hợp).
- **Chấp nhận:** với dữ liệu Phụ lục B, tab Chuẩn bị hiển thị đúng §10.2; thao tác hàng loạt đổi trạng thái đúng `canTransition`; shipper chỉ thấy tab Giao.
- Ghi chú triển khai: phiên = JWT HS256 (`jose`, cookie `th_s`, 30 ngày, đồng hồ thật — không theo `TEST_NOW`); `requireStaff()` đọc lại nhân viên trong DB mỗi request (khoá/đổi quyền có hiệu lực ngay). `proxy.ts` không đẩy `/admin/login` → dashboard khi có cookie (tránh vòng lặp với cookie hết hạn); trang login tự redirect nếu phiên hợp lệ. `admin/layout.tsx` **không** đọc phiên (login nằm dưới nó) — mỗi page gọi `requireStaff()` trong `<Suspense>`. Nhân viên & PIN: `npm run staff -- "Tên" owner|kitchen|shipper 123456` (argon2id); khoá = `is_active=false` trong Table Editor. Nghiệp vụ ở `lib/server/dal/admin.ts` (mutation) và `dal/kitchen.ts` (đọc ngày bếp + `runDaily`); văn bản Telegram/Copy/shipper/bài đăng ở `lib/kitchen-text.ts` (thuần, có test). `PrepWarning` thêm `seq`. Đơn nhanh dùng lại `placeOrderCore` với `staff` (kênh, actor, `overrideCutoff` chỉ owner — nhận cả mẻ `closed` sau giờ chốt, sức chứa vẫn giữ): xác nhận luôn, bỏ chặn/trả trước, không Telegram. Đổi mẻ chỉ trong cùng ngày, đơn chưa vào lò. `markPaid` ghi `payments` (`manual:<orderId>`) và tự xác nhận đơn `placed`. [Đút lò] chuyển batch → `baking` (đóng nhận đơn), [Ra lò] → `done`. Cron: `vercel.json` 08:45 UTC (15:45 VN); gửi bảng một lần nhờ `UPDATE … WHERE summary_sent_at IS NULL`, gửi lỗi thì nhả để lần sau thử lại; dọn `rate_limits` > 2 ngày. Cài đặt trong app: trạng thái ngày, sức chứa/đóng-mở mẻ, "Hết hôm nay", Tạo bài đăng; **chưa** làm trong app: mẫu khung giờ, khu vực/phí ship, nhân viên (Table Editor/script), kéo-thả thứ tự điểm giao, phân tuyến cho từng shipper (shipper thấy mọi tuyến). Bản in `?kho=80` cho giấy nhiệt.

### M6 — Thanh toán, SEO, PWA, hoàn thiện (≈ 2 ngày) ✅
- VietQR, webhook SePay, trả trước theo rủi ro, `/m/[slug]` + OG, JSON-LD, manifest, sitemap/robots, analytics + `?src=`, `/chinh-sach`, `instrumentation.ts`.
- **Chấp nhận:** chuyển khoản thử → đơn tự `paid` + Telegram; Lighthouse mobile ≥ 95 Performance/100 Accessibility/100 SEO.
- Ghi chú triển khai: thuần ở `lib/payments.ts` (link VietQR, zod payload SePay), env ở `lib/server/payments/vietqr.ts`, đối soát ở `lib/server/payments/sepay.ts` (`recordSepayCore`). `payments.provider_txn_id = "sepay:<id>"` (UNIQUE → SePay gửi lại/song song chỉ ghi một lần). Dò mã đơn trong `code + content + description`; **cộng mọi khoản SePay của đơn** ≥ `total` → `settlePaid` (dùng chung với [Đã trả]: `paid`, `payment_method = transfer`, tự xác nhận `placed`); thiếu → Telegram "chuyển thiếu"; đơn đã trả/đã huỷ → "kiểm tra hoàn tiền"; không khớp → `order_id null` + Telegram. Tiền ra (`out`) bỏ qua. Lỗi DB → 500 để SePay thử lại. Khối CK dùng chung `components/store/transfer-box.tsx` (màn thành công + `/o/[token]`): QR, STK, chủ TK, [Lưu mã QR] (mở ảnh — `download` không chạy với ảnh khác origin), [Sao chép STK], [Sao chép nội dung]. `/m/[slug]` = `StorePage` dùng chung với `/`, sheet đọc món từ đường dẫn (`productFromPath`), mở/đóng sheet trên `/m/*` đưa URL về `/`. OG từng món: font Be Vietnam Pro (OFL, `assets/og/`, lấy từ `@fontsource`). `?src=`: `proxy.ts` (matcher chỉ khi có query `src`) ghi cookie `th_src` 30 ngày (không httpOnly) → `orders.source`; analytics `@vercel/analytics` (chỉ render khi `VERCEL`), `beforeSend` che token `/o/<token>`. `instrumentation.ts` gửi Telegram ≤ 1 tin/phút/instance. Cron daily thêm: xoá `address_text/lat/lng` của đơn > 90 ngày (thời hạn ở `lib/privacy.ts`, trang `/chinh-sach` đọc cùng hằng số).

### M7 — Vận hành: nền, ca & két, chi phí, Telegram (≈ 4 ngày) ✅
- `staff.roles` (migration), phân công vai trò, khung `/admin/van-hanh`, `ops_events`. Ca: mở/đóng, đếm két & hộp chi theo mệnh giá (đếm mù), nhập doanh thu Sapo + ảnh, nộp tiền về chủ, nạp bù hộp chi. Chi phí trong app + `POST /api/webhooks/telegram` (`/chi`, `/chihuy`, `/tonghop`, ảnh trả lời, nút, liên kết tài khoản), tiền túi chờ duyệt/hoàn. ảnh trong `ops_files`.
- **Chấp nhận:** `cash.ts`, `money-text.ts`, `expense-command.ts` coverage ≥ 95% (gồm mọi dạng số tiền ở §17.4); int test: số đáng có của két (COD + café − nộp), bất biến hộp chi qua chi → kiểm → nạp bù, người duyệt ≠ người chi, webhook Telegram sai secret 401 / gửi lại `update_id` không ghi đôi / người lạ bị bỏ qua ; e2e: mở → đóng ca trên iPhone 13, axe 0 lỗi nghiêm trọng.

- Ghi chú triển khai: vai trò `staff.roles` (migration `0001_ops` chép `role` cũ sang, `0002` bỏ cột). Phiên `Staff = { roles, role, orderRoles }` — `role` = vai chính ở bếp (owner > kitchen/manager > shipper, null = chỉ vận hành → đăng nhập vào `/admin/van-hanh`); đổi trạng thái đơn dùng `canTransitionAs(orderRoles, …)` nên người kiêm bếp + giao làm được cả hai. `npm run staff -- "Tên" owner,barista 123456`. Logic thuần: `lib/domain/{roles,cash,money-text,expense-command}.ts`; văn bản `lib/ops-text.ts`; DAL `lib/server/dal/ops.ts`; bot `lib/server/ops/telegram-bot.ts`; action `app/actions/ops.ts`; UI `components/ops/*`, chuỗi `data/copy-ops.ts` (tách khỏi `copy.ts` để không vào JS trang `/`). Chi phí: chỉ owner/manager; danh sách & tổng tháng chỉ trả cho owner/manager (DTO). COD pizza đã thu trong ca = đơn `cod` có sự kiện chuyển `completed` trong khung giờ ca. Ảnh Sapo bắt buộc khi có doanh thu café. Cron: ngày 1 gửi tổng chi tháng trước (đánh dấu `ops_events` `expense_summary:<YYYY-MM>`), dọn `telegram_updates`. Bot: privacy mode bật; nút `c:/s:/x:/b:<id>`; tin xác nhận lưu `telegram_msg_id` để khớp ảnh trả lời. Chi ghi trong app cũng đăng vào nhóm vận hành kèm nút.

### M8 — Checklist & Sổ tay (≈ 2,5 ngày) ✅
- Mẫu + lượt checklist theo vai trò, giá trị đo có ngưỡng, ảnh; sổ tay Markdown (`marked`, chỉ server) theo vai trò, công thức pizza đọc `recipe_lines`.
- **Chấp nhận:** vai trò không được gắn mở trang sổ tay → không thấy nội dung (int test DTO); nhiệt độ ngoài ngưỡng → Telegram; e2e làm checklist mở ca.
- Ghi chú triển khai: migration `0003_checklist_handbook` (3 bảng, `handbook_pages.updated_by` ON DELETE SET NULL). Logic thuần `lib/domain/checklist.ts` (`canAccess`, `runDate` — lượt `weekly` gắn Thứ Hai, `outOfRange`, `progress` theo mẫu **hiện tại**, `markIssue`, `validItems`, `slugify`). DAL `lib/server/dal/checklist.ts` (`loadWorkView`, `markChecklistItemCore` — upsert lượt + `FOR UPDATE` nên nhiều người tick song song không mất mục; bỏ tick: người tick hoặc owner/manager), `lib/server/dal/handbook.ts` (`loadHandbookView` trả `page: null, missing: true` giống hệt trang không tồn tại; `body` Markdown chỉ cho người sửa; mỗi lượt mở ghi `ops_events` `handbook_view`). Tab `viec` · `so-tay` (`&trang=<slug>`): sổ tay là **Server Component** truyền vào dashboard client dưới dạng prop; in mờ tên người xem bằng SVG pattern. Số đo ngoài ngưỡng → `checklistAlertText` vào `TELEGRAM_CHAT_ID`. Đóng ca khi lượt `close` chưa xong → nút đổi thành "Vẫn đóng ca" (hỏi một lần). Seed mẫu ở `data/seed-ops.ts`; `seedStatic()` = phần dữ liệu tĩnh của `seed()` (không sinh ngày/mẻ).

### M9 — Chấm công, bảng công, lương (≈ 3 ngày) ✅
- Vào/ra ca, cờ `off_site`/`forgot_out`, lịch ca tuần, `worktime.ts`, bảng công (gửi → xác nhận bằng PIN → khoá, snapshot + hash), `pay_rates` có lịch sử + chặn dưới mức tối thiểu, `payslips`, cron ngày 1/3/5.
- **Chấp nhận:** `worktime.ts`/`payroll.ts` coverage ≥ 95% (ca qua nửa đêm, ngày lễ, ban đêm, đổi đơn giá giữa tháng); int test: **DTO cho `manager` không chứa trường tiền lương**, manager không tự xác nhận/duyệt bảng công của mình, bảng công đã khoá không sửa được.
- Ghi chú triển khai: migration `0004_payroll` (6 bảng: `time_entries` — partial unique một lượt mở/người; `shift_plans` UNIQUE người+ngày, `end > start`; `holidays` (`date` PK, hệ số 1–5); `pay_rates` UNIQUE người+`effective_from`; `timesheets` — `snapshot IS NULL` ⇔ `draft`; `payslips` — `paid` ⇔ `paid_at`). Logic thuần `lib/domain/worktime.ts` (phân loại từng **phút** — cắt giây; ngày công = ngày VN của giờ vào; lễ theo ngày dương lịch của chính phút đó; làm thêm = phút thứ 481+ của ngày công, ngày lễ không cộng làm thêm; đi muộn > 5′, `late_out` > 15′ so với lịch; quên ra ca = lượt mở từ trước mốc 03:00 gần nhất) và `lib/domain/payroll.ts` (đơn giá theo ngày công → đổi giá giữa tháng tách dòng; dòng `base` 100% mọi phút + `night` 30% (+20% phần làm thêm ban đêm — BLLĐ Đ.98 k.3) + `overtime` +50% + `holiday` (hệ số − 1); quỹ thưởng chia số dư lớn nhất → tổng đúng bằng quỹ; `canManageTime`: không phải của mình, của quản lý chỉ owner; owner không chấm công). DAL `lib/server/dal/payroll.ts`; action `app/actions/time.ts` (khung chung `lib/server/ops/run.ts`, dùng lại cho `app/actions/ops.ts`). **Quên ra ca** → lượt đóng với 0 phút + cờ `forgot_out` (cron, hoặc ngay khi người đó vào ca lần sau); phải sửa giờ trước khi gửi bảng công (`unresolved`). Nháp tính sống từ `time_entries`; [Gửi] chụp `snapshot` + `sha256(canonicalJson)`; xác nhận nhập lại PIN (rate-limit 5/15′), lưu IP + user-agent; đã gửi/xác nhận → mọi sửa giờ trong kỳ `locked`; "Chưa đồng ý" → về nháp + Telegram. Phiếu lương chỉ từ bảng công `acknowledged`, tính lại không đụng phiếu đã duyệt; đơn giá có hiệu lực trong kỳ đã duyệt → `locked`. Thưởng tuân thủ: đi muộn (snapshot), % mục checklist mở/trong/đóng ca của mẫu gắn vai người đó trong các ngày làm, lệch két lớn nhất ở ca người đó đóng; owner chọn Theo tiêu chí/Có/Không + điều chỉnh ± có lý do. Tab `cong` (mọi người) · `luong` (owner); `&ky=YYYY-MM`, `&tuan=<ngày>`. Cron daily (15:45 VN) gắn cờ quên ra ca thay cho "03:00" — kết quả như nhau vì mốc so là 03:00; ngày 1/3/`payDay` mỗi việc một lần (`ops_events`). Chưa làm: làm tròn phút (tuỳ chọn ở Cài đặt), ngày nghỉ hằng tuần 200%, kỳ điều chỉnh sau khi khoá.

### M9.5 — Gói "Ngày bán" (≈ 2–3 ngày) — làm song song với chuẩn bị ra mắt ✅
- §18: khoá lò khẩn cấp (nút gạt + `/khoalo` `/molo` + danh sách đơn bị ảnh hưởng + ghi hoàn tiền), giữ suất 15 phút cho đơn trả trước chưa nhận tiền, thẻ mã ghi nắp hộp (tab Mẻ · Đơn · Giao), bàn giao tiền COD của shipper, chấm điểm khẩu vị trên `/o/[token]`.
- **Chấp nhận:** domain `hold.ts`, `box-code.ts` coverage ≥ 95%; int test: giữ suất hết hạn trả suất **đúng một lần** khi nhiều request song song, tiền SePay đến sau khi hết hạn (còn suất → giữ lại & xác nhận; hết suất → ⚠ cần hoàn), lò khoá → `placeOrder` trả `paused`, `/khoalo` từ người lạ/nhân viên không có quyền bị bỏ qua, huỷ đơn đã trả → `refunded` + bản ghi hoàn, bàn giao lệch → Telegram, chấm điểm chỉ khi `completed` và một lần mỗi đơn; e2e: khoá lò → trang `/` hiện tạm ngưng; đơn trả trước hiện đếm ngược; thẻ nắp hộp đúng `THU`/`CK`; khách chấm điểm.
- Ghi chú triển khai: migration `0005_sale_day`. Domain thuần `hold.ts` (`needsHold`, `holdUntil`, `isHeld`, `isExpired`, `holdLabel`), `box-code.ts` (`boxCode`, `circled` ①…㊿, `addonLetter`), `oven-lock.ts` (lời nhắn ↔ lý do, tiền tố lý do huỷ `Quán tạm ngưng:`), `feedback.ts` (món chấm — combo tách pizza + BBQ, add-on không chấm; 7 ngày; sửa 24 giờ; `cleanFeedback`). `releaseExpiredHolds` (`dal/holds.ts`) là **một câu SQL CTE** (huỷ → trả suất theo mẻ → `order_events`) — nguyên tử, request song song chờ khoá dòng rồi xét lại `status = 'placed'` nên trả suất đúng một lần; gọi ở đầu transaction `placeOrder`, `getOvenSnapshot`, `getOrderView`, `loadKitchenDay`. Đơn giữ suất **không tự xác nhận** (kể cả khách quen) cho tới khi tiền về. SePay: đơn `hold_expired` nhận đủ tiền → mẻ còn chỗ & chưa vào lò → giữ lại suất, `placed` → `settlePaid`; hết chỗ → giữ `cancelled` nhưng `paid` → hiện ở "Cần hoàn tiền". DAL `dal/sale-day.ts`: `pauseOvenCore`/`resumeOvenCore` (hôm nay ± ngày mai, `ops_events`), `cancelWithRefundCore` (huỷ qua `advanceOrdersInTx` + ghi hoàn trong **cùng** transaction; đơn đã trả mà không ghi hoàn → `refund_required`; `payments` `provider='refund'`, `provider_txn_id = refund:<orderId>` → không ghi hoàn đôi), `recordHandoverCore` (khoá dòng đơn; shipper = actor của sự kiện → `completed`; đơn giao COD `completed` + `unpaid`). `dal/feedback.ts`: upsert một bản/đơn (`setWhere` 24 giờ), `productFeedback` 4 tuần cho trang công thức. UI: `OvenLock` ở đầu màn Bếp (trừ tab Cài đặt, ẩn với shipper) và tab Ca & két; `BoxCard` (40 px, viền 4 px) ở tab Mẻ (mặc định hiện cho mẻ trong lò/đã ra lò), sheet chi tiết đơn, tab Giao; mã nhỏ ở danh sách Đơn; `HoldBadge` "⏳ chờ CK · còn …"; `HandoverPanel` cuối tab Giao (đếm mù — số đáng có hiện sau khi lưu); `/o/[token]`: đếm ngược, "Hết thời gian giữ suất — Đặt lại", lời nhắn khoá lò, `FeedbackForm`. Cron daily xoá `feedback.comment` cùng thời hạn địa chỉ đơn.

### M10 — Kho 2 mức cho pizza (≈ 5 ngày)
- Cột kho trên `ingredients`, `production_formulas`, `stock_moves`, `stock_counts`; nhập từ `/chi`, sản xuất, trừ khi Ra lò, huỷ, kiểm kê tuần, cột Tồn ở tab Chuẩn bị, cảnh báo hết hạn/dưới mức.
- ✅ Thêm (31/10/2026): **công nợ nhà cung cấp** (`/no`, `/trano`, `/congno`), **hàng bán lại** (`goods`: thùng 24 lon → giá vốn/lon), **giá vốn & biên lợi nhuận theo món** (gồm bao bì: ly, đá, ống hút), **kiểm nhanh ABC** cuối ca (§17.8).
- **Chấp nhận:** `stock.ts` coverage ≥ 95% (bình quân gia quyền, đổi đơn vị, sản xuất, hao hụt, giá vốn món, chọn mục đếm xoay vòng B); int test: Ra lò hai lần chỉ trừ một lần, `no_show` vẫn trừ, `cancelled` không trừ; với Phụ lục B tồn sau ngày khớp từng dòng; `/no` nhập kho + tăng công nợ, `/trano` ghi chi + giảm công nợ (không ghi chi hai lần), lệch kiểm nhanh → Telegram.

### M11 — Chỉ số, kho café & trợ thủ Telegram (≈ 3–4 ngày)
- Bảng chỉ số §17.10 (tách theo mảng café · pizza); định lượng đồ uống; nhập Excel báo cáo Sapo (cần file mẫu từ chủ quán) — chưa có thì kiểm kê tuần.
- ✅ Thêm (31/10/2026): **báo cáo tối** (pizza 20:15 các ngày bán + tổng hợp cả ngày ngay sau khi đóng ca café), trợ thủ Telegram (`/lich`, `/pl`, nhắc đi chợ, tóm tắt góp ý tuần) (§17.10).
- **Chấp nhận:** manager không thấy chi phí nhân sự (kể cả `/pl` trong nhóm); số liệu khớp bộ dữ liệu mẫu một tháng; báo cáo tối gửi một lần mỗi ngày.

### Giai đoạn 2 (sau ra mắt, theo dữ liệu thật)
Suất muộn từ đế dự phòng · Danh sách chờ khi kín lò · Tồn kho theo ngày (`day_stock`) cho túi BBQ · Ship chung tuyến · Tem tích điểm & giới thiệu bạn · Zalo ZNS · Nhãn in dán hộp (tem nhiệt 58 mm có QR → trang đơn/chấm điểm, thay thẻ ghi bút lông ở §18.3) · Link bàn giao cho Rêu có token (xem không cần đăng nhập) · Báo cáo tuần (doanh thu, tỉ lệ lấp đầy lò, khách quay lại, hiệu quả từng `src`) · Trang đơn hiện "Đang giao — còn *n* điểm trước bạn" (theo thứ tự tuyến, **không** GPS) · Góp ý qua Zalo/Messenger.

### Giai đoạn 3 (khi ≥ 4 nhân viên)
**Ca linh hoạt:** tự chép lịch tuần sau vào giờ cố định (mặc định tối Thứ Năm) + báo nhóm; nhân viên **đăng ký nhận ca** trống; **đổi/nhường ca** (A đề nghị → B nhận → quản lý duyệt, cùng vai thì tự duyệt); **xin nghỉ** báo trước ≥ 2 ngày (quản lý duyệt) hoặc **đột xuất** `/nghi` → bot đăng "ai nhận ca …?" lên nhóm, người bấm đầu tiên nhận. Lương không cần nối thêm — tính theo giờ chấm công thực tế (§17.7), lịch chỉ dùng cho đi muộn/`late_out`. Chưa làm sớm vì 2 nhân viên nhắn nhau nhanh hơn thao tác app.

---

## 16. Quyết định cần chủ quán chốt (kèm mặc định)

Agent dùng **mặc định** để không bị chặn; chủ quán thay số liệu thật trong seed/Cài đặt.

| # | Câu hỏi | Mặc định đề xuất |
|---|---|---|
| 1 | Tên thương hiệu hiển thị: "THE HEAT PIZZA" hay "THE HEAT"? Quan hệ với nhà hàng 162 Nguyễn Thuật? | "THE HEAT PIZZA", logo hiện có |
| 2 | Thực đơn & giá chính thức (2 pizza, 2 BBQ, combo, add-on) | ✅ **Đã chốt:** giữ nguyên Phụ lục A |
| 3 | Bếp đặt ở đâu? Rêu chỉ là điểm nhận hay cũng là bếp? Địa chỉ Rêu? | ✅ **Đã chốt:** Rêu là bếp + điểm nhận. ⏳ Còn thiếu: địa chỉ & toạ độ Rêu (dùng cho footer pháp lý, bản đồ, điểm xuất phát tuyến giao) |
| 4 | Các mẻ trong ngày, giờ chốt, sức chứa mỗi mẻ (khay pizza / phần BBQ) | 17:00 · 18:00 · 19:00; chốt 15:30; 4 pizza + 4 BBQ mỗi mẻ |
| 5 | Ngày hoạt động trong tuần; đặt trước tối đa bao nhiêu ngày | ✅ **Pizza bán T6–T7–CN** (giai đoạn đầu, `data/seed.ts`); ✅ **đặt trước 4 ngày** (T2 đặt được T6) |
| 6 | Danh sách Thôn/Khu phố, phí ship từng nơi, cách nhóm tuyến | Phụ lục A (placeholder) |
| 7 | Chính sách thanh toán: COD cho tất cả? Khi nào bắt trả trước? | `risk_based` (khách từng bom hàng hoặc đơn ≥ 1.000.000đ) |
| 8 | Định lượng (BOM): gram phô mai, pepperoni, trọng lượng túi sườn… | Phụ lục A |
| 9 | Ai giao hàng (tự giao / shipper riêng)? Bán kính giao tối đa? | Shipper riêng, chỉ các khu vực trong danh sách |
| 10 | Tài khoản ngân hàng cho VietQR; có dùng SePay không? | Có (M6) |
| 11 | Hosting: Vercel Pro (~20 USD/tháng, ít vận hành) hay VPS (~150–300 nghìn/tháng, cần người vận hành)? | Vercel Pro + **Supabase** (gói Free khi phát triển; **Pro ~25 USD/tháng khi chạy thật** vì gói Free tạm dừng dự án sau 7 ngày không hoạt động và không có sao lưu tự động) |
| 12 | Thông tin pháp lý footer (hộ kinh doanh, MST/ĐKKD, email) | Placeholder, chặn ra mắt nếu chưa có |
| 13 | Ảnh chụp mới: Pizza Phô mai Bơ tỏi, BBQ #2, Combo, hũ sốt, chai cold brew Rêu | Dùng ảnh hiện có làm tạm |
| 14 | Thưởng doanh thu 1% | ✅ **Đã chốt:** quỹ chung 1% tổng doanh thu tháng (café + pizza), chia theo tỉ lệ giờ công |
| 15 | Thưởng tuân thủ | ✅ **300.000đ/tháng**. Tiêu chí mặc định: đi muộn ≤ 2 lần, checklist ≥ 95%, lệch két ca mình ≤ 20.000đ; owner sửa được trước khi duyệt |
| 16 | Quán có mở sau 22:00 không? | ✅ Không; giờ dọn dẹp sau 22:00 vẫn tính + phụ cấp đêm 30%; ca trễ không tính làm thêm (§17.7). Quản lý: gán trong app |
| 17 | Tài khoản nhận tiền | ✅ **Đã chốt:** pizza → TPBank riêng + SePay; café → MoMo kinh doanh (§17.9) |
| 18 | Vận hành: lương theo người, kỳ tháng, không tạm ứng, trả ngày 5; hộp chi 1.000.000đ; chi từ hộp chi hoặc tiền túi rồi hoàn; vùng III (20.000đ/giờ) | ✅ **Đã chốt** 31/10/2026 (§17) |
| 19 | Quỹ thưởng doanh thu tách café/pizza? | ✅ **Giữ gộp** (31/10/2026): 2 người làm cả hai mảng, tách thì phải gắn mảng cho từng giờ công (thêm thao tác, dễ sai); quỹ chung khuyến khích hỗ trợ nhau T6–CN. Tiền vào đã tách tài khoản (§17.9); chỉ số M11 tách **theo mảng**. Xem lại khi có đội pizza riêng |
| 20 | Giữ suất cho đơn chưa trả tiền | ✅ **15 phút**, chỉ cho đơn **bắt buộc trả trước** (§18.2) — 8 phút hơi gấp với khách mở app ngân hàng lần đầu; COD và chuyển khoản tự nguyện không bị huỷ |
| 21 | Theo dõi shipper thời gian thực (GPS) như app giao hàng? | ✅ **Không** — 1 shipper, giao trong thị trấn; web app không lấy được GPS khi chạy nền (cần app riêng), tốn pin, nhạy cảm quyền riêng tư. Thay bằng "còn *n* điểm trước bạn" (Giai đoạn 2) |
| 22 | Mã ghi nắp hộp: bút lông hay tem in QR? | ✅ **Bút lông trước** (§18.3) — không cần máy in/giấy tem; tem nhiệt có QR ở Giai đoạn 2 nếu sản lượng tăng |

---

## 17. Vận hành nội bộ `/admin/van-hanh` (M7–M11)

> ✅ Chủ quán chốt 31/10/2026. **Không làm POS** — café bán qua **Sapo** (gói không có API). Quán tại chỗ THE HEAT, café và app pizza **chung sổ sách**. Hiện 2 nhân viên làm theo giờ, mỗi người có điện thoại riêng.

### 17.1 Nguyên tắc

1. **Không ai tự duyệt cho chính mình.** Quản lý duyệt công của nhân viên; chủ quán duyệt công, chi tiền túi và lương của quản lý.
2. **Quản lý không thấy tiền lương** (đơn giá, phiếu lương, chi phí nhân sự). Ràng buộc nằm ở DTO phía server, không phải ẩn trên UI → có integration test khẳng định DTO trả cho `manager` không có trường tiền lương.
3. **Đếm mù:** đếm két/hộp chi xong mới thấy số lệch.
4. **Một lần nhập, nhiều nơi dùng:** nhắn `/chi` trên Telegram = chi phí + (nếu là nguyên liệu) nhập kho; đơn pizza ra lò = tự trừ kho; tiền chuyển khoản không mã đơn = doanh thu café để đối soát với số Sapo.
5. Logic thuần trong `lib/domain/` (ngưỡng coverage 95% như cũ): `cash.ts`, `money-text.ts` (đọc "150k", "1tr2", "1.200.000"), `expense-command.ts`, `worktime.ts`, `payroll.ts`, `stock.ts`, `checklist.ts`.
6. Mọi thao tác ghi `ops_events` (`actor`, `type`, `data`, `created_at`) — nhật ký kiểm toán như `order_events`.

### 17.2 Vai trò & phân quyền

`staff.role` (một giá trị) → **`staff.roles`** mảng enum `owner · manager · kitchen · server · barista · shipper` (migration: `roles = ARRAY[role]`). Một người kiêm nhiều vai trò. **Owner và manager phân công vai trò**; manager không cấp/thu `owner`, `manager`. `requireStaff(roles?)` đạt khi giao nhau khác rỗng.

| Quyền | owner | manager | kitchen · server · barista · shipper |
|---|---|---|---|
| Mở/đóng ca, đếm két, nhập doanh thu Sapo | ✅ | ✅ | ✅ (ca mình) |
| Chi tiền (hộp chi · tiền túi · chuyển khoản) | ✅ | ✅ (luôn có ghi chép) | ❌ |
| Duyệt hoàn tiền túi | ✅ | của nhân viên (không phải của mình) | ❌ |
| Checklist | ✅ sửa mẫu | ✅ sửa mẫu, xem tất cả | làm checklist vai trò mình |
| Sổ tay (quy trình/công thức) | ✅ tất cả, sửa | ✅ tất cả, sửa | chỉ trang gắn vai trò mình |
| Chấm công | ✅ | ✅ | ✅ (của mình) |
| Bảng công | gửi cho manager · xem tất cả | gửi cho nhân viên · sửa giờ có lý do | xác nhận của mình |
| Đơn giá & bảng lương | ✅ duy nhất | ❌ | phiếu lương của mình |
| Kho | ✅ | ✅ | kitchen/barista: sản xuất, huỷ, kiểm kê |
| Chỉ số | đầy đủ | không có số tiền lương | ❌ |

Vào `/admin`: có `kitchen`/`shipper` → `/admin/kitchen` như cũ; chỉ có `server`/`barista` → `/admin/van-hanh`. Thanh điều hướng admin có lối sang lại giữa hai khu.

### 17.3 Ca làm, két & hộp chi (M7)

**Mệnh giá** (`lib/domain/cash.ts`): `500000 · 200000 · 100000 · 50000 · 20000 · 10000 · 5000 · 2000 · 1000 · 500`. Nhập số tờ → tổng tự cộng (số nguyên VND).

**Két (`register`)** — tiền bán hàng:
- **Mở ca:** đếm két theo mệnh giá. Lệch so với lần đóng ca trước → cảnh báo ngay.
- **Đóng ca:** (1) đếm két (đếm mù); (2) nhập doanh thu café **từ báo cáo chốt ca Sapo**: tiền mặt, chuyển khoản, khác — **bắt buộc kèm ảnh** báo cáo Sapo; (3) nộp tiền về chủ (nếu có).
- **Số đáng có** = đầu ca + tiền mặt café (Sapo) + COD pizza hoàn tất trong ca (`payment_method = cod`, `completed`) − tiền nộp về chủ. **Lệch** = đếm thật − đáng có. Lệch ≠ 0 → Telegram; vượt `settings.ops.cashTolerance` (mặc định 20.000đ) → ⚠.
- **Chuyển khoản/MoMo café** không qua SePay (§17.9): nhân viên nhập số Sapo; chủ quán đối chiếu với báo cáo ngày của MoMo kinh doanh. App hiện tổng theo ngày để so nhanh.
- **Chi phí không lấy từ két** (chủ quán chốt).

**Hộp chi (`petty`)** — quỹ định mức **1.000.000đ** (`settings.ops.pettyFloat`):
- Bất biến: *tiền trong hộp + Σ chứng từ chi từ hộp chưa nạp bù = định mức*.
- **Kiểm hộp** (đếm theo mệnh giá, bất kỳ lúc nào, mặc định lúc đóng ca) → lệch hiện ngay.
- **Nạp bù:** chủ quán bấm [Nạp bù] → số tiền = Σ chứng từ kể từ lần nạp trước → các chứng từ đó được đóng kỳ.

**Bảng:**
- `shifts`: `id`, `service_date`, `opened_by`, `opened_at`, `closed_by`, `closed_at`, `status` (`open·closed`), `cafe_cash`, `cafe_transfer`, `cafe_other` (int null), `sapo_photo` (đường dẫn Storage), `note`. Tối đa một ca `open` (partial unique index).
- `cash_entries` (M7): `id`, `box` (`register·petty`), `kind` (`open·close·check` có `counts` jsonb `{ "500000": 2, … }`; `drop·replenish` chỉ có `total`), `shift_id` null, `total` int ≥ 0, `expected` int null (số đáng có lúc đếm), `staff_id`, `note`, `created_at`. Nộp về chủ lúc đóng ca ghi **sau** lần đếm → không làm lệch lần đếm, chỉ trừ vào số đầu ca sau.
- Kèm `ops_events` (nhật ký), `telegram_updates` (chống trùng, cron dọn > 7 ngày), `ops_files` (ảnh).

### 17.4 Chi phí & Telegram (M7)

**Nguồn tiền** (`source`): `petty` (hộp chi, mặc định) · `pocket` (tiền túi, chờ hoàn) · `bank` (chuyển khoản từ TK hộ kinh doanh). Chỉ `owner`/`manager` ghi chi.

**Cú pháp** (bot giữ **privacy mode bật** → chỉ nhận lệnh `/…` và tin trả lời bot; không đọc chuyện trong nhóm):

```
/chi 150k đá viên              → hộp chi, nhóm tự đoán theo từ khoá
/chi 1tr2 phô mai 5kg #tui     → tiền túi; "phô mai 5kg" khớp nguyên liệu → hỏi nhập kho (M10)
/chi 320.000 gas #ck           → chuyển khoản
/chihuy C123                   → huỷ trong 24 giờ (chỉ người ghi hoặc owner)
/tonghop                       → tổng chi tháng này theo nhóm & nguồn
```

- Bot trả lời: "🧾 C123 · 150.000đ · Nguyên liệu café · Hộp chi · Lan" + nút [Đổi nhóm] [Huỷ] + "↩ Trả lời tin này bằng ảnh hoá đơn". Ảnh trả lời → tải qua `getFile`, lưu bảng **`ops_files`** (bytea, ≤ 1 MB — client nén JPEG ≤ 1600 px) và phục vụ qua `GET /api/ops/files/[id]` có kiểm tra phiên; giữ cả `telegram_file_id`. (M7 chọn Postgres thay Supabase Storage: không thêm env/dịch vụ/CSP; ~2 nhân viên → vài MB/tháng.)
- Số tiền đọc bằng `money-text.ts`: `150k`, `150 k`, `1tr2`, `1,2tr`, `1.200.000`, `85000`. Không đọc được → bot trả lời cú pháp mẫu, không ghi.
- Nhóm chi phí (owner sửa): Nguyên liệu pizza · Nguyên liệu café · Bao bì · Gas/điện/nước · Sửa chữa · Vệ sinh · Marketing · Khác. Từ khoá đoán nhóm nằm trong `settings.ops.expenseKeywords`.
- **Liên kết tài khoản:** trong app [Liên kết Telegram] → link `t.me/<bot>?start=<token 10 phút>` → bot lưu `staff.telegram_user_id`. Tin từ người chưa liên kết hoặc nhóm lạ → bỏ qua (chỉ trả lời "chưa liên kết").
- **Tiền túi:** trạng thái `pending → approved → reimbursed` (hoặc `rejected`). Người duyệt ≠ người chi (§17.1). Hoàn từ hộp chi thì ghi thêm một chứng từ `petty` liên kết.
- **Tổng hợp:** cron ngày 1 gửi tổng chi tháng trước theo nhóm/nguồn, so với tháng trước kia.
- Cũng nhập được trong app (form + ảnh chụp) cho ai không tiện dùng Telegram.

**Route:** `POST /api/webhooks/telegram` — xác thực header `X-Telegram-Bot-Api-Secret-Token` (= `TELEGRAM_WEBHOOK_SECRET`, so sánh hằng thời gian), chỉ nhận `TELEGRAM_CHAT_ID`/`TELEGRAM_OPS_CHAT_ID` và chat riêng của người đã liên kết; idempotent theo `update_id`. **Agent đọc tài liệu Bot API hiện hành** trước khi code (setWebhook, callback_query, getFile).

**Bảng `expenses`** (M7): `id` (mã hiển thị `C<id>`), `spent_at`, `amount` int > 0, `category`, `description` (1–200), `source`, `status` (`recorded` cho hộp chi/CK; tiền túi `pending → approved → reimbursed` | `rejected`), `spent_by`, `approved_by`, `reimbursed_from` (`petty·bank`) + `reimbursed_at`, `replenish_id` → `cash_entries` (đợt nạp bù), `photo` → `ops_files`, `telegram_file_id`, `telegram_chat_id` + `telegram_msg_id` (UNIQUE — khớp ảnh trả lời), `cancelled_at`, `created_at`. Hoàn tiền túi bằng hộp chi cũng là tiền rút khỏi hộp (tính vào bất biến định mức).

### 17.5 Checklist hằng ngày (M8)

- `checklist_templates`: `id`, `title`, `roles[]`, `moment` (`open·during·close·weekly`), `items` jsonb `[{ id, label, photo?: bool, value?: { unit: "°C", min?, max? } }]`, `sort`, `is_active`.
- `checklist_runs`: `template_id`, `service_date`, `done` jsonb `{ itemId: { by, at, value?, photo? } }`, `completed_at` — UNIQUE `(template_id, service_date)`; nhiều người cùng tick một danh sách.
- Mục có `value` ngoài khoảng (VD tủ mát > 5 °C) → Telegram ⚠ ngay.
- Đóng ca khi checklist `close` chưa xong → hỏi lại một lần (không chặn cứng).
- Seed mẫu: Mở ca (bếp/pha chế/phục vụ), Đóng ca, Vệ sinh tuần, Nhiệt độ tủ.
- Tỉ lệ hoàn thành dùng cho thưởng tuân thủ (§17.7) và chỉ số (§17.10).

### 17.6 Sổ tay: quy trình & công thức (M8)

- `handbook_pages`: `id`, `slug`, `title`, `kind` (`sop·recipe`), `roles[]` (ai được xem; owner/manager luôn xem), `body` (Markdown), `product_id` null, `version`, `updated_by`, `updated_at`.
- Hiển thị bằng **`marked`** (MIT) **chỉ ở Server Component** → 0 KB JS phía client; HTML qua danh sách thẻ cho phép (không nhúng HTML thô từ nội dung).
- **Công thức pizza:** trang gắn `product_id` tự hiện bảng định lượng từ `recipe_lines` (một nguồn sự thật, không chép số). Công thức đồ uống: bảng định lượng riêng ở M11 (để trừ kho café).
- Bảo mật công thức: chỉ vai trò được gắn mới mở được, trang in mờ tên người xem, ghi log lượt xem; không có nút xuất.
- Route: `/admin/van-hanh?tab=so-tay&trang=<slug>`.

### 17.7 Chấm công, bảng công & lương (M9)

**Chấm công** (điện thoại riêng của nhân viên, đã đăng nhập PIN):
- [Vào ca] / [Ra ca] một chạm. Server ghi giờ (không tin giờ máy) và IP.
- **Tại quán?** — IP công khai so với `settings.ops.storeIps`. Owner/manager đang ở quán bấm [Đây là Wi-Fi quán] để cập nhật khi nhà mạng đổi IP. IP lạ → vẫn ghi nhưng gắn cờ `off_site`, quản lý xem lại khi duyệt (**gắn cờ, không chặn**). Không dùng selfie/GPS.
- Quên ra ca → cron 03:00 gắn cờ `forgot_out`, không tự cộng giờ; quản lý sửa kèm lý do.
- **Lịch ca** `shift_plans` (`staff_id`, `date`, `start`, `end`): quản lý xếp theo tuần, nút [Chép tuần trước] → dùng để tính đi muộn/về sớm.
- `time_entries`: `id`, `staff_id`, `clock_in`, `clock_out` null, `in_ip`, `out_ip`, `flags` text[] (`off_site·forgot_out·late_out·edited`), `edit_reason` null. Mọi sửa giờ ghi `ops_events`.

**Tính giờ** (`worktime.ts`, giờ VN): cắt mỗi lượt thành phút **thường · ban đêm (22:00–06:00, phụ cấp +30%) · ngày lễ (`holidays`, hệ số mặc định 3,0) · làm thêm (vượt 8 giờ/ngày, 1,5)**.
- ✅ Quán đóng 22:00 nhưng **dọn dẹp sau 22:00 vẫn là giờ làm** → tính lương thường + phụ cấp đêm 30% cho phần sau 22:00 (BLLĐ 2019 Điều 98 — không thoả thuận bỏ được). Ví dụ 20 phút × 20.000đ × 30% = 2.000đ.
- ✅ **Ca tối bắt đầu trễ không phát sinh làm thêm:** làm thêm chỉ tính khi **tổng giờ trong ngày vượt 8 giờ**, không tính theo "về sau giờ kết thúc lịch". Ca 16:00–22:15 = 6 giờ 15 phút → không có 150%.
- Ra ca muộn hơn lịch > 15 phút → cờ `late_out`: quản lý xác nhận (dọn dẹp thật → giữ; ngồi lại không làm → sửa giờ kèm lý do). Gợi ý vận hành: ngừng nhận khách 21:30 để dọn xong trước 22:00. Bảng `holidays` (`date`, `name`, `multiplier`) do owner nhập; nhắc trước Tết âm lịch mỗi năm. Tính theo phút thực, không làm tròn (owner có thể bật làm tròn ở Cài đặt).

**Bảng công tháng** `timesheets` (`staff_id`, `period` `YYYY-MM`, các tổng phút, số lần muộn, `status`, `snapshot` jsonb, `snapshot_hash`):

```
draft ─(manager gửi; với bảng công của manager: owner gửi)─▶ submitted
submitted ─(chính nhân viên xác nhận bằng PIN)─▶ acknowledged   (khoá)
submitted ─(nhân viên "Chưa đồng ý" + lý do)─▶ draft
```

**Lương (chỉ owner):**
- `pay_rates`: `staff_id`, `hourly_rate` int, `effective_from` — **có lịch sử**, tăng lương không làm đổi kỳ cũ. Không cho lưu dưới `settings.payroll.minHourly` (**vùng III: 20.000đ/giờ**, owner cập nhật khi Nhà nước đổi mức).
- Thưởng ✅: **quỹ 1% tổng doanh thu tháng** (café theo Sapo + pizza hoàn tất) **chia theo tỉ lệ giờ công** của mọi nhân viên (cả café & pizza); **tuân thủ 300.000đ/tháng** (tiêu chí §16 #15 tính tự động, owner sửa được trước khi duyệt). Bao ăn uống không tính vào lương.
- `payslips`: `staff_id`, `period`, `lines` jsonb (`base · night · overtime · holiday · revenue_bonus · compliance_bonus · adjustment`, mỗi dòng `{ label, minutes?, rate?, amount }`), `total` int, `status` (`draft → approved → paid`), `paid_at`, `paid_method`, `staff_ack_at`. Chỉ tạo từ bảng công đã `acknowledged`.
- Lịch: **ngày 1** cron tạo bảng công nháp tháng trước + Telegram nhắc → quản lý gửi → nhân viên xác nhận → owner duyệt lương → **trả ngày 5** → nhân viên bấm [Đã nhận lương].
- Nhân viên xem phiếu lương của mình (bảng kê trả lương — BLLĐ 2019 Điều 95), in/lưu PDF được.

**Xác nhận trên điện thoại, không ký tay** — được (Luật Giao dịch điện tử 2023): người xác nhận nhập lại PIN; lưu ảnh chụp dữ liệu (`snapshot`) + `sha256` + thời điểm + IP + thiết bị; đã khoá thì không sửa — sai thì mở kỳ điều chỉnh. Hợp đồng lao động nên có điều khoản đồng ý xác nhận bảng công/lương qua ứng dụng.

### 17.8 Kho 2 mức (M10 — pizza trước, café ở M11)

**Mức:** `raw` (nguyên liệu mua về: bột, men, phô mai khối, sườn sống) → `prep` (bán thành phẩm: đế Pan đã ủ, túi sườn ướp 500 g, hũ sốt) · `goods` (dùng thẳng: hộp, chai cold brew). Bảng `ingredients` hiện tại là mức `prep`/`goods` → thêm cột, không tạo bảng mới:

`ingredients` + `level`, `track_stock` bool (chỉ ~15 mặt hàng đắt), `purchase_unit` + `purchase_factor` (bao 25 kg = 25.000 g), `avg_cost` numeric(12,4) (đ/đơn vị — **ngoại lệ duy nhất** của luật tiền nguyên: đơn giá theo gram có phần lẻ; mọi **thành tiền** vẫn là int), `shelf_life_hours` null, `par_level` null (mức tối thiểu), `aliases` text[] (khớp chữ trong `/chi`).

- `production_formulas`: `output_id`, `output_qty` (VD 6 đế), `lines` [{ `ingredient_id`, `qty` }] — một mẻ bột ra 6 đế.
- `stock_moves`: `id`, `ingredient_id`, `qty` numeric (+/−), `kind` (`purchase·produce_in·produce_out·sale·waste·adjust`), `unit_cost`, `ref_type`/`ref_id` (expense/production/batch/count), `expires_at` null, `created_by`, `created_at`. **Tồn = Σ qty.** Không sửa/xoá — sai thì thêm dòng `adjust`.
- **Nhập:** từ `/chi` khớp `aliases` + số lượng → bot hỏi [Nhập kho 5.000 g Mozzarella] [Chỉ chi phí]; hoặc form trong app. Giá vốn bình quân gia quyền cập nhật khi nhập.
- **Sản xuất:** [Làm 2 mẻ bột] → trừ nguyên liệu theo công thức, cộng 12 đế, `expires_at = now + shelf_life_hours`.
- **Bán:** khi mẻ nướng chuyển `done` (Ra lò) → trừ theo `recipe_lines` cho mọi đơn không `cancelled` của mẻ (gồm `no_show` — bánh đã nướng). Idempotent theo mẻ.
- **Huỷ/hư hỏng:** ghi lý do (hết hạn · rơi · lỗi nướng · khác).
- **Kiểm kê tuần** `stock_counts`: đếm thật các mặt hàng `track_stock` → dòng `adjust` = thật − sổ → **hao hụt (số lượng & tiền)**.
- Tab Chuẩn bị (§10.2) thêm cột "Tồn / đủ / thiếu" cạnh mỗi nguyên liệu; dưới `par_level` hoặc sắp hết hạn → Telegram + mục trong checklist mở ca.

**Bổ sung M10 (✅ 31/10/2026):**

- **Công nợ nhà cung cấp** — lấy hàng trước, trả sau (VD "lấy nợ cô Nhiều 3 thùng Sting, 2 thùng Pepsi"):
  - `suppliers` (`id`, `name` unique, `aliases` text[], `phone` null, `is_active`) · `supplier_bills` (`id`, `supplier_id`, `received_at`, `items` jsonb `[{ ingredient_id?, text, qty, unit, amount? }]`, `amount` int null — chưa biết giá thì để trống, điền khi trả, `photo` → `ops_files`, `status` `open·paid·cancelled`, `paid_expense_id` → `expenses`, `created_by`, Telegram chat/msg id).
  - Telegram: `/no Cô Nhiều 3 thùng sting, 2 thùng pepsi 480k` + ảnh trả lời → phiếu nợ; dòng khớp `aliases` nguyên liệu → hỏi [Nhập kho] như `/chi` (giá vốn ghi **khi nhận hàng**). `/trano Cô Nhiều 480k [#tui|#ck]` → ghi **một** chi phí (dòng tiền ghi **khi trả**) và đóng các phiếu cũ nhất của NCC đó đến đủ số tiền; thừa/thiếu → nhắc. `/congno` → nợ còn lại theo NCC. Trong app: tab Kho → Công nợ.
  - Chi phí của hàng đã nhập kho bằng phiếu nợ **không** tính lại giá vốn lần hai (chi phí ghi `ref` tới phiếu).
- **Hàng bán lại** (`goods`): Pepsi, Sting, bánh… `purchase_unit` "thùng", `purchase_factor` 24 → nhập 1 thùng 240.000đ = 24 lon × 10.000đ (bình quân gia quyền).
- **Giá vốn & biên lợi nhuận theo món:** giá vốn món = Σ định lượng (`recipe_lines`, đồ uống ở M11) × `avg_cost` (bán thành phẩm lấy giá vốn qua `production_formulas` — tính luôn mức 2) + **bao bì/đồ đi kèm** (ly, nắp, đá, ống hút, hộp — là nguyên liệu `goods` trong định lượng). Tab Kho → "Biên lợi nhuận": giá bán · giá vốn · lãi gộp · % — VD Pepsi 15.000 − 10.000 − ly/đá/ống hút ~1.000 = **4.000đ (27%)**. Món café bán qua Sapo: giá bán nhập trong bảng món café (M11). Chỉ owner/manager xem.
- **Kiểm nhanh cuối ca — đếm xoay vòng ABC:** `ingredients.count_class` `A·B·C`. **A** (5–6 món đắt/dễ hư: mozzarella, sườn, đế, sữa tươi, hạt cà phê) đếm **mỗi ca**; **B** mỗi ca đếm 3 món lâu chưa đếm nhất (xoay vòng, hết vòng ≈ 1 tuần); **C** chỉ kiểm kê tuần. Màn "Kiểm nhanh" trong tab Việc lúc đóng ca, theo vai trò (barista: quầy café; bếp: tủ bếp), **đếm mù** (không hiện số sổ sách trước khi nhập) → `stock_counts` kind `quick` → lệch vượt ngưỡng (% theo món) → Telegram. ~2 phút/ca.

### 17.9 Dòng tiền vào: hai tài khoản tách theo mảng

✅ Chủ quán chốt 31/10/2026:
- **Pizza → tài khoản TPBank riêng** của hộ kinh doanh, liên kết SePay (VietQR + tự xác nhận như M6). Số giao dịch ít (chỉ T6–CN) → phí SePay theo giao dịch không đáng kể. Mọi khoản vào TK này đều thuộc pizza → giữ nguyên cảnh báo "không khớp đơn" của §11.2 (hiếm, đáng xem).
- **Café → giữ MoMo kinh doanh** (nhiều giao dịch nhỏ, biên mỏng — phí ≥ 500đ/giao dịch qua dịch vụ đối soát là không đáng). Không tích hợp tự động; tiền MoMo nhập ở ô "chuyển khoản/MoMo" khi đóng ca (§17.3), chủ quán đối chiếu với báo cáo ngày của MoMo.
- Sổ sách vẫn **chung một app**: chỉ số §17.10 cộng doanh thu hai mảng. Khi kê khai, mỗi mảng có sao kê riêng — dễ tách doanh thu theo ngành nếu thuế suất khác nhau (nhờ kế toán xác nhận).

### 17.10 Chỉ số quản lý (M11)

| Chỉ số | owner | manager |
|---|---|---|
| Doanh thu ngày/tuần/tháng: pizza (đơn hoàn tất) + café (số Sapo theo ca) | ✅ | ✅ |
| Lệch két & hộp chi theo ca/người | ✅ | ✅ |
| Chi phí theo nhóm, so với kỳ trước | ✅ | ✅ |
| Food cost % = (tồn đầu + nhập − tồn cuối) / doanh thu; hao hụt | ✅ | ✅ |
| **Doanh thu / giờ công** | ✅ | ✅ |
| Chi phí nhân sự % doanh thu, prime cost | ✅ | ❌ |
| Checklist hoàn thành %, đi muộn, tỉ lệ lấp đầy lò | ✅ | ✅ |

**Báo cáo tối & trợ thủ Telegram (M11, ✅ 31/10/2026):**
- **Pizza 20:15** các ngày bán (T6–CN): doanh thu pizza (CK/COD/đã thu), đơn huỷ/bom, bàn giao COD (§18.4), điểm khẩu vị trong ngày (§18.5), tồn nhóm A sau Ra lò, việc cần làm (thiếu so với `par_level` cho ngày bán kế tiếp → "cần đặt …"). Cần cron thứ hai → Vercel Pro (đã khuyến nghị cho ra mắt).
- **Cả ngày** gửi ngay sau khi đóng ca café (không cần cron): doanh thu café theo Sapo + pizza, tiền mặt/CK, lệch két & hộp chi, checklist ca (% + ảnh), kiểm nhanh ABC, chi phí trong ngày. Một lần mỗi ngày (`ops_events`).
- Lệnh: `/lich` (lịch ca tuần), `/pl` (P&L tháng theo mảng — **chỉ trả lời trong chat riêng với owner**, vì có chi phí nhân sự), nhắc đi chợ (dưới `par_level` hoặc trước ngày bán), tóm tắt góp ý tuần (§18.5). Lệch tiền mặt đã có từ M7.
- AI chỉ dùng cho **tóm tắt góp ý tuần** (tuỳ chọn, bật bằng env khoá API): model rẻ nhất họ Claude hiện hành (Haiku); vài chục góp ý/tuần nên chi phí không đáng kể. Không có khoá → gửi danh sách góp ý thô.

Kho café (M11): định lượng đồ uống + **nhập file Excel xuất từ báo cáo "bán hàng theo mặt hàng" của Sapo** (tải lên trong app → đọc → trừ kho). Trước khi có file mẫu: chỉ kiểm kê tuần hạt cà phê, sữa, đá… và tính lượng dùng = tồn đầu + nhập − tồn cuối.

### 17.11 Route, env, cron

- Route mới (bổ sung §5.4): `/admin/van-hanh?tab=…` (M7: `ca · chi · nhan-vien`; sau: `viec · so-tay · cong · luong · kho · chi-so`, `&trang=` cho sổ tay), `POST /api/webhooks/telegram`, `GET /api/ops/files/[id]`.
- Env mới: `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_OPS_CHAT_ID` (tuỳ chọn, mặc định = `TELEGRAM_CHAT_ID`).
- `settings.ops` (M7): `{ cashTolerance: 20000, pettyFloat: 1000000 }` — owner sửa trong tab Ca & két; M9 thêm `storeIps`; từ khoá nhóm chi đang là hằng `DEFAULT_EXPENSE_KEYWORDS` (`lib/domain/expense-command.ts`) · `settings.payroll`: `{ minHourly: 20000, payDay: 5, revenueBonusPct: 1, complianceBonus: … }`.
- Cron daily thêm: gắn cờ quên ra ca, cảnh báo hết hạn/dưới mức tồn; ngày 1: tổng hợp chi phí + bảng công nháp; ngày 3: nhắc ai chưa xác nhận; ngày 5: nhắc trả lương.
- Lệnh Telegram theo milestone: M7 `/chi` `/chihuy` `/tonghop` `/start` · M9.5 `/khoalo` `/molo` · M10 `/no` `/trano` `/congno` · M11 `/lich` `/pl`. Bot vẫn giữ privacy mode bật (chỉ đọc lệnh `/…` và tin trả lời bot).
- Trang admin không tính vào ngân sách JS của `/` (§13.1); vẫn giữ nhẹ cho máy Android tầm trung.

---

## 18. Gói "Ngày bán" (M9.5)

> ✅ Chủ quán duyệt 31/10/2026. Năm việc nhỏ giảm rủi ro trong giờ bán pizza (T6–CN, 17:00–19:30). Không thêm route mới — dùng `/admin/kitchen`, `/admin/van-hanh`, `/o/[token]`, bot Telegram.

### 18.1 Khoá lò khẩn cấp (mất điện · lò hỏng · mưa bão)

- Dùng lại `service_days.status = paused` + `pause_message` (§3.2, §7.2) — Oven Bar & `placeOrder` đã xử lý `paused`. Thêm lối **1 chạm**: nút gạt "Khoá lò" ở đầu `/admin/kitchen` và tab Ca & két của `/admin/van-hanh` (owner · manager · kitchen) → chọn lý do có sẵn (Mất điện · Lò gặp sự cố · Mưa bão, không giao được · Khác…) → xác nhận → khoá **hôm nay** (tuỳ chọn: cả ngày mai). Telegram: `/khoalo [lý do]`, `/molo` — chỉ người đã liên kết có vai owner/manager/kitchen; người khác → bỏ qua như §17.4.
- Sau khi khoá: hiện **"Đơn bị ảnh hưởng"** (và gửi cùng nội dung vào nhóm): các đơn hôm nay chưa `completed/cancelled/no_show` — `#seq`, tên, SĐT ([Gọi]), mẻ, **đã trả x đ → cần hoàn** / COD. Mỗi đơn: [Huỷ — quán tạm ngưng] (trả suất như huỷ thường). Đơn đã trả: huỷ → `payment_status = refunded` sau khi người dùng ghi **hoàn tiền** (số tiền, CK/tiền mặt, ghi chú) → bản ghi `payments` `provider = 'refund'`, `amount` âm, + `order_events`. App không tự chuyển tiền — chỉ liệt kê & ghi nhận.
- Trang `/o/[token]` của đơn bị huỷ vì khoá lò: hiện lời nhắn tạm ngưng + "Quán sẽ gọi/hoàn tiền cho bạn", **ẩn QR** chuyển khoản.

### 18.2 Giữ suất có hạn cho đơn trả trước

- Vấn đề: đơn chuyển khoản chưa trả **không bao giờ tự huỷ** → suất cuối của mẻ 18:00 bị giữ ảo, khách sau thấy "kín lò".
- Áp dụng **chỉ** cho đơn mà `requiresPrepay` bắt buộc chuyển khoản trước (§7.4) và `payment_status = unpaid`: `orders.hold_until = created_at + settings.payment.holdMinutes` (mặc định **15**). Chuyển khoản *tự nguyện* và COD không có hạn (chưa thấy tiền đến lúc giao → shipper thu như COD — thẻ nắp hộp hiện `THU`).
- **Hết hạn:** `releaseExpiredHolds(now, tx)` — một câu `UPDATE orders SET status='cancelled' … WHERE status='placed' AND payment_status='unpaid' AND hold_until < now RETURNING` rồi trả suất **đúng một lần** (dùng lại logic huỷ, `order_events` actor `system`, lý do `hold_expired`). Gọi ở đầu transaction `placeOrder` và trong `getOvenSnapshot` → **không cần cron**, suất trả về ngay khi có người xem/đặt. Domain thuần `lib/domain/hold.ts` (`holdUntil`, `isExpired`, nhãn đếm ngược).
- **Tiền đến sau khi hết hạn** (SePay): mẻ còn suất → giữ lại suất, mở lại đơn, `paid` + xác nhận như thường; hết suất → giữ đơn `cancelled`, ghi tiền, Telegram ⚠ "CK sau khi hết giữ suất — cần hoàn hoặc chuyển mẻ".
- UI: màn thành công & `/o/[token]` hiện "Giữ suất đến 17:32 · còn 12:40" (dùng `formatRemaining`); hết hạn → "Hết thời gian giữ suất — đặt lại" (giỏ cũ còn). Bếp: đơn đang giữ có nhãn "chờ CK · còn mm:ss".

### 18.3 Mã ghi nắp hộp (bút lông, 3 giây)

- Mỗi đơn có **thẻ nắp hộp** chữ rất to (số ≥ 40 px, khung đậm, tương phản cao) ở tab **Mẻ** (theo mẻ đang đóng gói), **Đơn** và **Giao** — người đóng gói chép y nguyên lên góc nắp bằng bút lông dầu; shipper khớp hộp ↔ đơn bằng cùng mã.
- **Quy ước mã** (domain thuần `lib/domain/box-code.ts`, ≤ 12 ký tự): `12` (số đơn trong ngày, khoanh tròn) · `T289` = **thu** 289.000đ (COD, hoặc CK chưa về) · `CK` = đã chuyển khoản, **không thu** · `+2S` = thêm 2 hũ sốt (chữ tắt add-on = chữ đầu của **tên** món sau từ chỉ vật chứa "Hũ/Chai…" — `products.short` là câu mô tả nên không dùng được; gồm cả quà; quá 12 ký tự thì gộp thành `+3`) · `R` = nhận tại Rêu. VD `⑫ T289 +2S`, `⑦ CK`. Thẻ còn hiện dòng phụ (không cần chép): tên khách, khu vực, giờ giao.
- Nhiều hộp cho một đơn: thẻ ghi `1/3`, `2/3`… sau mã.
- Tem in có QR (→ trang đơn, chấm điểm) để Giai đoạn 2 (máy in nhiệt 58 mm + giấy tem).

### 18.4 Bàn giao tiền COD của shipper

- Tab **Giao** thêm "Bàn giao tiền" cho ngày đang xem: theo từng shipper (người bấm Đã giao — `order_events.actor`), danh sách đơn COD `completed` chưa bàn giao + tổng **đáng có**. Người nhận (owner · manager · kitchen, ≠ shipper) nhập **số nhận thật** (đếm mù như §17.3) → `cash_handovers` (`id`, `service_date`, `shipper_id`, `order_ids` int/uuid[], `expected`, `received`, `received_by`, `note`, `created_at`); mỗi đơn chỉ bàn giao một lần. Lệch ≠ 0 → Telegram (vượt `cashTolerance` → ⚠).
- Tiền nhận được bỏ vào két → vẫn nằm trong "COD pizza hoàn tất trong ca" của số đáng có khi đóng ca (§17.3) — bàn giao chỉ để biết **ai** làm lệch.

### 18.5 Chấm điểm khẩu vị 1 chạm

- Mục đích: tinh chỉnh công thức những tuần đầu (khách thị trấn ít khi chủ động góp ý — chỉ không quay lại).
- `/o/[token]` khi đơn `completed` (trong 7 ngày): mỗi món 3 mức **😋 Ngon · 🙂 Được · 😕 Chưa hợp**; chọn 😕 → chip gợi ý theo loại món (BBQ: *ngọt hơn · cay hơn · mềm hơn · ít mặn*; pizza: *nhiều phô mai hơn · đế mỏng hơn · ít dầu*) + ô góp ý ≤ 300 ký tự. Một lần mỗi đơn, sửa được trong 24 giờ. Server Action có rate-limit; không cần đăng nhập (token đơn là đủ).
- Bảng `feedback` (`order_id` unique, `ratings` jsonb `{ productId: 1|2|3 }`, `tags` jsonb, `comment` null, `created_at`, `updated_at`). Gửi Telegram ngay: "⭐ #12 Pepperoni 😋 · BBQ 😕 *ngọt hơn* — 'hơi mặn'". Tổng hợp tuần ở M11 (§17.10). Tab Sổ tay → trang công thức hiện điểm trung bình 4 tuần của món đó (owner/manager).
- `/chinh-sach`: thêm mục góp ý (lưu cùng đơn, xoá theo thời hạn đơn).

## Phụ lục A — Seed data mẫu

> Giá & định lượng là **giá trị giữ chỗ** để phát triển; chủ quán chốt ở §16.

**Sản phẩm**

| id | kind | Tên | Giá | uses_pan/bbq | Ảnh tạm |
|---|---|---|---|---|---|
| `combo-doi` | combo | Combo Đôi — 1 Pan Pizza + 1 BBQ | 289.000 | 1 / 1 | `menu/pan-bbq.jpg` |
| `pepperoni-pan` | pizza | Pan Pizza Pepperoni | 159.000 | 1 / 0 | `pizza/346-American-Style-Pizza_carrousel03.jpg` |
| `garlic-cheese-pan` | pizza | Pan Pizza Phô mai Bơ tỏi | 149.000 | 1 / 0 | `menu/pan-margherita.jpg` (tạm) |
| `ribs-sv` | bbq | Sườn heo BBQ Sous-vide 24h | 169.000 | 0 / 1 | `menu/bbq-ribs.jpg` |
| `bbq-2` | bbq | BBQ #2 (chủ quán đặt tên) | 149.000 | 0 / 1 | `menu/bbq-thigh.jpg` (tạm) |
| `sauce-garlic-butter` | addon | Hũ Sốt Bơ Tỏi chấm viền bánh | 10.000 | 0 / 0 | `menu/sauce-cheddar.jpg` |
| `sauce-bbq-smoky` | addon | Hũ Sốt BBQ khói | 10.000 | 0 / 0 | `menu/sauce-bbq.jpg` |
| `cold-brew-reu` | addon (supplier `reu`) | Chai Cà phê ủ lạnh Rêu | 18.000 | 0 / 0 | `menu/cold-brew.jpg` |

`combo-doi.combo_config` = pizza ∈ {`pepperoni-pan`, `garlic-cheese-pan`}, bbq ∈ {`ribs-sv`, `bbq-2`}. `upsell_ids` của mọi món chính = 3 add-on trên.

**Nguyên liệu & định lượng**

| Nguyên liệu (`id`) | Đơn vị | pepperoni-pan | garlic-cheese-pan | ribs-sv | bbq-2 | sauce-garlic-butter | sauce-bbq-smoky | cold-brew-reu |
|---|---|---|---|---|---|---|---|---|
| `pan-dough` Đế Pan đã ủ | đế | 1 | 1 | | | | | |
| `mozzarella` | g | 180 | 180 | | | | | |
| `pepperoni` | g | 60 | | | | | | |
| `garlic-butter-base` Bơ tỏi phết | g | | 40 | | | | | |
| `ribs-bag` Túi sườn sous-vide (500 g) | túi | | | 1 | | | | |
| `bbq2-bag` Túi BBQ #2 | túi | | | | 1 | | | |
| `jar-garlic-butter` Hũ sốt bơ tỏi | hũ | | | | | 1 | | |
| `jar-bbq-smoky` Hũ sốt BBQ khói | hũ | | | | | | 1 | |
| `pink-ginger` Gừng hồng muối | phần | 1 | 1 | 1 | 1 | | | |
| `pizza-box` Hộp pizza | hộp | 1 | 1 | | | | | |
| `bbq-tray` Khay BBQ | khay | | | 1 | 1 | | | |
| `cold-brew-bottle` (storage `quầy Rêu`) | chai | | | | | | | 1 |

**Lịch mẫu:** T6–CN (✅ 31/10/2026), mẻ `17:00/18:00/19:00`, `oven_lead_min = 20`, `cutoff_time = 15:30`, `cap_pan = 4`, `cap_bbq = 4`.

**Khu vực & tuyến (placeholder)**

| Tuyến | Khu vực | Phí ship |
|---|---|---|
| Tuyến Khu phố 2 | Khu phố 1, Khu phố 2, Khu phố 3 | 10.000 |
| Tuyến Quốc lộ / Thị trấn | Thị trấn (trung tâm), Dọc Quốc lộ 1A | 10.000 / 15.000 |
| Tuyến Thôn | Thôn A, Thôn B | 15.000 |

**Bếp & điểm nhận:** Cà phê Rêu (địa chỉ chờ chủ quán điền) — quà khi tự đến lấy: `sauce-garlic-butter`.

---

## Phụ lục B — Bộ dữ liệu kiểm thử Prep (khớp ví dụ trong brief)

Ngày phục vụ **Thứ Sáu 06/11/2026**, 12 đơn, không đơn nào bị huỷ.

| # | Mẻ (giao) | Khách | Nhận | Khu vực/Tuyến | Món | Add-on | Thanh toán | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| 1 | 17:00 | Tuấn | Giao | KP2 / Tuyến KP2 | Combo (Pepperoni + Sườn) | Cold brew ×1 | COD | |
| 2 | 17:00 | Lan | Giao | KP2 / Tuyến KP2 | Pepperoni | Sốt bơ tỏi ×1 | CK đã nhận | |
| 3 | 17:00 | Huy | Giao | KP2 / Tuyến KP2 | Combo (Phô mai Bơ tỏi + Sườn) | | COD | |
| 4 | 18:00 | Minh | Giao | Quốc lộ / Tuyến QL-TT | Pepperoni + Sườn | Cold brew ×1 | COD | |
| 5 | 18:00 | Hoa | Giao | Thị trấn / Tuyến QL-TT | Phô mai Bơ tỏi | Sốt bơ tỏi ×1 | **CK chưa nhận** | |
| 6 | 18:00 | Phúc | Giao | Quốc lộ / Tuyến QL-TT | Sườn | Sốt BBQ khói ×1 | COD | |
| 7 | 18:00 | Vy | Giao | Thị trấn / Tuyến QL-TT | Phô mai Bơ tỏi | Sốt bơ tỏi ×1, Cold brew ×1 | COD | "Ít cay, dị ứng đậu phộng" |
| 8 | 18:00 | Khánh | Rêu | — | Pepperoni | (quà sốt bơ tỏi) | COD | |
| 9 | 18:00 | Ngọc | Giao | Thị trấn / Tuyến QL-TT | Sườn | Sốt BBQ khói ×1, Cold brew ×1 | **CK chưa nhận** | |
| 10 | 19:00 | Dũng | Rêu | — | Phô mai Bơ tỏi | (quà sốt bơ tỏi) | COD | |
| 11 | 19:00 | Trang | Giao | KP2 / Tuyến KP2 | Pepperoni | Sốt bơ tỏi ×1 | COD | |
| 12 | 19:00 | Bảo | Rêu | — | Sườn | Sốt BBQ khói ×1 (quà sốt bơ tỏi) | COD | |

**Kết quả mong đợi của `buildPrepReport`**

| Chỉ số | Giá trị |
|---|---|
| Đơn | 12 |
| Pizza | 9 (Pepperoni 5 · Phô mai Bơ tỏi 4) |
| BBQ | 6 (Sườn 6) → `ribs-bag` 6 túi ≈ 3,0 kg |
| Mozzarella / Pepperoni / Bơ tỏi phết | 1.620 g / 300 g / 160 g |
| Hũ sốt bơ tỏi | 7 (4 bán · 3 tặng) |
| Hũ sốt BBQ khói | 3 |
| Gừng hồng | 15 phần |
| Hộp pizza / Khay BBQ | 9 / 6 |
| Cold brew Rêu | 4 chai (báo cáo đối soát `reu`: 4) |
| Mẻ 17:00 (lò 16:40) | 3 Pizza + 2 BBQ · Tuyến KP2: Tuấn, Lan, Huy |
| Mẻ 18:00 (lò 17:40) | 4 Pizza + 3 BBQ · Tuyến QL-TT: Hoa, Vy, Ngọc (Thị trấn) → Minh, Phúc (Quốc lộ) · Rêu: Khánh |
| Mẻ 19:00 (lò 18:40) | 2 Pizza + 1 BBQ · Tuyến KP2: Trang · Rêu: Dũng, Bảo |
| Cảnh báo | `unpaid_transfer` #5, #9 · `allergy_note` #7 |
| Bất biến | 3+4+2 = 9 pizza · 2+3+1 = 6 BBQ |
