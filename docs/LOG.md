# Nhật ký triển khai — đọc trước khi bắt đầu phiên mới

> Mục đích: phiên sau nắm đủ bối cảnh **mà không cần đọc lại toàn bộ code**. Nguồn sự thật vẫn là `docs/BLUEPRINT.md` (v1.2); file này chỉ ghi *đã làm gì, vì sao, còn treo gì*.
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
| M1 — Domain lõi thuần + test | ⏭ **làm tiếp** | — |

CI GitHub Actions (`.github/workflows/ci.yml`) **chưa được xác nhận chạy xanh trên GitHub** (mới chỉ chạy local) → xem tab Actions khi bắt đầu M1.

## M0 — đã làm

- **Xoá:** hero carousel, gallery, bản đồ iframe, giỏ giao hàng cũ (`delivery`), i18n (`LanguageProvider`/`data/i18n.ts`), theme toggle, ~6 MB ảnh thừa.
- **Giữ theo yêu cầu chủ quán:** Café, KOLD Gelato, Đặt bàn → route riêng **`/tai-quan`** (`app/tai-quan/page.tsx`, `components/dine-in-menu.tsx`, `components/reservation*.tsx`, `data/dine-in.ts`). Không chung catalog/giỏ với app đặt món. Đặt bàn **vẫn chỉ `console.info`** → nối DB + Telegram khi có hạ tầng M4.
- **`app/actions/reservation.ts`:** zod 4 (message = error key), `normalizePhone`, `parseVnLocal` → **đã sửa lỗi lệch múi giờ**. Form không còn setState-in-effect (`min` của datetime đặt trong `onFocus`).
- **`lib/domain/time.ts`** (đủ API §7.1 + `isISODate`, `isHHmm`, `parseVnLocal`, `toVnLocal`) và **`lib/domain/phone.ts`** (§7.7) + 18 unit test — *đã xong trước cho M1*.
- **Dữ liệu:** `data/site.ts` (brand, contact, `kitchen` = Rêu, `legal`, `dineIn`), `data/copy.ts` (mọi chuỗi UI), `lib/format.ts` chỉ còn `formatPrice`.
- **Giao diện:** chỉ dark, token §9.1 trong `app/globals.css` + **`--on-accent: #000`**; `/` là trang giữ chỗ (ảnh, gọi điện, Zalo, link `/tai-quan`) chờ M3.
- **Config:** `cacheComponents`, `reactCompiler`, AVIF/WebP, security headers + CSP không nonce (`img.vietqr.io` đã cho phép). Layout: `metadataBase` theheatpizza.vn, `viewportFit: "cover"`, skip link.
- **Tooling:** zod, drizzle-orm, postgres, jose, @node-rs/argon2, server-only; dev: drizzle-kit, babel-plugin-react-compiler, vitest, @playwright/test, @axe-core/playwright. `vitest.config.mts`, `playwright.config.ts` (iPhone 13/Pixel 7/Desktop, đều Chromium), `e2e/smoke.spec.ts` (axe serious/critical = 0, không cuộn ngang, header bảo mật), `drizzle.config.ts` (schema ở M2), `.env.example`.

## Quyết định & lý do (đừng đảo lại nếu không có lý do mới)

1. **Chữ đen trên nút cam** (`text-on-accent`): trắng/#ff3d00 = 3,54:1 trượt WCAG AA; đen ≈ 5,9:1. Áp dụng cả CTA "Đặt lò" ở M3.
2. `postgres` **3.x** (4.0 mới ra 29/10/2026). `@types/node` **^22** (Vitest 5 yêu cầu).
3. `@playwright/test` **ghim 1.63.0** + `overrides.playwright-core: 1.63.0` — khớp Chromium cài sẵn trong container và tránh 2 bản `Page` type lệch nhau.
4. Footer không in năm (`new Date()` khi prerender bị cấm với `cacheComponents`).

## Câu hỏi đang treo cho chủ quán

1. **Ngân sách JS §13.1:** runtime Next 16 + React 19 đã ≈ 139 KB gzip (chưa có code client nào) > 110 KB. Đề xuất: tổng ≤ 180 KB *hoặc* JS của app ≤ 40 KB.
2. Địa chỉ & toạ độ Rêu; thông tin pháp lý footer (đang `TODO` trong `data/site.ts`) — **chặn ra mắt**.
3. Các mục còn lại §16 (khu vực/phí ship, BOM, VietQR…) — dùng mặc định Phụ lục A.

## M1 — việc cần làm (BLUEPRINT §7, §14, §15)

- `lib/domain/types.ts` (Product, Zone, PickupPoint, Batch, SlotView, OvenStatus, Settings…), `oven-status.ts` (§7.2), `capacity.ts` (§7.3), `pricing.ts` (§7.4), `order-status.ts` + `canTransition` (§7.5), `prep.ts` (§7.6), `order-code.ts` (§7.8).
- Fixture **Phụ lục A** (catalog, BOM, lịch, khu vực) + **Phụ lục B** (12 đơn 06/11/2026) trong `lib/domain/__tests__/fixtures.ts`; test `buildPrepReport` khớp **từng con số** bảng kết quả Phụ lục B.
- Coverage `lib/domain` ≥ 95% → **cần cài `@vitest/coverage-v8`** (chưa có) + script `test:coverage`.
- Ràng buộc: thuần (không import DB/Next/React), mọi hàm nhận `now`, tiền là integer.

## Bẫy môi trường đã gặp

- `pkill -f "next start"` giết luôn shell của chính lệnh → exit 144. Chạy server bằng `npx next start -p 3100 &` rồi `kill $!`.
- Chụp màn hình khi server cũ còn chạy sau khi build lại → CSS lệch, ảnh sai. Luôn dừng server trước khi build.
- Đo JS: đọc `<script src>` trong `.next/server/app/index.html`, bỏ file `noModule` (polyfill).
- `next dev` tự ghi lại khối đầu `AGENTS.md` — commit nguyên như vậy.
