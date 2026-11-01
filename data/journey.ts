// "Hành trình" trên landing (M12): chỉ những gì khách cảm nhận được — không nêu việc nội bộ (kho, lương…).
// Chủ quán sửa trực tiếp file này. Ảnh món sắp ra tạm dùng ảnh menu có sẵn.

export const journey = {
  done: [
    "Đặt trước theo mẻ — thấy rõ giờ ra lò và số suất còn lại.",
    "Theo dõi đơn trực tiếp: vào lò, ra lò, đang giao.",
    "Quét QR chuyển khoản, đơn tự xác nhận trong vài giây.",
    "Khách quen không phải gõ lại địa chỉ.",
    "Cà phê giao tận nơi hai khung mỗi ngày.",
    "Chấm điểm món một chạm ngay trên trang đơn.",
  ],
  improving: [
    "Công thức đế & sườn chỉnh theo điểm khẩu vị mỗi tuần.",
    "Định lượng từng ly cà phê cho vị đều hơn.",
    "Ưu đãi thành viên: quà chào mừng, tích điểm, rủ bạn.",
  ],
  next: [
    "Danh sách chờ — báo ngay khi lò có suất trống.",
    "Tem QR trên hộp: quét để xem đơn và chấm điểm.",
    "Biết còn mấy điểm giao trước bạn.",
    "Tin Zalo khi bánh vừa ra lò.",
  ],
  dishes: [
    {
      name: "Pan Pizza Bò nướng lửa hồng",
      body: "Bò Úc ướp tiêu rừng, hành tây caramel, phô mai cheddar chảy viền.",
      when: "Tháng 12",
      image: "/images/menu/pan-bbq.jpg",
    },
    {
      name: "Sườn bò sous-vide 36 giờ",
      body: "Lâu hơn 12 giờ so với sườn heo — mềm tới mức tách xương bằng nĩa.",
      when: "Đang thử",
      image: "/images/menu/bbq-ribs.jpg",
    },
    {
      name: "Cold brew cam sả",
      body: "Ủ lạnh 18 giờ, thêm vỏ cam và sả tươi. Hợp buổi chiều nắng.",
      when: "Sắp có",
      image: "/images/menu/cold-brew.jpg",
    },
  ],
} as const;
