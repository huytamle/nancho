# Nhật ký triển khai — đọc trước khi bắt đầu phiên mới

> Mục đích: phiên sau nắm đủ bối cảnh **mà không cần đọc lại toàn bộ code**. Nguồn sự thật vẫn là `docs/BLUEPRINT.md` (v1.3); file này chỉ ghi *đã làm gì, vì sao, còn treo gì*.
> Cập nhật file này ở cuối mỗi milestone.

## Vai trò khi làm việc

Hội đồng chuyên gia: UI/UX chuẩn Apple · vận hành F&B · lập trình · thiết kế sản phẩm — kiêm **Poor Richard**: chất lượng cao nhất, tiết kiệm tokens tối đa (đọc đúng mục cần, không đọc lại thứ đã ghi ở đây, không giải thích thừa).

## Cách làm việc đã thống nhất

- Phát triển trên nhánh `claude/ecstatic-goodall-p4j7pc`, push nhánh đó. **Chỉ đưa lên `main` khi chủ quán bảo** (đã làm cho M0 bằng `git push origin HEAD:main`, fast-forward).
- Trả lời chủ quán bằng tiếng Việt; code/tên biến tiếng Anh.
- **Ưu tiên tái sử dụng (chủ quán chốt 31/10/2026):** trước khi tự code một chức năng, tìm xem đã có lời giải ổn trên GitHub / StackOverflow / tài liệu chính thức / thư viện npm có uy tín chưa — có và ổn (còn bảo trì, giấy phép phù hợp, nhẹ, không phá ngân sách JS) thì **lấy lại** (ghi nguồn trong comment/commit); không có mới tự code. Thư viện mới vẫn phải ghi lý do (§0 luật 9).
- Definition of Done (§0): `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` · `CI=1 npx playwright test` đều xanh.

## Trạng thái

| Milestone | Trạng thái | Commit |
|---|---|---|
| Tài liệu (Blueprint 1.1, Marketing) | ✅ trên `main` | `f185f2a`, `8014fff` |
| **M0 — Dọn nền** | ✅ trên `main` | `1341efc` |
| **M1 — Domain lõi thuần + test** | ✅ | `04108eb` |
| **M2 — DB & DAL** | ✅ | `bf92fda` |
| **M3 — Giao diện đặt món** | ✅ trên `main` | `5f7e70a` |
| **M4 — Đặt đơn thật** | ✅ trên `main` | `c03560b` |
| **M5 — Kitchen Dashboard** | ✅ trên `main` | xem `git log` |
| **M6 — Thanh toán, SEO, PWA** | ✅ trên `main` (31/10/2026) | xem `git log` |
| Ra mắt | ⏭ chờ chủ quán (xem "Câu hỏi đang treo") | — |
| **M7 — Vận hành: ca & két, hộp chi, chi phí, Telegram** | ✅ trên `main` (31/10/2026) | xem `git log` |
| **M8 — Checklist & Sổ tay** | ✅ trên `main` (31/10/2026) | xem `git log` |
| **M9 — Chấm công, bảng công, lương** | ✅ trên `main` (31/10/2026) | xem `git log` |
| M10–M11 (kho, chỉ số) | 📝 đặc tả ở Blueprint §17; **M10 là milestone kế tiếp** | — |

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
9. **Ngân sách JS trang `/` ≤ 180 KB gzip** (chủ quán chốt 31/10/2026; framework ≈ 139 KB, app nên ≤ 40 KB). Sau M3: ≈ 170 KB.

## Vận hành nội bộ — đã chốt (31/10/2026, Blueprint §17)

- **Không làm POS.** Café bán qua Sapo (không API) → nhân viên nhập doanh thu từ báo cáo chốt ca Sapo + ảnh. THE HEAT tại chỗ + café + pizza chung sổ.
- 2 nhân viên theo giờ, điện thoại riêng. Vai trò nhiều giá trị (`owner·manager·kitchen·server·barista·shipper`), owner/manager phân công.
- Chi phí **không** lấy từ két: hộp chi định mức 1.000.000đ, hoặc tiền túi rồi hoàn; owner/manager chi, luôn ghi. Telegram `/chi` (privacy mode bật).
- Lương theo người, kỳ tháng, không tạm ứng, trả ngày 5. Vùng III 20.000đ/giờ (thưởng & bao ăn không tính vào mức tối thiểu). Manager duyệt **bảng công** (không thấy tiền); bảng công của manager do owner gửi; xác nhận bằng PIN trên điện thoại.
- Kho 2 mức (nguyên liệu → bán thành phẩm), pizza trước (M10), café sau (M11, nhập Excel Sapo).
- Tiền vào: **pizza → TK TPBank riêng + SePay** (giữ cảnh báo "không khớp"); **café → MoMo kinh doanh** (phí ≥ 500đ/giao dịch qua dịch vụ đối soát không đáng với café biên mỏng) — nhập tay khi đóng ca.
- Pizza bán **T6–T7–CN** (`data/seed.ts`). ✅ **Đặt trước 4 ngày** (`DEFAULT_SETTINGS.ordering.daysAhead = 4`) → Thứ Hai đã thấy & đặt được mẻ Thứ Sáu. Seed không ghi đè `settings` đã có: DB đã seed trước đó (Supabase) phải chạy `UPDATE settings SET value = jsonb_set(value, '{daysAhead}', '4') WHERE key = 'ordering';` — cron daily tự sinh thêm mẻ cho ngày mới trong cửa sổ.
- Thưởng: quỹ 1% tổng doanh thu tháng (café + pizza) chia theo giờ công; tuân thủ 300.000đ/tháng. Quán đóng 22:00; dọn dẹp sau 22:00 vẫn tính giờ + phụ cấp đêm 30%; ca tối bắt đầu trễ không tính làm thêm (chỉ khi > 8 giờ/ngày).

