// Thực đơn dùng tại quán THE HEAT (trang /tai-quan). Không thuộc catalog đặt món.

export type DineInItem = {
  id: string;
  name: string;
  description: string;
  alt: string;
  price: number;
  image: string;
};

export type DineInGroup = {
  id: "cafe" | "gelato";
  title: string;
  kicker: string;
  brand?: "kold";
  items: DineInItem[];
};

export const dineInMenu: DineInGroup[] = [
  {
    id: "cafe",
    title: "Café",
    kicker: "Specialty · uống tại quán",
    items: [
      {
        id: "espresso",
        name: "Espresso",
        description: "Shot đậm, hạt rang theo mùa",
        alt: "Tách espresso đen trên nền tối",
        price: 35000,
        image: "/images/menu/espresso.jpg",
      },
      {
        id: "pour-over",
        name: "Pour over",
        description: "Single origin, rót tay",
        alt: "Pour over Chemex và ấm đồng",
        price: 55000,
        image: "/images/menu/pour-over.jpg",
      },
      {
        id: "flat-white",
        name: "Flat white",
        description: "Sữa nóng, lớp microfoam mịn",
        alt: "Flat white với latte art",
        price: 49000,
        image: "/images/menu/flat-white.jpg",
      },
      {
        id: "cold-brew",
        name: "Cold brew",
        description: "Ủ lạnh 16 giờ, uống chậm",
        alt: "Ly cold brew đá",
        price: 45000,
        image: "/images/menu/cold-brew.jpg",
      },
    ],
  },
  {
    id: "gelato",
    title: "Gelato",
    kicker: "KOLD · kem Ý lạnh sâu",
    brand: "kold",
    items: [
      {
        id: "mint-chip",
        name: "Mint Chocolate Chip",
        description: "Bạc hà, sô cô la chip",
        alt: "Gelato mint chocolate chip KOLD",
        price: 49000,
        image: "/images/menu/gelato-mint.jpg",
      },
      {
        id: "strawberry-chip",
        name: "Strawberry Chip",
        description: "Dâu tây, sô cô la chip",
        alt: "Gelato strawberry chip KOLD",
        price: 49000,
        image: "/images/menu/gelato-strawberry-chip.jpg",
      },
      {
        id: "strawberry-basil",
        name: "Strawberry Basil",
        description: "Dâu tây, húng quế tươi",
        alt: "Gelato strawberry basil KOLD",
        price: 55000,
        image: "/images/menu/gelato-strawberry-basil.jpg",
      },
      {
        id: "pistachio",
        name: "Pistachio",
        description: "Hạt dẻ cười, kem béo",
        alt: "Gelato pistachio KOLD",
        price: 59000,
        image: "/images/menu/gelato-pistachio.jpg",
      },
    ],
  },
];
