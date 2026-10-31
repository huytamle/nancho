# THE HEAT PIZZA — Chiến lược Marketing Đa Kênh tại Thị Trấn

> **Mục tiêu:** Chi phí siêu thấp, đánh trúng đích, **đo được bằng chính hệ thống đặt món**.
> **Phạm vi:** Thăng Bình (TP Đà Nẵng) và vùng lân cận trong bán kính giao hàng.
> **Đọc cùng:** [`docs/BLUEPRINT.md`](./BLUEPRINT.md) — các tính năng hệ thống phục vụ marketing được đánh dấu 🔧.

---

## 1. Nguyên tắc nền tảng

1. **Thị trấn là một mạng lưới quan hệ dày.** Một người hài lòng nói với 10 người, một người không hài lòng nói với 30. Truyền miệng mạnh hơn mọi quảng cáo → *sản phẩm và trải nghiệm giao nhận là kênh marketing số 1*.
2. **"Nướng theo mẻ, đặt trước mới làm" chính là câu chuyện.** Khan hiếm **thật** ("Tối nay còn 4 suất mẻ 19:00") tạo động lực đặt sớm mà không cần giảm giá. Không bao giờ bịa số suất.
3. **QR là cửa vào duy nhất.** Mọi điểm chạm (tờ rơi, hộp bánh, quầy Rêu, bài đăng) dẫn về `theheatpizza.vn/?src=<mã-kênh>` → hệ thống lưu `src` vào đơn 🔧 → cuối tuần biết chính xác kênh nào ra đơn.
4. **Giữ khách cũ rẻ hơn 5–7 lần tìm khách mới.** Ưu tiên tỉ lệ quay lại trước khi mở rộng.
5. **Không đốt tiền:** không chạy quảng cáo diện rộng, không giảm giá sâu, không mua review.

## 2. Định vị & thông điệp

| Yếu tố | Nội dung |
|---|---|
| Định vị | Pan pizza kiểu Mỹ & BBQ sous-vide **duy nhất ở Thăng Bình** — nướng theo mẻ, đặt trước mới làm, giao nóng tận nhà |
| Khẩu hiệu (giữ từ logo) | *Crafted by fire. Refined by science.* → tiếng Việt: **"Nướng bằng lửa. Chuẩn bằng khoa học."** |
| 3 trụ cột câu chuyện | 🔥 **Lửa** — viền phô mai cháy caramel, đế pan giòn · 🧪 **Khoa học** — sườn sous-vide 24h mềm rời xương, chuẩn nhiệt từng độ · 🏡 **Địa phương** — nướng tại Thăng Bình, nhận tại Rêu, giao theo tuyến khu phố |
| Chi tiết ghi nhớ | "Mọi phần ăn đều kèm **Gừng hồng muối** chống ngấy" — một chi tiết nhỏ, khác biệt, dễ kể lại |
| Lý do đặt trước | "Không có đồ làm sẵn. Bánh của bạn được ủ đế từ trưa, đút lò đúng mẻ bạn chọn." |

## 3. Chân dung khách hàng ưu tiên

| Nhóm | Dịp | Thông điệp trúng | Kênh chạm |
|---|---|---|---|
| **Gia đình trẻ** (con 5–15 tuổi) | Tối T6–CN, "đổi món cho con" | Combo Đôi đủ cả nhà, giao tận nhà đúng giờ | Nhóm Zalo khu phố, Facebook nhóm địa phương, cổng trường |
| **Dân văn phòng, giáo viên, công chức** | Chiều T6 "thưởng cuối tuần", liên hoan nhỏ | Đặt trước giờ trưa, tối nhận | Zalo, tờ rơi tại cơ quan/trường, đặt nhóm |
| **Người trẻ / sinh viên về quê** | Cuối tuần, dịp lễ Tết, hè | Món "thành phố" ngay tại quê | TikTok/Reels, nhóm "Người Thăng Bình xa quê" |
| **Khách quán Rêu** | Đang ngồi cà phê | Thử pizza/BBQ, đặt mang về tối nay | Standee QR & tent card tại Rêu |
| **Người đi đường Quốc lộ 1A** | Tìm "pizza gần đây" | Có đánh giá tốt trên Google Maps | Google Business Profile |

## 4. Kênh & chiến thuật

### A. Điểm chạm vật lý (mỗi điểm một mã `src` riêng)

| Chiến thuật | Chi tiết | Mã `src` gợi ý |
|---|---|---|
| **Standee + tent card tại Rêu** | "Tối nay ăn gì? Đặt lò trước 15:30 — nhận ngay tại đây, tặng hũ Sốt Bơ Tỏi" | `reu-quay`, `reu-ban` |
| **Sticker QR trên mỗi hộp bánh** | "Đặt lại trong 10 giây" — khách quen quét lần sau, hệ thống tự điền 🔧 | `hop` |
| **Thiệp cảm ơn viết tay** cho 50 đơn đầu | Kèm mã giới thiệu bạn bè | `thiep` |
| **Tờ rơi A6** | Chỉ phát ở nơi có mật độ đúng chân dung: chợ, cổng trường lúc đón con, cơ quan. Mỗi điểm một mã | `to-roi-cho`, `to-roi-truong-…` |
| **Bảng nhỏ tại tiệm tạp hoá đối tác** | Đổi bằng 1 pizza/tháng cho chủ tiệm | `tap-hoa-<tên>` |

