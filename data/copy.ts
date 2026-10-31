// Toàn bộ chuỗi giao diện (chỉ tiếng Việt). Giữ dạng object có kiểu để sau này thêm ngôn ngữ.

export const copy = {
  skip: "Bỏ qua tới nội dung",

  store: {
    kicker: "Nướng theo mẻ · Đặt trước mới làm",
    title: "Pan pizza kiểu Mỹ & BBQ sous-vide",
    comingSoon: "Lò sắp đỏ. Trang đặt món đang được hoàn thiện.",
    callToOrder: "Đặt qua điện thoại",
    zalo: "Nhắn Zalo",
    dineInLink: "Café, gelato & đặt bàn tại quán",
  },

  dineIn: {
    back: "Đặt pizza",
    menu: {
      kicker: "Tại quán",
      title: "Café & Gelato",
      description: "Café specialty và kem KOLD Gelato, phục vụ tại quán THE HEAT.",
    },
    visit: {
      address: "Địa chỉ",
      openMaps: "Mở Google Maps",
      hours: "Giờ mở cửa",
    },
    reserve: {
      kicker: "Đặt bàn",
      title: "Giữ chỗ trước.",
      description: "Điền thông tin, quán gọi lại xác nhận. Không thanh toán online.",
    },
  },

  reservationForm: {
    name: "Họ và tên",
    phone: "Số điện thoại",
    guests: "Số người",
    datetime: "Ngày giờ",
    notes: "Ghi chú",
    notesPlaceholder: "Sinh nhật, ghế trẻ em, dị ứng…",
    submit: "Gửi đặt bàn",
    pending: "Đang gửi…",
    success:
      "THE HEAT đã nhận yêu cầu đặt bàn. Quán sẽ gọi xác nhận qua số điện thoại vừa nhập.",
    invalid: "Kiểm tra lại thông tin đặt bàn.",
    errors: {
      nameShort: "Nhập họ tên (tối thiểu 2 ký tự).",
      phoneInvalid: "Số này có vẻ chưa đúng — kiểm tra lại giúp quán nhé.",
      guestsRange: "Số người từ 1 đến 20.",
      datetimeRequired: "Chọn ngày giờ đến quán.",
      datetimeFuture: "Chọn mốc thời gian trong tương lai.",
      datetimeHours: "Quán nhận bàn từ 06:00 đến 21:30.",
      notesLong: "Ghi chú tối đa 300 ký tự.",
    },
  },

  footer: {
    hotline: "Hotline",
    kitchen: "Bếp & điểm nhận",
    social: "Mạng xã hội",
    legal: "Thông tin kinh doanh",
  },
} as const;

export type ReservationErrorKey = keyof typeof copy.reservationForm.errors;