## Câu hỏi đang treo cho chủ quán

1. Địa chỉ & toạ độ Rêu; thông tin pháp lý footer (đang `TODO` trong `data/site.ts`) — **chặn ra mắt**.
2. ✅ (31/10/2026) **Supabase ở Mumbai** (`ap-south-1`) — chủ quán chốt giữ; `/chinh-sach` đã ghi "Ấn Độ (Mumbai)". Function Vercel đã chuyển `sin1` → **`bom1`** (`vercel.json`) để cùng vùng với DB.
3. Các mục còn lại §16 (khu vực/phí ship, BOM, VietQR…) — dùng mặc định Phụ lục A.
4. Vận hành: file Excel mẫu báo cáo "bán hàng theo mặt hàng" của Sapo (cho M11). Gán vai Quản lý cho ai (trong app).

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

## M3 — đã làm

- **Trang `/`** (`app/page.tsx`): shell tĩnh `getCatalog()` + `<Suspense>` Oven Bar (`OvenBarServer` → `getOvenSnapshot(serverNow())`) + `<Suspense>` `StoreSheets` (useSearchParams). Build: `/` = Partial Prerender.
- **Snapshot lò** (`OvenSnapshot` trong `lib/domain/oven-status.ts`): `{ serverNow, status, days: DaySlots[], rules }`. Domain mới: `upcomingSlots`, `pickSlot`/`suggestSlot` (capacity), `formatPhoneInput` (phone) — có test. DAL `getOvenSnapshot`; `GET /api/oven` (cache 10 s).
- **Client stores** (`lib/client/`): `cart-store` (reducer thuần + localStorage `th_cart_v1`, giỏ hết hạn khi qua ngày, giữ thông tin khách), `oven-store` (offset đồng hồ, poll 30 s + visibility/focus, refresh khi chạm giờ chốt), `toast-store`, `use-clock` (bộ đếm 1 s/30 s dùng chung), `sheet-url` (pushState/back/replace). Catalog xuống client qua `StoreProvider` (Context).
- **UI** (`components/ui/sheet.tsx` trên `<dialog>`, kéo để đóng, `--kb` bàn phím; `stepper`, `toaster`) và `components/store/*` đúng §5.5. Mẻ đang chọn = `pickSlot(days, cart.batchId, req)` tính lúc render (không effect).
- **`placeOrder` giả** (`app/actions/order.ts`, hợp đồng ở `lib/order-contract.ts`): zod + catalog + `priceOrder` + kiểm tra suất trên snapshot → kết quả giả, không ghi DB. Production chỉ chạy khi `E2E=1`, ngược lại `server_error`. Client tự chờ đủ 3 s từ lúc mở sheet trước khi gửi (luật chống bot). Hợp đồng thêm `etaLabel`, `cutoffLabel`.
- **Đồng hồ test:** `lib/server/clock.ts` `serverNow()` đọc `TEST_NOW` (dev, hoặc production khi `E2E=1`); `db:seed` cũng dùng → `TEST_NOW=2026-11-06T10:00:00+07:00 npm run db:seed` trước e2e. CI đã thêm.
- **E2E** `e2e/order.spec.ts` (7 test × 3 thiết bị): Oven Bar, combo + add-on + giao, nhận tại Rêu + quà + chuyển khoản, Back đóng sheet, giỏ còn sau reload, link `?mon=` đóng bằng replace, hoàn tác, reduced-motion, axe ở trang + sheet. Tổng 33/33 xanh. Unit 86, int 14.
- Đo (iPhone 13, không throttle): CLS 0 lúc tải, 0,005 sau khi cuộn thu gọn thanh lò (bù bằng margin-bottom qua ResizeObserver).

## M4 — lưu ý từ M3

- Thay thân `placeOrder` (giữ nguyên chữ ký & `PlaceOrderResult`): bỏ `stubEnabled`, `seq` ngẫu nhiên, `trackingPath: "/"` (màn thành công ẩn nút "Theo dõi đơn" khi path = "/").
- `lookupCustomer` chưa có — ô SĐT chỉ định dạng/kiểm tra. `requiresPrepay` chưa khoá COD.
- e2e "mẻ kín → chuyển mẻ gợi ý" cần ghi DB → làm ở M4 (UI banner `slot_full` + chip thay thế đã có).
- Footer chưa link `/chinh-sach` (M6).

