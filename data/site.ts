// Thông tin thương hiệu, liên hệ, pháp lý. Giá trị "TODO" chờ chủ quán chốt (BLUEPRINT §16).

export const site = {
  name: "THE HEAT PIZZA",
  shortName: "THE HEAT",
  url: "https://theheatpizza.vn",
  tagline: "Nướng bằng lửa. Chuẩn bằng khoa học.",
  taglineEn: "Crafted by fire. Refined by science.",
  description:
    "Pan pizza kiểu Mỹ & BBQ sous-vide ở Thăng Bình — nướng theo mẻ, đặt trước mới làm, giao nóng tận nhà hoặc nhận tại Cà phê Rêu.",
  locationLabel: "Thăng Bình · Đà Nẵng",

  contact: {
    phoneDisplay: "0922 662 669",
    phoneHref: "tel:+84922662669",
    zaloHref: "https://zalo.me/0922662669",
  },

  // ✅ Rêu vừa là bếp vừa là điểm nhận. ⏳ Còn chờ địa chỉ & toạ độ.
  kitchen: {
    name: "Cà phê Rêu",
    address: "TODO: địa chỉ Cà phê Rêu",
    mapsLink: null as string | null,
    // "lat,lng" — điểm xuất phát chỉ đường cho shipper (tab Giao). null → Google dùng vị trí hiện tại.
    coords: null as string | null,
  },

  // Bắt buộc hiển thị ở footer (NĐ 52/2013, sửa đổi bởi NĐ 85/2021). Chặn ra mắt nếu còn TODO.
  legal: {
    businessName: "TODO: tên hộ kinh doanh / doanh nghiệp",
    registrationNo: "TODO: số ĐKKD / MST",
    email: "TODO: email liên hệ",
  },

  // Link "Đánh giá trên Google" ở trang theo dõi đơn — null thì ẩn nút. ⏳ Chờ chủ quán gửi.
  reviewUrl: null as string | null,

  social: {
    facebook: "https://www.facebook.com/theheat.thangbinh",
    instagram: "https://www.instagram.com/theheat.thangbinh",
  },

  // Quán ăn tại chỗ THE HEAT (café, KOLD Gelato, đặt bàn) — trang /tai-quan.
  dineIn: {
    name: "THE HEAT",
    address: "162 Nguyễn Thuật, xã Thăng Bình, thành phố Đà Nẵng",
    mapsLink:
      "https://www.google.com/maps/search/?api=1&query=162+Nguy%E1%BB%85n+Thu%E1%BA%ADt%2C+Th%C4%83ng+B%C3%ACnh%2C+%C4%90%C3%A0+N%E1%BA%B5ng",
    hours: [
      { days: "Thứ 2 – Chủ nhật", time: "06:00 – 21:30" },
      { days: "Café", time: "06:00 – 21:30" },
    ],
    // Khung giờ nhận đặt bàn (giờ VN), dùng ở cả form và server action.
    reservationOpen: "06:00",
    reservationClose: "21:30",
  },
} as const;