### B. Kênh số địa phương

| Kênh | Cách làm | Tần suất |
|---|---|---|
| **Google Business Profile** | Tạo & xác minh, ảnh món đẹp (chính bộ ảnh nền đen), giờ mẻ, link đặt hàng `?src=gmaps`. Trang theo dõi đơn hoàn tất có nút "Đánh giá trên Google" 🔧 | Trả lời mọi review trong 24h |
| **Nhóm Zalo khách quen "Hội Ăn Mẻ Tối"** | Chỉ khách đã đồng ý nhận tin. 1 tin/tuần, T6 10:00: "Mẻ tối nay còn X suất" — nội dung sinh tự động từ dashboard 🔧 | 1–2 tin/tuần, không spam |
| **Facebook Page + nhóm cộng đồng địa phương** | Đăng vào nhóm chợ online / cộng đồng Thăng Bình theo đúng quy định nhóm; ưu tiên ảnh/video thật, không chỉ quảng cáo | 2–3 bài/tuần |
| **TikTok / Reels** | Video 10–20 giây: kéo phô mai, viền cháy, **cắt túi sous-vide** (ASMR), cảnh đút lò theo mẻ, gắn vị trí Thăng Bình. Người thật (chủ quán) xuất hiện | 3 video/tuần |
| **Link chia sẻ từng món** | `theheatpizza.vn/m/combo-doi?src=…` hiện ảnh món đẹp khi dán vào Zalo/Messenger 🔧 | Dùng trong mọi bài đăng |

### C. Cơ chế lan truyền tích hợp trong sản phẩm

| Cơ chế | Cách chạy | Vì sao hiệu quả |
|---|---|---|
| **Ship chung tuyến** *(GĐ2)* 🔧 | "Khu phố 2 đã có 3 đơn mẻ 18:00 — hàng xóm đặt cùng được giảm 5.000đ ship" | Giảm chi phí giao thật (cùng một chuyến) + hàng xóm rủ nhau |
| **Giới thiệu bạn** *(GĐ2)* 🔧 | Mã giới thiệu = SĐT người giới thiệu. Bạn mới: tặng hũ sốt. Người giới thiệu: +1 tem | Chi phí thưởng chỉ ~10.000đ/khách mới |
| **Tem lửa 🔥** *(GĐ2)* 🔧 | Mỗi đơn hoàn tất +1 tem (theo SĐT). 5 tem → nâng cấp Combo miễn phí / tặng 1 BBQ | Tạo nhịp quay lại hằng tuần |
| **Đặt nhóm / "Mẻ riêng"** | Cơ quan, trường, nhóm bạn ≥ 5 pizza: đặt trước 1 ngày qua Zalo, chủ quán nhập bằng "Thêm đơn nhanh" 🔧 | Đơn lớn, lấp đầy cả mẻ |
| **Danh sách chờ khi kín lò** *(GĐ2)* 🔧 | Khách để lại SĐT, được báo khi có suất huỷ hoặc ưu tiên mẻ hôm sau | Biến "hết hàng" thành khách tiềm năng |

### D. Đối tác địa phương

- **Cà phê Rêu (đối tác chính):** điểm nhận + cold brew trong menu. Đề xuất combo "Cold brew + 1 lát pizza thử" vào chiều T6 để khách Rêu nếm thử; chia sẻ báo cáo số chai bán được hằng tuần 🔧.
- **Tiệm bánh kem:** gói "Sinh nhật tại nhà" (pizza + bánh kem) — giới thiệu chéo.
- **CLB thể thao địa phương** (chạy bộ, cầu lông, bóng đá phong trào): tài trợ pizza sau giải → xuất hiện trong ảnh/nhóm của họ.
- **Micro-KOL địa phương** (2–10 nghìn người theo dõi): trả bằng sản phẩm, yêu cầu video thật, gắn `src` riêng để đo.

## 5. Kế hoạch ra mắt 6 tuần

| Tuần | Mục tiêu | Việc chính |
|---|---|---|
| **−2: "Lò sắp đỏ"** | Tạo tò mò, gom danh sách chờ | Teaser video đế pan & túi sous-vide; buổi nếm thử cho ~20 người có ảnh hưởng (chủ Rêu, giáo viên, admin nhóm FB/Zalo, chủ tiệm tạp hoá); thu SĐT danh sách chờ |
| **−1: Soft launch** | Kiểm tra vận hành | Chỉ mở cho danh sách chờ, 2 mẻ/ngày; gọi hỏi cảm nhận từng khách; chỉnh định lượng, thời gian giao, câu chữ web |
| **1: "Mẻ khai lò"** (T6–CN) | Tạo sóng truyền miệng | 30 đơn đầu tặng hũ sốt + thiệp viết tay; livestream ra lò 17:00 T6; dán sticker QR mọi hộp |
| **2–4: Nhịp tuần** | Hình thành thói quen "tối T6 đặt The Heat" | Lịch nội dung cố định (mục 6); đẩy review Google sau mỗi đơn hoàn tất; mở nhóm Zalo khách quen |
| **5–6: Tối ưu** | Dồn lực vào kênh hiệu quả | Xem báo cáo theo `src`: cắt kênh dưới trung bình, nhân đôi kênh tốt; quyết định bật Giai đoạn 2 (tem, giới thiệu, ship chung tuyến) |

