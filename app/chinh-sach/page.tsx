import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { site } from "@/data/site";
import { ORDER_ADDRESS_RETENTION_DAYS, REMEMBER_DAYS, SOURCE_COOKIE_DAYS } from "@/lib/privacy";

// Chính sách bảo mật & điều khoản đặt hàng (§12 — NĐ 13/2023/NĐ-CP, Luật BVDLCN 2025, NĐ 52/2013).
// Trang tĩnh. Nội dung mô tả đúng cách hệ thống đang làm; chủ quán nên nhờ người có chuyên môn pháp lý rà lại trước ra mắt.

export const metadata: Metadata = {
  title: "Chính sách bảo mật & điều khoản đặt hàng",
  description: `Cách ${site.name} thu thập, sử dụng, lưu giữ dữ liệu cá nhân và các điều khoản khi đặt món.`,
  alternates: { canonical: "/chinh-sach" },
};

const UPDATED = "31/10/2026";
const known = (v: string) => (v.startsWith("TODO") ? "(đang cập nhật)" : v);

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function PolicyPage() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-header pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Link href="/" aria-label={site.name}>
            <Logo compact />
          </Link>
          <Link href="/" className="inline-flex h-11 items-center rounded-full bg-elevated px-4 text-sm font-medium">
            Về trang đặt món
          </Link>
        </div>
      </header>

      <main id="noi-dung" className="mx-auto max-w-2xl space-y-10 px-4 pt-8 pb-16 text-[15px] leading-relaxed text-secondary [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-text">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-text">Chính sách bảo mật &amp; điều khoản đặt hàng</h1>
          <p className="mt-2 text-sm">Cập nhật {UPDATED}</p>
          <nav aria-label="Mục lục" className="mt-4 flex flex-wrap gap-x-4 text-sm">
            <a href="#bao-mat" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-text">
              Bảo mật dữ liệu
            </a>
            <a href="#dieu-khoan" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-text">
              Điều khoản đặt hàng
            </a>
            <a href="#lien-he" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-text">
              Liên hệ
            </a>
          </nav>
        </div>

        <div id="bao-mat" className="space-y-8">
          <Section id="thu-thap" title="1. Quán thu thập gì">
            <p>Chỉ những gì cần để làm và giao đơn của bạn:</p>
            <ul>
              <li>
                <strong>Số điện thoại</strong> và <strong>tên gọi</strong> — để xác nhận và liên hệ khi giao.
              </li>
              <li>
                <strong>Khu vực, mô tả nhà</strong> và (nếu bạn cho phép) <strong>vị trí trên bản đồ</strong> — chỉ khi chọn giao tận nhà.
              </li>
              <li>
                <strong>Món đã đặt, ghi chú, cách thanh toán</strong> và lịch sử đơn (số đơn đã nhận, số lần không nhận hàng).
              </li>
            </ul>
            <p>Quán không thu thập CMND/CCCD, email, ngày sinh hay thông tin thẻ ngân hàng. Chuyển khoản do ngân hàng của bạn xử lý; quán chỉ nhận thông báo số tiền và nội dung chuyển khoản.</p>
          </Section>

          <Section id="muc-dich" title="2. Dùng để làm gì">
            <ul>
              <li>Nhận, chuẩn bị, giao đơn và gọi xác nhận khi cần.</li>
              <li>Nhận ra khách quen để chào và điền sẵn thông tin (chỉ khi bạn bật &quot;Ghi nhớ&quot;).</li>
              <li>Phòng đơn ảo: khách từng không nhận hàng có thể được đề nghị chuyển khoản trước.</li>
              <li>Thống kê ẩn danh (lượt xem món, kênh biết đến quán) để cải thiện thực đơn — không kèm số điện thoại, tên hay địa chỉ.</li>
            </ul>
            <p>Quán <strong>không bán</strong> và không chia sẻ dữ liệu của bạn cho bên khác để quảng cáo. Quán không gửi tin khuyến mãi nếu bạn chưa đồng ý riêng.</p>
          </Section>

          <Section id="luu-tru" title="3. Lưu ở đâu, bao lâu">
            <ul>
              <li>
                Dữ liệu đơn lưu trên máy chủ cơ sở dữ liệu tại <strong>Ấn Độ (Mumbai)</strong> của nhà cung cấp Supabase, truy cập có mật khẩu, chỉ chủ quán và nhân viên bếp/giao hàng được xem.
              </li>
              <li>
                Mô tả nhà và vị trí trên đơn được <strong>tự động xoá sau {ORDER_ADDRESS_RETENTION_DAYS} ngày</strong>. Nếu bạn bật &quot;Ghi nhớ thông tin&quot;, địa chỉ được giữ để lần sau đặt nhanh — đến khi bạn yêu cầu xoá.
              </li>
              <li>Thông báo đơn mới được gửi vào nhóm Telegram nội bộ của bếp (tên, số điện thoại, khu vực, món).</li>
            </ul>
          </Section>

          <Section id="cookie" title="4. Cookie & bộ nhớ trình duyệt">
            <ul>
              <li>
                <strong>Giỏ hàng</strong> lưu ngay trên máy bạn (không gửi lên máy chủ cho đến khi bạn đặt).
              </li>
              <li>
                <strong>&quot;Ghi nhớ thông tin&quot;</strong> (mặc định tắt): một cookie đã ký, giữ {REMEMBER_DAYS} ngày, để máy này tự điền thông tin của bạn. Tắt ô này khi đặt là xoá cookie.
              </li>
              <li>
                <strong>Kênh giới thiệu</strong> (ví dụ bạn mở link từ Facebook): cookie {SOURCE_COOKIE_DAYS} ngày, chỉ ghi tên kênh.
              </li>
              <li>Thống kê lượt truy cập không dùng cookie quảng cáo và không theo dõi bạn qua các trang khác.</li>
            </ul>
          </Section>

          <Section id="quyen" title="5. Quyền của bạn">
            <p>
              Bạn có quyền xem, sửa, yêu cầu xoá dữ liệu của mình, rút lại sự đồng ý &quot;Ghi nhớ&quot; bất cứ lúc nào. Gọi hoặc nhắn Zalo cho quán (mục Liên hệ bên dưới) — quán xử lý trong vòng 72 giờ. Khi xoá, quán chỉ giữ lại số liệu đơn hàng ẩn danh phục vụ sổ sách kế toán theo quy định.
            </p>
          </Section>
        </div>

        <div id="dieu-khoan" className="space-y-8">
          <Section id="dat-truoc" title="6. Đặt trước theo mẻ">
            <ul>
              <li>Bánh được nướng theo từng mẻ giờ cố định. Mỗi mẻ có số suất giới hạn; đơn chỉ giữ chỗ khi hệ thống báo &quot;đã giữ chỗ&quot;.</li>
              <li>Mỗi mẻ có <strong>giờ chốt</strong>. Sau giờ chốt quán bắt đầu chuẩn bị nguyên liệu nên không nhận thêm đơn cho mẻ đó.</li>
              <li>Thời gian giao là khung ước tính theo giờ ra lò và khu vực của bạn.</li>
            </ul>
          </Section>

          <Section id="gia" title="7. Giá & thanh toán">
            <ul>
              <li>Giá hiển thị là giá cuối cùng bạn trả, đã gồm phí giao theo khu vực bạn chọn.</li>
              <li>Thanh toán tiền mặt khi nhận hoặc chuyển khoản qua mã VietQR. Hãy giữ nguyên nội dung chuyển khoản để hệ thống tự ghi nhận.</li>
              <li>Quán có thể đề nghị chuyển khoản trước với đơn giá trị lớn hoặc khi số điện thoại từng không nhận hàng.</li>
              <li>Quà tặng kèm (nếu có) áp dụng theo chương trình đang hiển thị khi đặt và có thể hết sớm.</li>
            </ul>
          </Section>

          <Section id="huy" title="8. Huỷ đơn & hoàn tiền">
            <ul>
              <li>
                Bạn huỷ <strong>miễn phí trước giờ chốt</strong> bằng nút &quot;Huỷ đơn&quot; trong trang theo dõi đơn. Sau giờ chốt vui lòng gọi quán.
              </li>
              <li>Đơn đã chuyển khoản mà huỷ trước giờ chốt, hoặc do quán không phục vụ được, được hoàn tiền đầy đủ vào tài khoản đã chuyển.</li>
              <li>Không nhận hàng mà không báo trước có thể khiến lần đặt sau phải chuyển khoản trước.</li>
            </ul>
          </Section>
        </div>

        <Section id="lien-he" title="9. Liên hệ & thông tin kinh doanh">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt>Đơn vị</dt>
            <dd className="text-text">{known(site.legal.businessName)}</dd>
            <dt>ĐKKD/MST</dt>
            <dd className="text-text">{known(site.legal.registrationNo)}</dd>
            <dt>Địa chỉ</dt>
            <dd className="text-text">{known(site.kitchen.address)}</dd>
            <dt>Email</dt>
            <dd className="text-text">{known(site.legal.email)}</dd>
          </dl>
          <p className="flex flex-wrap gap-x-4">
            <a href={site.contact.phoneHref} className="inline-flex min-h-11 items-center font-semibold text-text tabular-nums">
              ☎ {site.contact.phoneDisplay}
            </a>
            <a href={site.contact.zaloHref} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-text">
              Nhắn Zalo
            </a>
          </p>
        </Section>
      </main>
    </>
  );
}