## M4 — đã làm

- **Lõi** `lib/server/dal/orders.ts`: `placeOrderCore` (replay idempotency → catalog/giá → chặn/trả trước → địa chỉ (gõ mới hoặc `savedAddressToken`) → transaction {UPDATE giữ suất có điều kiện, `order_seq`, upsert khách, `addresses` nếu ghi nhớ, order + items (add-on có `parent_item_id`) + events, tự xác nhận khách quen} → tin Telegram), `cancelOrderByTokenCore` (FOR UPDATE, `canTransition`, trả suất một lần), `getOrderView` (DTO biên nhận + `reorder`). Lỗi unique `idempotency_key` khi gửi trùng song song → trả đơn của lần thắng.
- **Action** `app/actions/order.ts` (`placeOrder`, `cancelOrderByToken`) & `app/actions/customer.ts` (`lookupCustomer`): zod → rate-limit (`order:ip` 5/10′, `order:phone` 3/10′, `lookup` 5/10′ + 30/ngày, `cancel` 10/10′) → DAL → cookie `th_c` (đặt khi bật Ghi nhớ, xoá khi tắt) → `after()` gửi Telegram. Log JSON che SĐT (`091****678`).
- **Hạ tầng:** `lib/server/rate-limit.ts` (UPSERT cửa sổ cố định, `clientIp()` từ `x-forwarded-for`), `customer-cookie.ts` (HMAC, `purpose` trong chữ ký; dev có secret mặc định, production bắt buộc `CUSTOMER_COOKIE_SECRET` ≥ 32), `notify/messages.ts` (thuần, có test) + `notify/telegram.ts`. Domain thêm `requiresPrepay`.
- **UI:** checkout tra SĐT (debounce 300 ms, cả khi mở sheet với SĐT trong nháp), chào khách cũ + [Dùng địa chỉ này]/[Nhập địa chỉ khác], tự điền khi có cookie, khoá COD khi phải trả trước, banner `prepay_required`/`rate_limited`/`contact_us`. `/o/[token]` (PPR: header tĩnh, đơn stream): tiến độ, chi tiết, CK chờ trả, gọi/Zalo, huỷ có xác nhận, poll 30 s, "Đặt lại đơn này", nút Google review khi có `site.reviewUrl`. "Theo dõi đơn" thay URL về `/` trước để Back không mở sheet trống.
- **Sửa primitive Sheet:** đóng `<dialog>` trong cleanup — Next giữ trang cũ trong `<Activity>`, dialog modal còn trên top layer sẽ chặn trang mới.
- **Test:** unit 91 · int 28 (`orders.int.test.ts`: đua tranh 10→3, idempotency kể cả song song, huỷ song song trả suất 1 lần, cutoff/paused, khách quen/bom/chặn, token địa chỉ: khách khác/hết hạn/giả mạo bị từ chối, máy lạ không lộ mô tả nhà) · e2e 42/42 (thêm: mẻ kín → chạm mẻ gợi ý, theo dõi + huỷ, khách cũ cookie/máy lạ). JS `/` ≈ 167 KB gzip.

## M5 — lưu ý từ M4

- Telegram link đơn: `/admin/kitchen?ngay=<date>&tab=don` — dashboard nên nhận đúng query này.
- Action admin đổi trạng thái nhớ cập nhật `customers.completed_count`/`no_show_count` (tự xác nhận & trả trước dựa vào đó).
- Cron daily: dọn `rate_limits` cũ (chưa làm).
- VietQR (`qrUrl` đang rỗng) ở M6. Chưa có Telegram thật để đo "≤ 3 s" — cần chủ quán tạo bot + nhóm, điền `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`.

## M5 — đã làm