## 6. Lịch nội dung tuần mẫu

| Ngày | Nội dung | Kênh |
|---|---|---|
| T2 | Thực đơn tuần + giờ mẻ | FB Page, nhóm Zalo |
| T3 | Hậu trường: ủ đế, nấu sous-vide (khoa học) | TikTok/Reels |
| T4 | Khách thật + review (xin phép) | FB, Zalo |
| T5 | "Đặt trước cho cuối tuần" — mở suất T6–CN | Nhóm Zalo, FB nhóm địa phương |
| **T6 10:00** | **"Tối nay còn X suất"** — số liệu thật từ hệ thống 🔧 | Nhóm Zalo, FB |
| T6 17:00 | Video/Live ra lò mẻ đầu | TikTok, FB |
| CN | Cảm ơn tuần, ảnh khách, nhắc tem tích điểm | Zalo |

## 7. Ngân sách tham khảo mỗi tháng

| Hạng mục | Ước tính |
|---|---|
| In tờ rơi A6 (500 tờ) + sticker QR hộp (500) | 500.000 – 700.000đ |
| Standee/tent card tại Rêu (làm một lần) | 200.000 – 300.000đ (tháng đầu) |
| Sản phẩm nếm thử / tặng KOL / tài trợ | 300.000 – 500.000đ |
| Hũ sốt tặng (quà nhận tại Rêu, giới thiệu) | theo số đơn (~10.000đ/hũ) |
| Đẩy bài Facebook bán kính 5–8 km (tuỳ chọn, chỉ cho bài tốt nhất) | 0 – 500.000đ |
| Google Business Profile, Zalo OA, nhóm Zalo, TikTok | 0đ |
| **Tổng** | **≈ 1.000.000 – 2.000.000đ/tháng** |

## 8. KPI & cách đo (dữ liệu lấy từ hệ thống 🔧)

| KPI | Định nghĩa | Mục tiêu tháng 1 → tháng 3 |
|---|---|---|
| Đơn/ngày phục vụ | Trung bình đơn không huỷ | 8 → 20 |
| Tỉ lệ lấp đầy lò | Σ `used_pan` / Σ `cap_pan` | 50% → 85% |
| Tỉ lệ quay lại 30 ngày | Khách có ≥ 2 đơn trong 30 ngày / khách có đơn | 25% → 40% |
| Giá trị đơn trung bình (AOV) | Σ total / số đơn | ≥ 220.000đ |
| Tỉ lệ mua kèm (attach rate) | Đơn có ≥ 1 add-on / tổng đơn | ≥ 45% |
| Tỉ lệ bom hàng | `no_show` / đơn | < 3% |
| Hiệu quả kênh | Đơn & doanh thu theo `src`; chi phí / đơn theo kênh | Biết rõ top 3 kênh sau 4 tuần |
| Review Google | Số đánh giá & điểm trung bình | 30 review, ≥ 4,8 sau 3 tháng |

## 9. Những điều KHÔNG làm

- Không bịa số suất, không đếm ngược giả.
- Không giảm giá sâu (làm hỏng định vị "ít mà chất").
- Không spam nhóm cộng đồng hay nhắn tin cho người chưa đồng ý (cũng là yêu cầu của luật bảo vệ dữ liệu cá nhân).
- Không mua review/like.
- Không mở rộng bán kính giao trước khi vận hành mẻ ổn định — trễ giờ là cách nhanh nhất làm hỏng uy tín ở thị trấn.

## 10. Tính năng hệ thống phục vụ marketing (liên kết Blueprint)

| Tính năng | Mục Blueprint | Milestone |
|---|---|---|
| Lưu `?src=` vào cookie và vào đơn | §5.4, §13.4 | M6 |
| Link chia sẻ từng món có ảnh OG `/m/[slug]` | §5.4, §13.2 | M6 |
| Tự điền cho khách quen (đặt lại trong 10 giây) | §7.7 | M4 |
| Nút "Đánh giá trên Google" sau khi hoàn tất | §9.8 | M6 |
| "Tạo bài đăng" từ số suất thật | §10.6 | M5 |
| Thêm đơn nhanh cho đơn nhóm/Zalo | §10.4 | M5 |
| Báo cáo đối soát cold brew với Rêu | §7.6 | M5 |
| Danh sách chờ, tem lửa, giới thiệu bạn, ship chung tuyến | §15 GĐ2 | GĐ2 |
