export const site = {
  name: "THE HEAT",
  shortName: "THE HEAT",
  tagline: "Crafted by fire. Refined by science.",
  description:
    "THE HEAT — quán ăn tại chỗ ở 162 Nguyễn Thuật, xã Thăng Bình, thành phố Đà Nẵng. Café specialty, pizza khay Detroit, BBQ, loaded fries và KOLD Gelato.",
  locationLabel: "Thăng Bình · Đà Nẵng",
  address: "162 Nguyễn Thuật, xã Thăng Bình, thành phố Đà Nẵng",
  mapsQuery: "162 Nguyễn Thuật, Thăng Bình, Đà Nẵng",
  mapsEmbedUrl:
    "https://maps.google.com/maps?q=162%20Nguy%E1%BB%85n%20Thu%E1%BA%ADt%2C%20Th%C4%83ng%20B%C3%ACnh%2C%20%C4%90%C3%A0%20N%E1%BA%B5ng&hl=vi&z=16&output=embed",
  mapsLink:
    "https://www.google.com/maps/search/?api=1&query=162+Nguy%E1%BB%85n+Thu%E1%BA%ADt%2C+Th%C4%83ng+B%C3%ACnh%2C+%C4%90%C3%A0+N%E1%BA%B5ng",
  phoneDisplay: "0922 662 669",
  phoneHref: "tel:+84922662669",
  hours: [
    { days: "Thứ 2 – Chủ nhật", time: "06:00 – 21:30" },
    { days: "Café", time: "06:00 – 21:30" },
    { days: "Pizza, BBQ, fries", time: "17:00 – 21:30" },
  ],
  social: {
    facebook: "https://www.facebook.com/theheat.thangbinh",
    instagram: "https://www.instagram.com/theheat.thangbinh",
  },
  nav: [
    { href: "#menu", label: "Menu" },
    { href: "#khong-gian", label: "Không gian" },
    { href: "#den-quan", label: "Đến quán" },
    { href: "#dat-ban", label: "Đặt bàn" },
  ],
} as const;
