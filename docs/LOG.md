# Nhật ký triển khai — đọc trước khi bắt đầu phiên mới

> Mục đích: phiên sau nắm đủ bối cảnh **mà không cần đọc lại toàn bộ code**. Nguồn sự thật vẫn là `docs/BLUEPRINT.md` (v1.3); file này chỉ ghi *đã làm gì, vì sao, còn treo gì*.
> Cập nhật file này ở cuối mỗi milestone.

## Vai trò khi làm việc

Hội đồng chuyên gia: UI/UX chuẩn Apple · vận hành F&B · lập trình · thiết kế sản phẩm — kiêm **Poor Richard**: chất lượng cao nhất, tiết kiệm tokens tối đa (đọc đúng mục cần, không đọc lại thứ đã ghi ở đây, không giải thích thừa).

## Cách làm việc đã thống nhất

- Phát triển trên nhánh `claude/ecstatic-goodall-p4j7pc`, push nhánh đó. **Chỉ đưa lên `main` khi chủ quán bảo** (đã làm cho M0 bằng `git push origin HEAD:main`, fast-forward).
- Trả lời chủ quán bằng tiếng Việt; code/tên biến tiếng Anh.
- Definition of Done (§0): `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` · `CI=1 npx playwright test` đều xanh.

## Trạng thái

| Milestone | Trạng thái | Commit |
|---|---|---|
| Tài liệu (Blueprint 1.1, Marketing) | ✅ trên `main` | `f185f2a`, `8014fff` |
| **M0 — Dọn nền** | ✅ trên `main` | `1341efc` |
| **M1 — Domain lõi thuần + test** | ✅ | `04108eb` |
| **M2 — DB & DAL** | ✅ (xem commit M2) | — |
| M3 — Giao diện đặt món | ⏭ **làm tiếp** | — |