- **Auth:** `lib/server/auth/session.ts` (JWT `jose`, cookie `th_s`, `currentStaff` = `cache()`, `requireStaff(roles?)`), `dal/staff.ts` (argon2, chống dò id bằng băm giả), `app/actions/auth.ts` (rate-limit `login:ip` 5/15′), `proxy.ts` (lạc quan), `/admin/login` (chọn tên → PIN 6 số, bàn phím số lớn), script `npm run staff`.
- **Dashboard** `/admin/kitchen?ngay=&tab=` (tab: `chuan-bi · me · don · giao · cai-dat`; shipper chỉ `giao`, kitchen không có `cai-dat`): `components/admin/*` — `kitchen-dashboard` (refresh 20 s, "Cập nhật x giây trước", banner ngoại tuyến, toast + ding đơn mới, huy hiệu tab Đơn, tab đổi bằng `history.replaceState`), `prep-board` (tick "đã lấy" localStorage theo ngày), `batch-board`, `order-list` + `order-detail-sheet` (nút trạng thái tính bằng `canTransition` phía client), `delivery-board` (copy shipper, bắt đầu tuyến, đã giao/bom, quầy Rêu, chỉ đường), `quick-order-sheet`, `settings-panel`, `wake-lock`. Bản in `/admin/kitchen/in` (A5 / `?kho=80`).
- **Action** `app/actions/admin.ts`: helper `run(schema, raw, roles, fn)` → zod → quyền → DAL → `refresh()`. `toggleProduct` gọi `updateTag('catalog')`. Schema zod của đơn chuyển sang `lib/server/order-input.ts` (dùng chung web + đơn nhanh).
- **Cron** `GET /api/cron/daily` (Bearer `CRON_SECRET`, so sánh hằng thời gian) + `vercel.json` (region `bom1` từ 31/10/2026, 15:45 VN).
- **Test:** unit 102 (`lib/__tests__/kitchen-text.test.ts`: Bảng Tổng Hợp Phụ lục B từng dòng) · int 42 (`admin.int.test.ts`: vòng đời + bộ đếm khách, quyền, huỷ trả suất 1 lần, mẻ, đã trả, đổi mẻ, sức chứa, đơn nhanh/vượt chốt, cron gửi 1 lần + thử lại, dọn rate-limit, PIN, JWT) · e2e 57/57 (`e2e/kitchen.spec.ts`: redirect login/sai PIN, Phụ lục B trên tab Chuẩn bị, Đút lò/Ra lò, shipper chỉ tab Giao + giao tuyến, link Telegram + đơn nhanh, axe, không tràn ngang). `e2e/db.ts` thêm `seedStaff()` (PIN 123456) và `seedAppendixB()` (dùng fixture domain). JS `/` ≈ 171 KB gzip.

## M6 — lưu ý từ M5

- Chủ quán cần: tạo nhân viên bằng `npm run staff`, đặt `SESSION_SECRET` + `CRON_SECRET` trên hosting; điền `site.kitchen.coords` để link chỉ đường xuất phát từ Rêu.
- SePay webhook nên gọi lại logic `markPaidCore` (ghi `payments`, tự xác nhận) — đổi `provider`/`providerTxnId`.
- Hoàn tất đơn COD **không** tự chuyển `payment_status = paid` (chưa có yêu cầu) — cân nhắc khi làm đối soát.
- Toast "Đơn mới" cũng kêu cho đơn do chính nhân viên vừa nhập (máy khác cần nghe) — chấp nhận.

## M6 — đã làm

- **VietQR** (`lib/payments.ts` thuần + `lib/server/payments/vietqr.ts` đọc env): link `img.vietqr.io/image/<BIN>-<STK>-compact2.png?amount&addInfo&accountName`. Gói npm `vietqr` đã xem — chỉ nối chuỗi y hệt nhưng kéo axios + API key → tự viết 1 hàm. Khối `components/store/transfer-box.tsx` dùng chung màn thành công + `/o/[token]` (QR, STK, chủ TK, Lưu QR, Sao chép STK/nội dung). Thiếu env → chỉ số tiền + nội dung (như M4).
- **SePay** `POST /api/webhooks/sepay` → `recordSepayCore` (`lib/server/payments/sepay.ts`): header `Authorization: Apikey <SEPAY_WEBHOOK_KEY>` (so sánh hằng thời gian), zod payload, idempotent `sepay:<id>`, cộng dồn nhiều lần chuyển, `settlePaid` tách từ `markPaidCore` (dùng chung). Telegram 💰/thiếu/dư/không khớp (`paymentText`). Gói `sepay-pg-node` chính thức là cổng thanh toán (khác webhook ngân hàng) → không dùng.
- **Trả trước theo rủi ro**: đã có từ M4 (`requiresPrepay`) — giữ nguyên.
- **SEO**: `/m/[slug]` (PPR, `generateStaticParams`, OG riêng 1200×630 có ảnh món/giá; font Be Vietnam Pro OFL trong `assets/og/` lấy từ `@fontsource`), `StorePage` dùng chung với `/`; JSON-LD `Restaurant` + `hasMenu` + `OrderAction` (bỏ trường còn TODO); `robots.ts`, `sitemap.ts`, `manifest.ts` + icon 192/512/maskable/apple (cắt từ `logo-mark.jpg` bằng sharp, `public/icons/`).
- **Analytics + `?src=`**: `proxy.ts` ghi `th_src` (chỉ chạy khi URL có `src`), `placeOrder` lưu `orders.source`. `@vercel/analytics` (MIT, ~1–2 KB) — `<Analytics>` chỉ render khi `VERCEL`; sự kiện `view_item · add_to_cart · begin_checkout · lookup_known · place_order · slot_full · cancel_order` kèm `src` (`lib/client/analytics.ts`), URL `/o/<token>` bị che.
- **`/chinh-sach`**: bảo mật + điều khoản, link ở footer & form chốt đơn. Thời hạn lưu ở `lib/privacy.ts`; cron daily **thực sự** xoá địa chỉ/toạ độ của đơn > 90 ngày (`addressesAnonymized`).
- **`instrumentation.ts`**: `onRequestError` → Telegram ≤ 1 tin/phút/instance, che token/query.
- **Test:** unit 111 (`lib/__tests__/payments.test.ts`, tin thanh toán) · int 49 (`sepay.int.test.ts`: đủ/thiếu/dư/huỷ/không khớp/tiền ra/gửi lại song song, COD→CK, cron xoá địa chỉ) · e2e 72/72 (thêm `e2e/m6.spec.ts`: /m + OG, ?src → đơn, VietQR, webhook 401/400/200/idempotent → paid + xác nhận, /chinh-sach axe, robots/sitemap/manifest/JSON-LD). JS `/` ≈ 175 KB gzip. Lighthouse mobile (bản `next start` trong sandbox, 2 lần): Performance 87–95 · Accessibility 100 · Best practices 100 · SEO 100. Thêm `app/favicon.ico` (hết lỗi 404 console) và `fetchPriority=high` cho ảnh LCP.

