# M12 — Landing kể chuyện · Clerk cho khách & nội bộ · kế hoạch theo phiên

> Bản kiến trúc để chủ quán duyệt **trước khi code tiếp**. Duyệt xong → gộp mục "Kiến trúc" vào `BLUEPRINT.md` (§5.4 route, §9 landing, §15 M12) và ghi trạng thái vào `LOG.md`, rồi xoá file này.
> **Chủ quán chốt (31/10/2026):** A = site gốc · B = giữ sáng/tối · C = chỉ điều khách cảm nhận · D = khoá Clerk bổ sung sau · **bỏ đo JS** (không còn cổng 180 KB). Ưu tiên: landing bản sắc → Thực đơn → Đặt hàng → khách đặt được.
> **Đã xong (S4+S5 gộp, 01/11/2026):** hero chữ THE HEAT khổng lồ + bánh trong vòng chữ xoay (tham khảo KOI Thé), kicker `// 0n`, chữ hiện theo từ, dải chạy (tham khảo JS Mastery); thứ tự 01 Câu chuyện · 02 Thực đơn · 03 Đặt hàng (khung "Đơn của bạn" → Chốt đơn) · 04 Ưu đãi · 05 Hành trình (`data/journey.ts`) · 06 Hỏi đáp; logo dùng một bản nền đen bo góc. Supabase đã chạy migration 0008 + seed. Đã thử đặt → theo dõi → huỷ thật trên dev. Lint · typecheck · 252 unit · build xanh; axe 0 lỗi serious (sáng/tối × giảm chuyển động). **Chưa chạy e2e** (cần Postgres cục bộ — e2e xoá DB).
> Ngày: 31/10/2026 · nhánh `m12-landing-auth-promo` (đã có commit WIP `3464b69` + ~35 file chưa commit; typecheck ✅, unit 252 ✅, chưa chạy build/e2e).

---

## 1. Đã làm (M0 → M11, tất cả trên `main`)

| Mảng | Milestone | Khách / nhân viên nhận được gì |
|---|---|---|
| Nền | M0 · M1 · M2 | Dọn site cũ, giờ VN chuẩn, domain thuần 99% coverage, 18→40 bảng Postgres có RLS + CHECK |
| Đặt món | M3 · M4 | App một trang: Oven Bar (suất lò thật), Bento Menu, sheet món, chốt đơn 1 bước, nhận diện khách cũ bằng SĐT, theo dõi `/o/[token]`, huỷ, đặt lại |
| Bếp | M5 | `/admin/kitchen`: Bảng tổng hợp chuẩn bị, mẻ, đơn, giao tuyến, bản in; đăng nhập tên + PIN |
| Tiền & SEO | M6 | VietQR + SePay tự xác nhận, trả trước theo rủi ro, `/m/[slug]` + OG, PWA, `?src=`, `/chinh-sach` |
| Vận hành | M7 · M8 · M9 | Ca & két đếm mù, hộp chi, chi phí + bot `/chi`; checklist & sổ tay; chấm công, bảng công, lương |
| Ngày bán | M9.5 | Khoá lò 1 chạm `/khoalo`, giữ suất 15′, mã nắp hộp, bàn giao COD, chấm điểm khẩu vị |
| Kho | M10 | Kho 2 mức, trừ kho lúc Ra lò, công nợ NCC `/no` `/trano`, biên lãi theo món, kiểm nhanh ABC |
| Chỉ số | M11 | P&L theo mảng café/pizza, nhập Sapo, báo cáo tối, `/lich` `/pl`, tóm tắt góp ý (Haiku) |
| **M12 (WIP)** | `3464b69` + chưa commit | Cà phê giao theo khung giờ, nước lon kèm, thành viên/điểm/hạng/voucher/giới thiệu, Clerk xin vào nội bộ, landing + `/tai-khoan`, chế độ sáng |

## 2. Chuẩn bị cải tiến (nợ đã biết)

**Chặn ra mắt (việc của chủ quán):** địa chỉ + toạ độ Rêu, thông tin pháp lý footer (`data/site.ts` TODO) · điền secrets Vercel · thử SePay thật 1 khoản nhỏ · bot Telegram + nhóm · Vercel Pro (cron thứ 2) · Lighthouse trên domain thật · người có chuyên môn rà `/chinh-sach`.

**Kỹ thuật:**
1. **Cách đo JS `/` chưa thống nhất** (M3–M7 ghi ≈175 KB, M8 đo lại 214 KB). Phải chốt **trước** khi thêm Clerk — Clerk là khoản JS lớn nhất từ trước tới giờ.
2. `ClerkProvider` đang bọc **root layout** → clerk-js tải ở mọi trang, kể cả `/` và màn bếp.
3. Chế độ sáng (WIP) **trái §9.1** "chỉ tối" — cần chủ quán chốt (xem §5).
4. `/tai-khoan` chưa có trong §5.4 (luật §0.7).
5. e2e `m95` đếm ngược có thể trượt khi cả bộ chạy > 9′; spec cũ còn kiểm tràn ngang bằng `innerWidth` (cách M9 mới đúng).
6. Placeholder chờ số thật: công thức bột/sườn, định lượng café, file Excel Sapo mẫu.
7. Nhỏ: COD hoàn tất chưa tự `paid`; `holdMinutes` chưa có UI.

