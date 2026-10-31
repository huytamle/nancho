// Seed vận hành M8 (§17.5–17.6): mẫu checklist & trang sổ tay khởi đầu — chủ quán/quản lý sửa trong app.
// Công thức pizza KHÔNG chép số định lượng: trang gắn `productId` tự hiện bảng từ `recipe_lines`.

import type { ChecklistItem, ChecklistMoment } from "@/lib/domain/checklist";
import type { Role } from "@/lib/domain/roles";

type SeedTemplate = { id: number; title: string; roles: Role[]; moment: ChecklistMoment; items: ChecklistItem[]; sort: number };

export const seedChecklistTemplates: SeedTemplate[] = [
  {
    id: 1,
    title: "Mở ca — Bếp",
    roles: ["kitchen"],
    moment: "open",
    sort: 1,
    items: [
      { id: "hygiene", label: "Rửa tay, tạp dề, mũ/buộc tóc" },
      { id: "gas", label: "Kiểm tra van gas, bật lò" },
      { id: "fridge", label: "Nhiệt độ tủ mát bếp", value: { unit: "°C", max: 5 } },
      { id: "dough", label: "Đếm đế Pan đã ủ — đủ cho các mẻ hôm nay" },
      { id: "prep", label: "Đối chiếu tab Chuẩn bị, rã đông túi BBQ" },
      { id: "station", label: "Bàn sơ chế sạch, khử khuẩn" },
    ],
  },
  {
    id: 2,
    title: "Mở ca — Quầy café",
    roles: ["barista", "server"],
    moment: "open",
    sort: 2,
    items: [
      { id: "machine", label: "Bật máy espresso, xả nhóm, chỉnh xay" },
      { id: "fridge", label: "Nhiệt độ tủ mát quầy", value: { unit: "°C", max: 5 } },
      { id: "stock", label: "Kiểm sữa, đá, ly, ống hút" },
      { id: "floor", label: "Lau bàn ghế, sàn khu khách" },
      { id: "front", label: "Bật đèn, nhạc, mở cửa" },
      { id: "register", label: "Mở ca — đếm két (tab Ca & két)" },
    ],
  },
  {
    id: 3,
    title: "Nhiệt độ tủ (giữa ca)",
    roles: ["kitchen", "barista"],
    moment: "during",
    sort: 3,
    items: [
      { id: "fridge-kitchen", label: "Tủ mát bếp", value: { unit: "°C", max: 5 } },
      { id: "freezer", label: "Tủ đông", value: { unit: "°C", max: -18 } },
      { id: "fridge-bar", label: "Tủ mát quầy", value: { unit: "°C", max: 5 } },
    ],
  },
  {
    id: 4,
    title: "Đóng ca",
    roles: ["kitchen", "barista", "server"],
    moment: "close",
    sort: 4,
    items: [
      { id: "oven", label: "Tắt lò, khoá van gas" },
      { id: "label", label: "Bọc kín & dán nhãn ngày nguyên liệu mở" },
      { id: "machine", label: "Vệ sinh máy espresso, ngâm tay cầm" },
      { id: "trash", label: "Đổ rác, thay túi mới" },
      { id: "floor", label: "Lau sàn bếp & quầy", photo: true },
      { id: "register", label: "Đóng ca — đếm két, nhập Sapo (tab Ca & két)" },
      { id: "lock", label: "Tắt điện, khoá cửa" },
    ],
  },
  {
    id: 5,
    title: "Vệ sinh tuần",
    roles: ["kitchen", "barista", "server"],
    moment: "weekly",
    sort: 5,
    items: [
      { id: "oven", label: "Vệ sinh sâu lò & khay", photo: true },
      { id: "freezer", label: "Lau tủ đông, xả tuyết" },
      { id: "descale", label: "Tẩy cặn máy espresso" },
      { id: "hood", label: "Lau hút mùi" },
      { id: "expiry", label: "Rà hạn dùng toàn bộ kho, bỏ đồ hết hạn" },
    ],
  },
];

type SeedPage = { slug: string; title: string; kind: "sop" | "recipe"; roles: Role[]; productId: string | null; body: string };

export const seedHandbookPages: SeedPage[] = [
  {
    slug: "quy-tac-chung",
    title: "Quy tắc chung",
    kind: "sop",
    roles: ["kitchen", "server", "barista", "shipper"],
    productId: null,
    body: `Chào mừng bạn đến với **THE HEAT**. Vài điều ai cũng cần nhớ:

1. **Vệ sinh trước tiên** — rửa tay khi vào ca, sau khi đổ rác, sau khi cầm tiền.
2. **Đặt trước mới làm** — pizza nướng theo mẻ; khách hỏi mua ngay thì mời đặt mẻ gần nhất trên app.
3. **Ghi lại mọi khoản tiền** — chi phí ghi qua Telegram \`/chi\`, két đếm khi mở/đóng ca.
4. Có sự cố (khách phàn nàn, đồ hỏng, thiếu nguyên liệu) → báo quản lý ngay, đừng tự xử lý một mình.`,
  },
  {
    slug: "mo-ca-bep",
    title: "Mở ca bếp",
    kind: "sop",
    roles: ["kitchen"],
    productId: null,
    body: `## Trước giờ mẻ đầu 90 phút

1. Làm checklist **Mở ca — Bếp** (tab Việc).
2. Mở tab **Chuẩn bị** của Bếp → lấy đúng số đế, túi BBQ, hũ sốt.
3. Bật lò, chờ đạt nhiệt rồi mới cho mẻ đầu vào.

## Lưu ý

- Đế Pan lấy ra khỏi tủ mát **trước 30 phút** để về nhiệt độ phòng.
- Không dùng nguyên liệu không có nhãn ngày.`,
  },
  {
    slug: "pepperoni-pan",
    title: "Pepperoni Pan",
    kind: "recipe",
    roles: ["kitchen"],
    productId: "pepperoni-pan",
    body: `## Các bước

1. Phết dầu khuôn, ấn đế Pan kín đáy khuôn.
2. Rải mozzarella **sát mép** để tạo viền cháy giòn.
3. Xếp pepperoni lát đều mặt bánh.
4. Nướng đến khi viền phô mai sẫm màu, đáy giòn.
5. Nghỉ 1 phút, cắt 6 miếng, vào hộp.

> Định lượng ở bảng bên dưới lấy từ công thức chuẩn của app — sửa định lượng thì sửa trong Bếp, không sửa ở đây.`,
  },
  {
    slug: "garlic-cheese-pan",
    title: "Garlic Cheese Pan",
    kind: "recipe",
    roles: ["kitchen"],
    productId: "garlic-cheese-pan",
    body: `## Các bước

1. Ấn đế Pan kín khuôn, phết **bơ tỏi** đều mặt bánh.
2. Rải mozzarella sát mép.
3. Nướng đến khi phô mai vàng sẫm.
4. Cắt 6 miếng, vào hộp.`,
  },
  {
    slug: "phuc-vu-tai-quan",
    title: "Phục vụ tại quán",
    kind: "sop",
    roles: ["server", "barista"],
    productId: null,
    body: `## Đón khách

- Chào trong 10 giây đầu, mời ngồi, đưa menu café & gelato.
- Khách hỏi pizza: giới thiệu **đặt trước theo mẻ** trên theheatpizza.vn, nhận tại quầy.

## Thanh toán

- Bán café qua **Sapo**; khách chuyển khoản → **MoMo kinh doanh**.
- Cuối ca nhập số liệu báo cáo chốt ca Sapo ở tab **Ca & két**, kèm ảnh.`,
  },
];