## Sau M6 — việc của chủ quán trước ra mắt

- Điền `.env`/Vercel: `VIETQR_*`, `SEPAY_WEBHOOK_KEY` (+ cấu hình webhook trong SePay tới `/api/webhooks/sepay`, chứng thực API Key), `TELEGRAM_*`, `SESSION_SECRET`, `CRON_SECRET`, `CUSTOMER_COOKIE_SECRET`.
- **Thử thật**: chuyển 1 khoản nhỏ với nội dung mã đơn → kiểm tra đơn tự `paid` + tin 💰. Tài liệu SePay/VietQR **không truy cập được từ sandbox** khi làm M6 → tên trường payload theo tài liệu SePay quen thuộc (id, content, transferType, transferAmount…); zod để `loose` nên trường lạ không làm hỏng, nhưng nếu SePay đổi tên trường thì log `sepay` sẽ báo 400.
- Nhờ người có chuyên môn pháp lý rà `/chinh-sach` (cam kết "xử lý trong 72 giờ", hoàn tiền) — sửa trực tiếp trong `app/chinh-sach/page.tsx`.
- Lighthouse mobile: chạy lại trên domain thật (Vercel) — trong sandbox chỉ đo được bản `next start` cục bộ.

## M7 — đã làm

- **Vai trò nhiều giá trị:** `staff.roles` (`owner·manager·kitchen·server·barista·shipper`), migration `0001_ops` chép `role` cũ → `0002_drop_staff_role`. `lib/domain/roles.ts`: `orderRoles` (manager = kitchen ở bếp), `canTransitionAs` (người kiêm bếp + giao), `canAssignRoles` (manager không đụng owner/manager; owner không tự bỏ owner). Phiên `Staff = { roles, role, orderRoles }`; chỉ phục vụ/pha chế → đăng nhập vào `/admin/van-hanh`; bếp có link "Vận hành" và ngược lại. Script: `npm run staff -- "Tên" owner,barista 123456`.
- **`/admin/van-hanh`** (tab Ca & két · Chi phí (owner/manager) · Nhân viên): mở ca đếm két theo mệnh giá; đóng ca = doanh thu Sapo (TM · CK/MoMo · khác) + **ảnh Sapo bắt buộc khi có doanh thu café** + đếm két + nộp về chủ (ghi sau lần đếm) → **đếm mù**, kết quả lệch hiện sau khi gửi + Telegram. Số đáng có = đầu ca + TM café + COD pizza hoàn tất trong ca − nộp giữa ca. Mở ca so với số để lại ca trước. Hộp chi định mức 1.000.000đ: kiểm hộp, owner [Nạp bù] đúng tổng chứng từ. Owner sửa ngưỡng lệch / định mức.
- **Chi phí:** form trong app (ô tiền đọc "150k/1tr2", nhóm tự đoán, nguồn Hộp chi/Tiền túi/CK, ảnh) + bot Telegram `/chi`, `/chihuy`, `/tonghop`, `/start <mã>` (liên kết 10 phút, HMAC), ảnh trả lời tin xác nhận = đính kèm, nút Đổi nhóm/Huỷ. Tiền túi: duyệt → hoàn (hộp chi/CK); manager không tự duyệt. Huỷ: người ghi trong 24 giờ, owner luôn được; đã nạp bù/đã hoàn thì khoá. Cron ngày 1: tổng chi tháng trước (một lần).
- **Ảnh** ở bảng `ops_files` (bytea ≤ 1 MB, client nén JPEG) + `GET /api/ops/files/[id]` cần phiên — thay Supabase Storage (không thêm env/dịch vụ).
- **Test:** unit 155 (`lib/domain/__tests__/ops.test.ts`) · int 60 (`ops.int.test.ts`: két/COD/nộp/đếm mù, hộp chi + nạp bù + hoàn túi, quyền, 24 giờ, tổng tháng, cron, phân công, bot: ghi/ảnh/trùng update/nút/huỷ/tổng hợp/nhóm lạ/chưa liên kết/liên kết) · e2e 84/84 (`e2e/ops.spec.ts`). JS `/` ≈ 175,5 KB gzip (chuỗi vận hành tách sang `data/copy-ops.ts`).