## 3. Sắp làm (sau M12)

- **Giai đoạn 2** (theo dữ liệu thật): danh sách chờ khi kín lò · suất muộn từ đế dự phòng · tồn túi BBQ theo ngày · ship chung tuyến · Zalo ZNS · tem nhiệt có QR thay bút lông · link bàn giao cho Rêu · báo cáo tuần theo `src` · "còn *n* điểm trước bạn" (không GPS).
- **Giai đoạn 3** (≥ 4 nhân viên): ca linh hoạt — đăng ký/đổi/nhường ca, xin nghỉ, `/nghi`.

---

## 4. Kiến trúc M12

### 4.1 Landing — "ngôn ngữ cũ"

Hiểu "ngôn ngữ cũ" = **site gốc** (`71dc123`): hero giữa trang với **logo lockup**, kicker chữ hoa giãn, `SectionHeading`, nhiều khoảng trắng, nút pill `bg-invert`, khối "Đến quán" — đặt trên token §9.1 (đen, cam lửa `#ff3d00`, bo 28 px, Be Vietnam Pro). Bản WIP hiện là hero ảnh full-bleed + chữ gradient → **đổi về** kiểu cũ.

Nguyên tắc giữ nguyên: `/` vẫn là **app đặt món** (§0.7) — landing là lớp kể chuyện *bao quanh*, không đẩy việc đặt món xuống sâu.

Thứ tự `/` (mobile 390 px):

| # | Khối | Ghi chú |
|---|---|---|
| 1 | Header: logo · neo (Câu chuyện · Thực đơn · Ưu đãi · Đến quán) · Tài khoản | Tĩnh |
| 2 | Hero cũ: kicker "THE HEAT · Thăng Bình", logo lockup, 1 câu dẫn, 2 CTA (Pizza cuối tuần · Cà phê hôm nay) | **≤ 70svh** để mép Oven Bar ló dưới màn đầu; LCP = logo (nhẹ) |
| 3 | `#dat-mon`: Oven Bar + Bento | Không đổi logic |
| 4 | **Câu chuyện**: đoạn mở + 3 trụ (Lửa · Khoa học · Gần nhà) có ảnh thật | Đã có nội dung trong `copy.landing.story` |
| 5 | **Hành trình của tụi mình**: 3 cột *Đã làm · Đang cải tiến · Sắp tới* — bản cho khách của §1–§3 | Dữ liệu tĩnh 1 file (thay `data/upcoming.ts` → `data/roadmap.ts`) |
| 6 | Ưu đãi thành viên + hạng | Đã có |
| 7 | Đến quán (khối Visit cũ): địa chỉ, giờ, gọi/Zalo, link `/tai-quan` | Chờ địa chỉ Rêu (TODO) |
| 8 | Hỏi nhanh + footer | Đã có |

Toàn bộ là Server Component tĩnh; chỉ nút tài khoản + link chọn tab là client. Hiện dần bằng CSS `animation-timeline` (đã có, tự tắt khi không hỗ trợ / reduced-motion).

### 4.2 Clerk — một instance, hai đối tượng

```
            ┌───────────── Clerk (Google · Facebook · email) ─────────────┐
            │                         userId                               │
            ▼                                                              ▼
 members.clerk_user_id  (khách, tuỳ chọn)                  staff.clerk_user_id (+ pending)
   điểm · hạng · voucher · giới thiệu · lịch sử             xin vào → owner/manager duyệt → roles
            │                                                              │
   placeOrder gắn orders.member_id                         requireStaff(): Clerk đã gắn > phiên PIN
   (khách vãng lai vẫn đặt bằng SĐT như cũ)                (PIN giữ cho máy chung ở bếp)
```

Quyết định:
1. **Quyền nằm ở DB, không ở Clerk metadata.** Clerk chỉ trả lời "người này là ai"; `staff.roles`/`members` trả lời "được làm gì". Một nguồn sự thật, test int như cũ.
2. **Không bắt buộc đăng nhập để đặt món.** Không gộp lịch sử theo SĐT khi chưa xác minh SĐT (lộ đơn người khác) — chỉ gắn đơn đặt **khi đang đăng nhập**.
3. **Thiếu khoá Clerk → app chạy y như M11** (dev/CI/e2e); e2e giả danh bằng cookie `th_e2e_user`, khoá ở production (đã có).
4. **Clerk chỉ tải nơi cần:** `ClerkProvider` chuyển khỏi root → `app/tai-khoan/layout.tsx` và `app/admin/login/layout.tsx`. Ở `/`, header đọc thành viên ở server (`currentMember()` trong `<Suspense>`) và hiện link "Tài khoản"/chữ cái đầu tên — không cần clerk-js. `clerkMiddleware` vẫn bọc `proxy.ts` để `auth()` dùng được trong `placeOrder`.
5. Không thêm route đăng nhập: modal / `routing="hash"`. Route mới duy nhất: **`/tai-khoan`** (ghi vào §5.4, `noindex`).
6. CSP thêm domain Frontend API của Clerk; `/chinh-sach` ghi Clerk là bên xử lý dữ liệu (Mỹ) — đã sửa trong WIP, rà lại.