CI GitHub Actions: ✅ xanh trên `main` cho M0 (run #1, #2).

## M0 — đã làm

- **Xoá:** hero carousel, gallery, bản đồ iframe, giỏ giao hàng cũ (`delivery`), i18n (`LanguageProvider`/`data/i18n.ts`), theme toggle, ~6 MB ảnh thừa.
- **Giữ theo yêu cầu chủ quán:** Café, KOLD Gelato, Đặt bàn → route riêng **`/tai-quan`** (`app/tai-quan/page.tsx`, `components/dine-in-menu.tsx`, `components/reservation*.tsx`, `data/dine-in.ts`). Không chung catalog/giỏ với app đặt món. Đặt bàn **vẫn chỉ `console.info`** → nối DB + Telegram khi có hạ tầng M4.
- **`app/actions/reservation.ts`:** zod 4 (message = error key), `normalizePhone`, `parseVnLocal` → **đã sửa lỗi lệch múi giờ**. Form không còn setState-in-effect (`min` của datetime đặt trong `onFocus`).
- **`lib/domain/time.ts`** (đủ API §7.1 + `isISODate`, `isHHmm`, `parseVnLocal`, `toVnLocal`) và **`lib/domain/phone.ts`** (§7.7) + 18 unit test — *đã xong trước cho M1*.
- **Dữ liệu:** `data/site.ts` (brand, contact, `kitchen` = Rêu, `legal`, `dineIn`), `data/copy.ts` (mọi chuỗi UI), `lib/format.ts` chỉ còn `formatPrice`.
- **Giao diện:** chỉ dark, token §9.1 trong `app/globals.css` + **`--on-accent: #000`**; `/` là trang giữ chỗ (ảnh, gọi điện, Zalo, link `/tai-quan`) chờ M3.
- **Config:** `cacheComponents`, `reactCompiler`, AVIF/WebP, security headers + CSP không nonce (`img.vietqr.io` đã cho phép). Layout: `metadataBase` theheatpizza.vn, `viewportFit: "cover"`, skip link.
- **Tooling:** zod, drizzle-orm, postgres, jose, @node-rs/argon2, server-only; dev: drizzle-kit, babel-plugin-react-compiler, vitest, @playwright/test, @axe-core/playwright. `vitest.config.mts`, `playwright.config.ts` (iPhone 13/Pixel 7/Desktop, đều Chromium), `e2e/smoke.spec.ts` (axe serious/critical = 0, không cuộn ngang, header bảo mật), `drizzle.config.ts` (schema ở M2), `.env.example`.

## M1 — đã làm

- `lib/domain/`: `types.ts` (+ `DEFAULT_SETTINGS`), `oven-status.ts` (`computeOvenStatus`, `slotsForDay`), `capacity.ts`, `pricing.ts`, `order-status.ts` (`canTransition`, `shouldAutoConfirm`, `releasesCapacity`, `customerStage`), `prep.ts` (`buildPrepReport`), `order-code.ts` (`orderCode`, `transferMemo`, `matchTransferMemo`).
- **`data/seed.ts` = Phụ lục A** (products, ingredients, recipes, routes, zones, pickup points, slot template) → M2 seed **import lại file này**, không chép.
- Test: 76 test, coverage `lib/domain` ≈ 99,6% dòng / 97,8% nhánh; **ngưỡng 95% bắt buộc** (`vitest.config.mts`), CI chạy `npm run test:coverage`. Fixture Phụ lục B (`lib/domain/__tests__/fixtures.ts`) dựng đơn **bằng chính `priceOrder`** → khớp từng con số bảng kết quả.
- Blueprint 1.3 ghi lại các quyết định dưới đây.

## Quyết định & lý do (đừng đảo lại nếu không có lý do mới)

1. **Chữ đen trên nút cam** (`text-on-accent`): trắng/#ff3d00 = 3,54:1 trượt WCAG AA; đen ≈ 5,9:1. Áp dụng cả CTA "Đặt lò" ở M3.
2. `postgres` **3.x** (4.0 mới ra 29/10/2026). `@types/node` **^22** (Vitest 5 yêu cầu).
3. `@playwright/test` **ghim 1.63.0** + `overrides.playwright-core: 1.63.0` — khớp Chromium cài sẵn trong container và tránh 2 bản `Page` type lệch nhau.
4. Footer không in năm (`new Date()` khi prerender bị cấm với `cacheComponents`).
5. (M1) `priceOrder` **trả Result, không ném lỗi**; quà hết hàng → bỏ qua, không chặn đơn.
6. (M1) Prep trả `split`/`byProduct` **có cấu trúc** — UI tự trình bày (tên ngắn, định dạng). Điểm giao trong tuyến: theo khu vực rồi số thứ tự (Phụ lục B đã sửa cho khớp).
7. (M1) Quyền: bếp được bàn giao đơn nhận tại quầy (`ready → completed/no_show`) vì bếp = Rêu; shipper được `ready → delivering`, không được huỷ.
8. (M1) Regex chuyển khoản có `(?!\d)` để không khớp nhầm số tham chiếu ngân hàng dính liền.

## Câu hỏi đang treo cho chủ quán

1. **Ngân sách JS §13.1:** runtime Next 16 + React 19 đã ≈ 139 KB gzip (chưa có code client nào) > 110 KB. Đề xuất: tổng ≤ 180 KB *hoặc* JS của app ≤ 40 KB.
2. Địa chỉ & toạ độ Rêu; thông tin pháp lý footer (đang `TODO` trong `data/site.ts`) — **chặn ra mắt**.
3. Các mục còn lại §16 (khu vực/phí ship, BOM, VietQR…) — dùng mặc định Phụ lục A.

## M2 — đã làm

- **`lib/server/db/schema.ts`**: 18 bảng §6.2, mọi bảng `.enableRLS()` không policy. CHECK: suất mẻ (`used ≤ cap`, ≥ 0), thời gian mẻ, `orders` đúng một trong zone/pickup **khớp `fulfillment`**, `total = subtotal + ship − discount ≥ 0`, note ≤ 300, `line_total = unit_price × qty`, `short` ≤ 40. UNIQUE `(service_date, ready_at)`, `(service_date, seq)`, `(weekday, ready_time)`. Ngày = `date` mode string (`ISODate`), `numeric` mode number. Schema **không** `server-only` (drizzle-kit đọc nó).
- **`drizzle/0000_init.sql`** (sinh bởi `db:generate`). `drizzle.config.ts` tự đọc `.env.local` nếu thiếu `DIRECT_URL`.
- **`client.ts`**: `getDb()` lười (build không cần env), `prepare: false`, `max: 5`, giữ trên `globalThis`; `closeDb()`; kiểu `Executor` dùng chung cho `db`/`tx`.
- **DAL**: `settings.ts` (`loadSettings` merge mặc định; `contact` lấy từ `data/site.ts`), `catalog.ts` (`loadCatalog` + `getCatalog` `'use cache'`/`cacheLife('hours')`/`cacheTag('catalog')`, ẩn `is_active = false`, giữ món hết hàng), `schedule.ts` (`ensureBatches`, `loadServiceDays`, `getOvenStatus(now)` = hôm nay … +`daysAhead`).
- **`seed.ts`**: import `data/seed.ts`, `onConflictDoNothing` (chạy lại không ghi đè chỉnh sửa), đẩy sequence `routes/zones/pickup_points`, rồi `ensureBatches(hôm nay, daysAhead + 1)`. Script `db:seed` = `tsx --conditions=react-server …` (đã thêm `tsx` dev).
- **Integration test** `lib/server/__tests__/db.int.test.ts` (14 test): RLS, seed đủ/idempotent, catalog, ensureBatches (giờ VN, idempotent, song song), CHECK suất, `getOvenStatus` open/closing_soon/after_cutoff/day_off/last/paused. `npm run test:int` cần `TEST_DATABASE_URL` (**xoá sạch DB đó**); `npm test` loại `*.int.test.ts`. CI: service `postgres:16` → migrate → seed → test:int.
- Đã kiểm tra trong Next thật (trang tạm, đã xoá): `getCatalog` cache được, `getOvenStatus` stream trong `<Suspense>`.

## M3 — lưu ý từ M2

- `getCatalog()` dùng trong shell tĩnh → **`next build` sẽ truy vấn DB** (prerender). Vercel/CI cần `DATABASE_URL` lúc build (CI đã có).
- Chủ quán vẫn **chưa tạo Supabase** → khi có: điền `.env.local`, chạy `npm run db:migrate && npm run db:seed`.
- Cron `/api/cron/daily` (M4) gọi `ensureBatches(hôm nay, daysAhead + 1)`.

## Bẫy môi trường đã gặp

- Postgres cục bộ trong container: `/usr/lib/postgresql/16/bin`, chạy bằng user `postgres`, data ở `/var/tmp/pgdev` (scratchpad không cho user postgres truy cập), cổng 5433: `su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/pgdev/data -o '-p 5433 -k /var/tmp/pgdev' -l /var/tmp/pgdev/log start"`.

- `pkill -f "next start"` giết luôn shell của chính lệnh → exit 144. Chạy server bằng `npx next start -p 3100 &` rồi `kill $!`.
- Chụp màn hình khi server cũ còn chạy sau khi build lại → CSS lệch, ảnh sai. Luôn dừng server trước khi build.
- Đo JS: đọc `<script src>` trong `.next/server/app/index.html`, bỏ file `noModule` (polyfill).
- `next dev` tự ghi lại khối đầu `AGENTS.md` — commit nguyên như vậy.