## M7 — việc của chủ quán để bật

1. Hosting: thêm `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` (tự đặt, ≥ 32 ký tự chữ/số), tuỳ chọn `TELEGRAM_OPS_CHAT_ID` (nhóm chi phí riêng). Chạy `npm run db:migrate`.
2. Đăng ký webhook một lần: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://theheatpizza.vn/api/webhooks/telegram&secret_token=<SECRET>`. Giữ **privacy mode bật** trong @BotFather (bot chỉ đọc lệnh `/…`).
3. Mỗi người: đăng nhập app → Vận hành → Nhân viên → [Liên kết Telegram]. Gán vai Quản lý trong cùng tab.
4. Đặt 1.000.000đ vào hộp chi; ca đầu tiên đếm két như thường (lần đầu không có số so).

## M8 — lưu ý từ M7

- Tab mới thêm vào `opsTabsFor` (`components/ops/ops-dashboard.tsx`) và `opsCopy.tabs`. Quyền theo vai nằm ở DTO `loadOpsView` + DAL — giữ nguyên nguyên tắc này cho lương (manager không thấy tiền).
- `ops_events` đã có — dùng cho log xem sổ tay, sửa giờ công.

## M8 — đã làm

- **Bảng** (migration `0003_checklist_handbook`): `checklist_templates` (roles[], moment `open·during·close·weekly`, items jsonb), `checklist_runs` (UNIQUE mẫu + ngày; `done` = `{ itemId: { by, at, value?, photo? } }`), `handbook_pages` (slug unique, kind `sop·recipe`, roles[], body Markdown ≤ 20k, `product_id`, `version`). Seed mẫu: Mở ca bếp/quầy, Nhiệt độ tủ, Đóng ca (Lau sàn cần ảnh), Vệ sinh tuần; 5 trang sổ tay (`data/seed-ops.ts`).
- **Domain** `lib/domain/checklist.ts` + 8 test (coverage chung `lib/domain` 99,8%). Văn bản cảnh báo ở `lib/ops-text.ts` (`checklistAlertText`).
- **Tab "Việc"** (`components/ops/checklist-panel.tsx`): tick có `useOptimistic`, mục số đo (chấp nhận "4,5", nút ± vì bàn phím số iOS thiếu dấu trừ), mục ảnh chụp xong tự đánh dấu, ngoài ngưỡng → chữ đỏ + toast + Telegram. Owner/manager sửa mẫu (`checklist-editor.tsx`, mỗi mẫu một `<details>`; tắt mẫu thay vì xoá).
- **Tab "Sổ tay"** (`handbook-panel.tsx` là Server Component, `handbook-editor.tsx` client): danh sách theo Quy trình/Công thức, trang công thức hiện bảng định lượng từ `recipe_lines`, watermark tên + ngày (SVG — không bị axe tính tương phản, không chọn chữ được), log lượt xem. Đổi tab giữ `trang=` (prop `bookPage`).
- **Đóng ca**: lượt `close` chưa xong → hiện cảnh báo, nút thành "Vẫn đóng ca" (không chặn).
- **CSS**: `.md` cho HTML sổ tay; `select.input` giờ tự `appearance: none` + mũi tên không lặp (trước đó select nào thiếu `bg-no-repeat` sẽ lặp hình mũi tên). Hằng class màn Vận hành chuyển sang `components/ops/styles.ts` (Server Component không import được hằng từ file `"use client"`).
- **Test:** unit 163 · int 74 (`handbook.int.test.ts` 14: quyền DTO, ngưỡng → Telegram, ảnh, bỏ tick, song song, lượt tuần, sửa mẫu, recipe_lines là nguồn duy nhất, slug trùng/version, Markdown chặn `<script>`/`javascript:`/ảnh ngoài) · e2e 93/93 (`e2e/m8.spec.ts` + `ops.spec` thêm bước "Vẫn đóng ca").
- **JS `/`**: M8 thêm ≈ 0,1 KB (3 chuỗi lỗi trong `copy.ts`). Lưu ý: cách đo "cộng gzip mọi `<script src>` không `noModule` trong `index.html`" cho **214,3 KB cả trước lẫn sau M8** — khác con số ≈ 175 KB ghi ở M3–M7 (cách đo cũ chưa rõ). Cần chốt lại một cách đo duy nhất (đề xuất: Lighthouse/`next build` trên Vercel) trước khi so với ngân sách 180 KB.

## M8 — việc của chủ quán để bật