---

## 5. Cần chủ quán chốt (đã có mặc định — không trả lời thì làm theo mặc định)

| # | Câu hỏi | Mặc định đề xuất |
|---|---|---|
| A | "Ngôn ngữ cũ" là site gốc (logo giữa, sáng/tối) hay §9.1 (chỉ tối)? | Bố cục site gốc **trên token §9.1** |
| B | Giữ chế độ sáng? | **Bỏ** — đúng §9.1, ảnh món nổi trên nền đen, bớt 1 lớp CSS/kiểm tương phản. Giữ nếu chủ quán muốn |
| C | Nội dung "Hành trình" cho khách: có nêu cả việc nội bộ (kho, lương…) không? | **Không** — chỉ điều khách cảm nhận được (đặt trước theo mẻ, theo dõi đơn, CK tự xác nhận, chấm điểm, thành viên) |
| D | Ảnh thật & khoá Clerk (Google/Facebook OAuth) | Ảnh tạm hiện có; Clerk dev keys để thử |

---

## 6. Chia phiên (mỗi phiên vừa 1 lần làm việc, kết thúc bằng DoD xanh + commit)

| Phiên | Phạm vi | File chính | Chấp nhận |
|---|---|---|---|
| **S0 · Chốt WIP** | Chạy đủ DoD trên WIP hiện có; sửa đỏ; **chốt cách đo JS** (ghi vào LOG); commit `M12a` | toàn bộ diff hiện tại | lint · typecheck · unit · int · build · e2e xanh; con số JS `/` trước-Clerk |
| **S1 · Clerk nền** | Tách `ClerkProvider` khỏi root; header `/` không cần clerk-js; CSP; `.env.example` | `app/layout.tsx`, `app/tai-khoan/layout.tsx`, `app/admin/login/layout.tsx`, `components/landing-client.tsx`, `next.config.ts` | Không khoá → giống M11; có khoá → đăng nhập được |
| **S2 · Clerk nội bộ** | Đăng nhập Clerk ở `/admin/login` (giữ PIN), xin vào → duyệt/từ chối/thu hồi trong tab Nhân viên; owner gắn Clerk qua `npm run staff` | `staff-request.tsx`, `staff-panel.tsx`, `dal/ops.ts`, `auth/session.ts` | int: `pending` không vào được gì; manager không duyệt vai owner/manager; thu hồi → mất quyền ngay; e2e xin → duyệt → vào bếp |
| **S3 · Clerk khách** | `/tai-khoan` (điểm, hạng, ví, đơn, giới thiệu); checkout dùng ví; gắn `member_id` khi đặt | `app/tai-khoan/*`, `account-client.tsx`, `checkout-sheet.tsx`, `dal/promo.ts` | int promo hiện có xanh + đăng xuất giữa chừng không mất đơn; e2e `m12` thêm: giới thiệu bạn, đổi điểm |
| **S4 · Landing khung** | Header + hero kiểu cũ (logo lockup), `#dat-mon` ngay sau hero, khối Đến quán; quyết định A/B | `components/landing.tsx`, `store-page.tsx`, `globals.css`, `copy.ts` | 390 px: Oven Bar ló ở màn đầu; axe 0 serious; không tràn ngang; CLS < 0,1 |
| **S5 · Câu chuyện & hành trình** | Câu chuyện 3 trụ + "Đã làm · Đang cải tiến · Sắp tới" từ `data/roadmap.ts` (thay `upcoming.ts`); món sắp ra giữ trong cột "Sắp tới" | `data/roadmap.ts`, `components/landing.tsx`, `copy.ts` | Nội dung khớp §1–§3 bản cho khách (quyết định C); axe; ảnh `sizes` đúng |
| **S6 · Hoàn thiện** | Lighthouse mobile, rà copy, cập nhật BLUEPRINT (§5.4, §9, §15 M12) + LOG, xoá file này; lên `main` khi chủ quán bảo | docs | Perf ≥ 85 · A11y/BP/SEO 100 · DoD đủ |

Thứ tự bắt buộc: **S0 → S1** (đo JS trước/sau Clerk). S2/S3 độc lập nhau. S4 → S5. S6 cuối.

Bỏ qua có chủ đích: đăng nhập bằng SĐT/OTP (tốn SMS, Clerk tính phí) · đồng bộ vai sang Clerk Organizations (DB đã đủ) · trang blog/câu chuyện riêng (trái §0.7) — thêm khi có nhu cầu thật.
