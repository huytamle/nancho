export type Lang = "vi" | "en";

export const copy = {
  vi: {
    skip: "Bỏ qua điều hướng",
    navAria: "Chính",
    navMobile: "Mobile",
    openMenu: "Mở menu",
    closeMenu: "Đóng menu",
    book: "Đặt Bàn",
    viewMenu: "Xem menu",
    hotline: "Hotline",
    nav: {
      menu: "Menu",
      delivery: "Delivery",
      space: "Không gian",
      visit: "Đến quán",
      book: "Đặt bàn",
    },
    hero: {
      location: "Thăng Bình · Đà Nẵng",
      lead: "Café specialty, pizza khay Detroit, BBQ, loaded fries và KOLD Gelato. Ngồi lại tại quán, hoặc order giao hàng.",
    },
    galleryNav: {
      prev: "Ảnh pizza trước",
      next: "Ảnh pizza sau",
      dot: "Ảnh",
    },
    menu: {
      kicker: "Thực đơn",
      title: "Café. Pizza. BBQ. Fries. Sốt. Gelato.",
      description:
        "Menu THE HEAT, sốt gọi thêm và kem KOLD Gelato. Giá mẫu — hỏi quán khi đặt bàn.",
      groups: {
        cafe: { title: "Café", kicker: "Specialty · uống tại quán" },
        pizza: { title: "Pizza", kicker: "Khay Detroit · mép phô mai cháy" },
        bbq: { title: "BBQ", kicker: "Than hồng · da bóng" },
        fries: { title: "Loaded Fries", kicker: "Khoai vàng · sốt đầy" },
        sauces: { title: "Sốt", kicker: "Gọi thêm · tuỳ chọn loại sốt" },
        gelato: { title: "Gelato", kicker: "KOLD · kem Ý lạnh sâu" },
      },
      items: {
        espresso: {
          name: "Espresso",
          description: "Shot đậm, hạt rang theo mùa",
          alt: "Tách espresso đen trên nền tối",
        },
        pourOver: {
          name: "Pour over",
          description: "Single origin, rót tay",
          alt: "Pour over Chemex và ấm đồng",
        },
        flatWhite: {
          name: "Flat white",
          description: "Sữa nóng, lớp microfoam mịn",
          alt: "Flat white với latte art",
        },
        coldBrew: {
          name: "Cold brew",
          description: "Ủ lạnh 16 giờ, uống chậm",
          alt: "Ly cold brew đá",
        },
        margherita: {
          name: "Margherita",
          description: "Cà chua, mozzarella, húng quế",
          alt: "Pizza Margherita khay Detroit",
        },
        romesco: {
          name: "Romesco",
          description: "Sốt romesco, ớt nướng, hạnh nhân",
          alt: "Pizza Romesco khay Detroit",
        },
        chickenTeriyaki: {
          name: "Gà Teriyaki",
          description: "Gà nướng, sốt teriyaki, hành lá",
          alt: "Pizza gà Teriyaki khay Detroit",
        },
        porkBbq: {
          name: "Heo nướng BBQ",
          description: "Thịt heo than, sốt BBQ, hành tây",
          alt: "Pizza heo nướng BBQ khay Detroit",
        },
        ribs: {
          name: "Sườn nướng BBQ",
          description: "Sườn heo, sốt BBQ bóng",
          alt: "Sườn nướng BBQ",
        },
        drumstick: {
          name: "Đùi gà nướng",
          description: "Đùi gà than, sốt mật ong",
          alt: "Đùi gà nướng",
        },
        thigh: {
          name: "Má đùi gà nướng",
          description: "Da cháy cạnh, mè, hành lá",
          alt: "Má đùi gà nướng mật ong",
        },
        chickenRice: {
          name: "Cơm gà nướng",
          description: "Cơm nóng, gà teriyaki",
          alt: "Cơm gà nướng teriyaki",
        },
        loadedFries: {
          name: "Loaded fries",
          description: "Phô mai chảy, sốt, hành lá",
          alt: "Loaded fries phô mai",
        },
        friesChicken: {
          name: "Fries gà Teriyaki",
          description: "Khoai, má đùi nướng, mè",
          alt: "Fries kèm gà nướng Teriyaki",
        },
        friesRibs: {
          name: "Fries sườn BBQ",
          description: "Khoai, sườn nướng, sốt BBQ",
          alt: "Fries kèm sườn BBQ",
        },
        cheddarGarlicButter: {
          name: "Cheddar Cheese Garlic Butter",
          description: "Sốt cheddar, bơ tỏi — 10.000đ/phần",
          alt: "Sốt cheddar cheese garlic butter",
        },
        heatSauce: {
          name: "The Heat Sauce",
          description: "BBQ mayonnaise — 10.000đ/phần",
          alt: "The Heat Sauce BBQ mayonnaise",
        },
        bbqSauce: {
          name: "BBQ Sauce",
          description: "Sốt BBQ — 10.000đ/phần",
          alt: "Sốt BBQ",
        },
        mintChip: {
          name: "Mint Chocolate Chip",
          description: "Bạc hà, sô cô la chip",
          alt: "Gelato mint chocolate chip KOLD",
        },
        strawberryChip: {
          name: "Strawberry Chip",
          description: "Dâu tây, sô cô la chip",
          alt: "Gelato strawberry chip KOLD",
        },
        strawberryBasil: {
          name: "Strawberry Basil",
          description: "Dâu tây, húng quế tươi",
          alt: "Gelato strawberry basil KOLD",
        },
        pistachio: {
          name: "Pistachio",
          description: "Hạt dẻ cười, kem béo",
          alt: "Gelato pistachio KOLD",
        },
      },
    },
    space: {
      kicker: "Không gian",
      title: "Ngồi lại. Ăn chậm.",
      description: "Phòng khách, quầy café, bếp than và sân ngoài trời.",
    },
    visit: {
      kicker: "Ghé quán",
      title: "Giờ mở cửa & địa chỉ",
      description:
        "THE HEAT phục vụ tại chỗ. Đặt bàn trước giờ cao điểm tối, đặc biệt cuối tuần.",
      address: "Địa chỉ",
      addressValue: "162 Nguyễn Thuật, xã Thăng Bình, thành phố Đà Nẵng",
      openMaps: "Mở Google Maps",
      hours: "Giờ mở cửa",
      mapTitle: "Bản đồ THE HEAT tại 162 Nguyễn Thuật, Thăng Bình",
      rows: [
        { days: "Thứ 2 – Chủ nhật", time: "06:00 – 21:30" },
        { days: "Café", time: "06:00 – 21:30" },
        { days: "Pizza, BBQ, fries", time: "17:00 – 21:30" },
      ],
    },
    delivery: {
      kicker: "Giao hàng",
      title: "Order mang về.",
      description:
        "Chọn món từ menu, điền địa chỉ. Quán gọi xác nhận — chưa thanh toán online. Giao khu vực Thăng Bình.",
      all: "Tất cả",
      add: "Thêm",
      cart: "Giỏ hàng",
      empty: "Chưa chọn món.",
      subtotal: "Tạm tính",
      fee: "Phí giao",
      total: "Tổng",
      address: "Địa chỉ giao",
      addressPlaceholder: "Số nhà, đường, xã Thăng Bình…",
      notesPlaceholder: "Ít cay, không hành, giao giờ trưa…",
      submit: "Gửi đơn",
      pending: "Đang gửi…",
      success:
        "THE HEAT đã nhận đơn. Quán sẽ gọi xác nhận và báo thời gian giao.",
      invalid: "Kiểm tra lại đơn hàng.",
      errors: {
        emptyCart: "Chọn ít nhất một món.",
        nameShort: "Nhập họ tên (tối thiểu 2 ký tự).",
        phoneInvalid: "Số điện thoại Việt Nam không hợp lệ.",
        addressShort: "Nhập địa chỉ giao (tối thiểu 8 ký tự).",
        notesLong: "Ghi chú tối đa 300 ký tự.",
      },
    },
    reserve: {
      kicker: "Đặt bàn",
      title: "Giữ chỗ trước.",
      description:
        "Điền form, quán gọi lại xác nhận. Không thanh toán online. Ăn tại quán hoặc order ở mục Delivery.",
    },
    form: {
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
        phoneInvalid: "Số điện thoại Việt Nam không hợp lệ.",
        guestsRange: "Số người từ 1 đến 20.",
        datetimeRequired: "Chọn ngày giờ đến quán.",
        datetimeFuture: "Chọn mốc thời gian trong tương lai.",
        datetimeHours: "Quán nhận bàn từ 06:00 đến 21:30.",
        notesLong: "Ghi chú tối đa 300 ký tự.",
      },
    },
    footer: {
      social: "Mạng xã hội",
      dineIn: "Ăn tại quán hoặc giao hàng khu vực Thăng Bình.",
    },
    theme: {
      toLight: "Chuyển giao diện sáng",
      toDark: "Chuyển giao diện tối",
    },
    lang: {
      label: "Ngôn ngữ",
      vi: "Tiếng Việt",
      en: "English",
    },
  },
  en: {
    skip: "Skip navigation",
    navAria: "Primary",
    navMobile: "Mobile",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    book: "Reserve",
    viewMenu: "View menu",
    hotline: "Hotline",
    nav: {
      menu: "Menu",
      delivery: "Delivery",
      space: "Space",
      visit: "Visit",
      book: "Reserve",
    },
    hero: {
      location: "Thang Binh · Da Nang",
      lead: "Specialty coffee, Detroit pan pizza, BBQ, loaded fries, and KOLD Gelato. Dine in, or order delivery.",
    },
    galleryNav: {
      prev: "Previous pizza photo",
      next: "Next pizza photo",
      dot: "Photo",
    },
    menu: {
      kicker: "Menu",
      title: "Café. Pizza. BBQ. Fries. Sauces. Gelato.",
      description:
        "THE HEAT menu, extra sauces, and KOLD Gelato. Sample prices — ask when you book.",
      groups: {
        cafe: { title: "Café", kicker: "Specialty · drink in" },
        pizza: { title: "Pizza", kicker: "Detroit pan · caramelized edge" },
        bbq: { title: "BBQ", kicker: "Live charcoal · glazed skin" },
        fries: { title: "Loaded Fries", kicker: "Crisp potatoes · loaded sauce" },
        sauces: { title: "Sauces", kicker: "Add-on · pick your sauce" },
        gelato: { title: "Gelato", kicker: "KOLD · Italian-style gelato" },
      },
      items: {
        espresso: {
          name: "Espresso",
          description: "Bold shot, seasonal beans",
          alt: "Black espresso cup on a dark surface",
        },
        pourOver: {
          name: "Pour over",
          description: "Single origin, hand poured",
          alt: "Chemex pour over and copper kettle",
        },
        flatWhite: {
          name: "Flat white",
          description: "Steamed milk, fine microfoam",
          alt: "Flat white with latte art",
        },
        coldBrew: {
          name: "Cold brew",
          description: "Steeped 16 hours, sip slowly",
          alt: "Iced cold brew glass",
        },
        margherita: {
          name: "Margherita",
          description: "Tomato, mozzarella, basil",
          alt: "Detroit pan Margherita pizza",
        },
        romesco: {
          name: "Romesco",
          description: "Romesco sauce, roasted pepper, almond",
          alt: "Detroit pan Romesco pizza",
        },
        chickenTeriyaki: {
          name: "Teriyaki chicken",
          description: "Grilled chicken, teriyaki, scallion",
          alt: "Detroit pan teriyaki chicken pizza",
        },
        porkBbq: {
          name: "BBQ pork",
          description: "Charcoal pork, BBQ sauce, onion",
          alt: "Detroit pan BBQ pork pizza",
        },
        ribs: {
          name: "BBQ ribs",
          description: "Pork ribs, glossy BBQ sauce",
          alt: "BBQ pork ribs",
        },
        drumstick: {
          name: "Grilled drumstick",
          description: "Charcoal chicken, honey glaze",
          alt: "Grilled chicken drumstick",
        },
        thigh: {
          name: "Grilled chicken thigh",
          description: "Crisp skin, sesame, scallion",
          alt: "Honey grilled chicken thighs",
        },
        chickenRice: {
          name: "Grilled chicken rice",
          description: "Hot rice, teriyaki chicken",
          alt: "Teriyaki grilled chicken rice",
        },
        loadedFries: {
          name: "Loaded fries",
          description: "Melted cheese, sauce, scallion",
          alt: "Loaded cheese fries",
        },
        friesChicken: {
          name: "Teriyaki chicken fries",
          description: "Fries, grilled thigh, sesame",
          alt: "Fries with teriyaki chicken",
        },
        friesRibs: {
          name: "BBQ rib fries",
          description: "Fries, grilled ribs, BBQ sauce",
          alt: "Fries with BBQ ribs",
        },
        cheddarGarlicButter: {
          name: "Cheddar Cheese Garlic Butter",
          description: "Cheddar, garlic butter — 10,000 VND each",
          alt: "Cheddar cheese garlic butter sauce",
        },
        heatSauce: {
          name: "The Heat Sauce",
          description: "BBQ mayonnaise — 10,000 VND each",
          alt: "The Heat Sauce BBQ mayonnaise",
        },
        bbqSauce: {
          name: "BBQ Sauce",
          description: "Barbecue sauce — 10,000 VND each",
          alt: "BBQ sauce",
        },
        mintChip: {
          name: "Mint Chocolate Chip",
          description: "Mint, chocolate chips",
          alt: "KOLD mint chocolate chip gelato",
        },
        strawberryChip: {
          name: "Strawberry Chip",
          description: "Strawberry, chocolate chips",
          alt: "KOLD strawberry chip gelato",
        },
        strawberryBasil: {
          name: "Strawberry Basil",
          description: "Strawberry, fresh basil",
          alt: "KOLD strawberry basil gelato",
        },
        pistachio: {
          name: "Pistachio",
          description: "Pistachio, rich cream",
          alt: "KOLD pistachio gelato",
        },
      },
    },
    space: {
      kicker: "Space",
      title: "Sit down. Eat slow.",
      description: "Dining room, coffee bar, charcoal grill, and patio.",
    },
    visit: {
      kicker: "Visit",
      title: "Hours & address",
      description:
        "THE HEAT is dine-in only. Book ahead for peak evening hours, especially weekends.",
      address: "Address",
      addressValue: "162 Nguyen Thuat, Thang Binh, Da Nang",
      openMaps: "Open Google Maps",
      hours: "Hours",
      mapTitle: "Map of THE HEAT at 162 Nguyen Thuat, Thang Binh",
      rows: [
        { days: "Monday – Sunday", time: "06:00 – 21:30" },
        { days: "Café", time: "06:00 – 21:30" },
        { days: "Pizza, BBQ, fries", time: "17:00 – 21:30" },
      ],
    },
    delivery: {
      kicker: "Delivery",
      title: "Order to go.",
      description:
        "Pick dishes from the menu and add your address. We will call to confirm — no online payment. Delivery around Thang Binh.",
      all: "All",
      add: "Add",
      cart: "Cart",
      empty: "No dishes yet.",
      subtotal: "Subtotal",
      fee: "Delivery fee",
      total: "Total",
      address: "Delivery address",
      addressPlaceholder: "House number, street, Thang Binh…",
      notesPlaceholder: "Less spicy, no onion, lunch drop-off…",
      submit: "Place order",
      pending: "Sending…",
      success:
        "THE HEAT received your order. We will call to confirm and share a delivery time.",
      invalid: "Please check your order.",
      errors: {
        emptyCart: "Add at least one dish.",
        nameShort: "Enter your name (at least 2 characters).",
        phoneInvalid: "Enter a valid Vietnamese phone number.",
        addressShort: "Enter a delivery address (at least 8 characters).",
        notesLong: "Notes can be up to 300 characters.",
      },
    },
    reserve: {
      kicker: "Reserve",
      title: "Hold a table.",
      description:
        "Fill in the form and we will call to confirm. No online payment. Dine in, or order from Delivery.",
    },
    form: {
      name: "Full name",
      phone: "Phone number",
      guests: "Guests",
      datetime: "Date & time",
      notes: "Notes",
      notesPlaceholder: "Birthday, high chair, allergies…",
      submit: "Send reservation",
      pending: "Sending…",
      success:
        "THE HEAT received your reservation. We will call to confirm on the number you entered.",
      invalid: "Please check your reservation details.",
      errors: {
        nameShort: "Enter your name (at least 2 characters).",
        phoneInvalid: "Enter a valid Vietnamese phone number.",
        guestsRange: "Party size must be 1 to 20.",
        datetimeRequired: "Choose a date and time.",
        datetimeFuture: "Choose a time in the future.",
        datetimeHours: "We take tables from 06:00 to 21:30.",
        notesLong: "Notes can be up to 300 characters.",
      },
    },
    footer: {
      social: "Social",
      dineIn: "Dine in, or delivery around Thang Binh.",
    },
    theme: {
      toLight: "Switch to light mode",
      toDark: "Switch to dark mode",
    },
    lang: {
      label: "Language",
      vi: "Tiếng Việt",
      en: "English",
    },
  },
} as const;

export type Copy = (typeof copy)[Lang];