1. `npm run db:migrate && npm run db:seed` (seed chỉ thêm mẫu checklist/sổ tay còn thiếu, không đè dữ liệu).
2. Vào Vận hành → Việc / Sổ tay sửa mẫu & nội dung cho đúng quán (nhiệt độ lò, bước làm bánh). Định lượng pizza sửa ở công thức bếp (`recipe_lines`), sổ tay tự theo.

## M9 — lưu ý từ M8

- Tỉ lệ hoàn thành checklist cho thưởng tuân thủ: tính từ `checklist_runs` + `progress(items hiện tại, done)` — đừng dùng `completed_at` (mẫu có thể đã thêm mục sau khi lượt xong).
- Lỗi action thêm: `value_required`, `photo_needed`, `duplicate` (`lib/admin-contract.ts`, chuỗi ở `copy.admin.errors`).

## M9 — đã làm

- **Bảng** (migration `0004_payroll`): `time_entries`, `shift_plans`, `holidays`, `pay_rates`, `timesheets`, `payslips` (chi tiết ràng buộc ở Blueprint M9). `settings.ops.storeIps` + key mới `payroll` (`DEFAULT_PAYROLL` trong `lib/domain/payroll.ts`). `saveOpsSettingsCore` giờ **gộp** với giá trị cũ (trước đó ghi đè cả object → sẽ mất `storeIps`).
- **Domain** `worktime.ts` (tính theo từng phút: đêm 22–06, lễ theo ngày của phút, làm thêm khi ngày công > 8 giờ, đi muộn/về sớm, `late_out`, quên ra ca, kỳ tháng) + `payroll.ts` (dòng lương theo đơn giá có lịch sử, quỹ 1% chia số dư lớn nhất, tiêu chí tuân thủ, `canManageTime`, `canonicalJson`). Ví dụ Blueprint khớp: 16:00–22:15 = 6 giờ 15 phút không làm thêm; 20 phút sau 22:00 × 20.000đ × 30% = 2.000đ.
- **DAL** `lib/server/dal/payroll.ts`; **action** `app/actions/time.ts`; khung action chung `lib/server/ops/run.ts` (`runOps`, `notifyOps`) — `app/actions/ops.ts` dùng lại.
- **UI** tab **Công** (`components/ops/time-panel.tsx`): thẻ Vào/Ra ca, lịch tuần, giờ công tháng, bảng công chờ xác nhận (PIN + "Chưa đồng ý"), phiếu lương của mình (In/lưu PDF — `printCard()` + CSS `@media print` chỉ in thẻ đó, [Đã nhận lương]); owner/manager thêm: Cần xem lại, Bảng công tháng (gửi, sửa/thêm lượt), Lịch ca tuần (giờ bắt đầu–kết thúc, Chép tuần trước), Wi-Fi quán. Tab **Lương** (owner, `payroll-panel.tsx`): doanh thu + quỹ, tính phiếu, sửa tuân thủ/điều chỉnh, duyệt, đã trả (CK/tiền mặt), đơn giá giờ, ngày lễ, cài đặt lương. Thanh tab > 5 mục (owner 7, manager 6) dùng chữ 13px, cho xuống 2 dòng.
- **Cron** `runPayrollCron` gọi trong `/api/cron/daily`.
- **Test:** unit 185 (`lib/domain/__tests__/payroll.test.ts` 22; `worktime.ts`/`payroll.ts` 100% dòng) · int 96 (`payroll.int.test.ts` 22: vào/ra ca + bấm đúp song song, Wi-Fi quán, `late_out`/`off_site`, quên ra ca (cron + vào ca hôm sau), sửa giờ có lý do/không tự sửa/công quản lý do owner/chồng lượt, lịch + chép tuần, gửi → PIN → khoá, chưa đồng ý → nháp, **DTO quản lý không có trường tiền**, đơn giá ≥ tối thiểu + lịch sử, phiếu lương 2 đơn giá + Tết ×3 + đêm, quỹ 1% chia đủ, sửa tuân thủ/điều chỉnh, duyệt → trả → đã nhận, cron ngày 1/3/5) · e2e 99/99 (`e2e/m9.spec.ts`: vào/ra ca; quản lý gửi bảng công → nhân viên xác nhận PIN → owner đơn giá → tính → duyệt → CK → nhân viên đã nhận; axe; không tràn ngang).
- **Bẫy:** ô `type="time"`/`date` trên Chromium mobile có bề rộng nội tại lớn → trong grid dùng `minmax(0,1fr)` + `min-w-0`. Kiểm tra "không tràn ngang" phải so `scrollWidth` với **bề rộng viewport** (`page.viewportSize()`), không phải `innerWidth` (Chromium mobile tự thu nhỏ trang khi tràn nên innerWidth tăng theo) — `e2e/m9.spec.ts` đã dùng cách mới; các spec cũ vẫn cách cũ.
- `copy.admin.errors.locked` đổi thành chung "Đã khoá — không sửa được nữa." (dùng cho cả chứng từ lẫn bảng công).

## M9 — việc của chủ quán để bật

1. `npm run db:migrate` (migration `0004_payroll`). Không có env mới.
2. Tab **Lương**: nhập đơn giá giờ từng người (≥ 20.000đ — vùng III), ngày lễ năm nay (Tết âm lịch!), kiểm tra cài đặt thưởng.
3. Tab **Công**: đang ở quán, bắt Wi-Fi quán → [Đây là Wi-Fi quán]; xếp lịch ca tuần (Chép tuần trước cho tuần sau).
4. Hợp đồng lao động nên có điều khoản đồng ý xác nhận bảng công/lương qua ứng dụng (§17.7).

## M10 — lưu ý từ M9

- Chỉ số §17.10 "doanh thu/giờ công", "chi phí nhân sự %": giờ công lấy `timesheets.minutes` (đã gửi) hoặc `computeTimesheet` (nháp); tiền lương = `payslips.total` — **chỉ owner** (`loadPayrollView` trả null cho người khác; giữ nguyên nguyên tắc ở DTO).
- `periodRevenue(period)` (pizza hoàn tất + café Sapo) đã có ở `dal/payroll.ts` — dùng lại.
- Chủ quán cần: nhập đơn giá giờ cho từng người (tab Lương) trước ngày 1 tháng sau; nhập ngày lễ (Tết âm lịch!); vào quán bấm [Đây là Wi-Fi quán]; xếp lịch ca tuần để có đi muộn/`late_out`.

## Bẫy môi trường đã gặp

- Postgres cục bộ trong container: `/usr/lib/postgresql/16/bin`, chạy bằng user `postgres`, data ở `/var/tmp/pgdev` (scratchpad không cho user postgres truy cập), cổng 5433: `su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/pgdev/data -o '-p 5433 -k /var/tmp/pgdev' -l /var/tmp/pgdev/log start"`.

- `pkill -f "next start"` giết luôn shell của chính lệnh → exit 144. Chạy server bằng `npx next start -p 3100 &`; `kill $!` chỉ giết `npx`, **tiến trình `next-server` vẫn giữ cổng** → tìm trong `/proc/*/cmdline` dòng bắt đầu `next-server` rồi kill.
- E2E giờ cần `DATABASE_URL` trong tiến trình Playwright (dọn DB mỗi test). Đồng hồ `TEST_NOW` chạy tiếp theo thời gian thật → đừng khẳng định số phút đếm ngược cứng.
- Ở trang `/o/...` sau khi bấm Link, phần tử của trang `/` vẫn nằm ẩn trong DOM (Activity) → locator `getByText` có thể trùng; giới hạn trong `getByRole("article")`.
- Chụp màn hình khi server cũ còn chạy sau khi build lại → CSS lệch, ảnh sai. Luôn dừng server trước khi build.
- Đo JS: đọc `<script src>` trong `.next/server/app/index.html`, bỏ file `noModule` (polyfill).
- `next dev` tự ghi lại khối đầu `AGENTS.md` — commit nguyên như vậy.
- DB local: `DATABASE_URL=postgres://postgres:postgres@localhost:5433/heat` (int test: `…/heat_test`). `.env.local` để trống DB (chờ Supabase) → truyền biến khi chạy lệnh.
- Lớp `.input` (CSS thường, ngoài `@layer`) **thắng** utility Tailwind 4 (`w-auto`, `pr-8`, `bg-surface`…) → dùng `!w-auto`, `!pr-9`. Select rộng 100% từng làm trang admin tràn ngang → trình duyệt mobile thu nhỏ trang và Playwright bấm trượt.
- Login rate-limit 5/15′/IP: chạy script đăng nhập nhiều lần → `DELETE FROM rate_limits`.
- `next build` đọc `DATABASE_URL` trong `.env.local` (giờ đã là Supabase, sandbox không phân giải được) → luôn truyền `DATABASE_URL=…5433/heat` khi build/e2e.
- e2e ghi bảng `payments` (webhook) → `resetOrders` xoá cả `payments`; id giao dịch SePay trùng giữa các lần chạy sẽ thành `duplicate`.
- Ngày/giờ trong `sql\`…\`` thô của drizzle phải truyền `date.toISOString()` + `::timestamptz` (truyền `Date` thẳng → lỗi `ERR_INVALID_ARG_TYPE`).
- `drizzle-kit generate` hỏi đổi tên (cần TTY) khi vừa thêm vừa bỏ cột/enum → tách 2 migration (thêm trước, bỏ sau).
- Int test **không** gọi `seed()` ở ngày khác 07/11 — `db.int` đếm `service_days` toàn bảng, thứ tự file của Vitest thay đổi theo thời gian chạy → dùng `seedStatic()` nếu chỉ cần dữ liệu tĩnh.
- `git worktree` + symlink `node_modules` → Turbopack panic ("points out of the filesystem root"). So sánh bản cũ bằng `git stash -u` → build → `git stash pop`.
- Script Playwright ngoài repo: `createRequire("/home/user/nancho/")("@playwright/test")` (gói `playwright` không resolve từ scratchpad).
