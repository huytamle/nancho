export type MenuItemId =
  | "espresso"
  | "pourOver"
  | "flatWhite"
  | "coldBrew"
  | "margherita"
  | "romesco"
  | "chickenTeriyaki"
  | "porkBbq"
  | "ribs"
  | "drumstick"
  | "thigh"
  | "chickenRice"
  | "loadedFries"
  | "friesChicken"
  | "friesRibs"
  | "cheddarGarlicButter"
  | "heatSauce"
  | "bbqSauce"
  | "mintChip"
  | "strawberryChip"
  | "strawberryBasil"
  | "pistachio";

export type MenuItem = {
  id: MenuItemId;
  price: number;
  image: string;
};

export type MenuGroup = {
  id: "cafe" | "pizza" | "bbq" | "fries" | "sauces" | "gelato";
  title: string;
  kicker: string;
  brand?: "kold";
  items: MenuItem[];
};

export const menu: MenuGroup[] = [
  {
    id: "cafe",
    title: "Café",
    kicker: "Specialty · uống tại quán",
    items: [
      { id: "espresso", price: 35000, image: "/images/menu/espresso.jpg" },
      { id: "pourOver", price: 55000, image: "/images/menu/pour-over.jpg" },
      { id: "flatWhite", price: 49000, image: "/images/menu/flat-white.jpg" },
      { id: "coldBrew", price: 45000, image: "/images/menu/cold-brew.jpg" },
    ],
  },
  {
    id: "pizza",
    title: "Pizza",
    kicker: "Khay Detroit · mép phô mai cháy",
    items: [
      { id: "margherita", price: 139000, image: "/images/menu/pan-margherita.jpg" },
      { id: "romesco", price: 159000, image: "/images/menu/pan-romesco.jpg" },
      { id: "chickenTeriyaki", price: 169000, image: "/images/menu/pan-teriyaki.jpg" },
      { id: "porkBbq", price: 175000, image: "/images/menu/pan-bbq.jpg" },
    ],
  },
  {
    id: "bbq",
    title: "BBQ",
    kicker: "Than hồng · da bóng",
    items: [
      { id: "ribs", price: 159000, image: "/images/menu/bbq-ribs.jpg" },
      { id: "drumstick", price: 95000, image: "/images/menu/bbq-drumstick.jpg" },
      { id: "thigh", price: 89000, image: "/images/menu/bbq-thigh.jpg" },
      { id: "chickenRice", price: 79000, image: "/images/menu/bbq-rice.jpg" },
    ],
  },
  {
    id: "fries",
    title: "Loaded Fries",
    kicker: "Khoai vàng · sốt đầy",
    items: [
      { id: "loadedFries", price: 69000, image: "/images/menu/fries-loaded.jpg" },
      { id: "friesChicken", price: 89000, image: "/images/menu/fries-chicken.jpg" },
      { id: "friesRibs", price: 99000, image: "/images/menu/fries-ribs.jpg" },
    ],
  },
  {
    id: "sauces",
    title: "Sốt",
    kicker: "Gọi thêm · 10.000đ/phần",
    items: [
      { id: "cheddarGarlicButter", price: 10000, image: "/images/menu/sauce-cheddar.jpg" },
      { id: "heatSauce", price: 10000, image: "/images/menu/sauce-heat.jpg" },
      { id: "bbqSauce", price: 10000, image: "/images/menu/sauce-bbq.jpg" },
    ],
  },
  {
    id: "gelato",
    title: "Gelato",
    kicker: "KOLD · kem Ý lạnh sâu",
    brand: "kold",
    items: [
      { id: "mintChip", price: 49000, image: "/images/menu/gelato-mint.jpg" },
      { id: "strawberryChip", price: 49000, image: "/images/menu/gelato-strawberry-chip.jpg" },
      { id: "strawberryBasil", price: 55000, image: "/images/menu/gelato-strawberry-basil.jpg" },
      { id: "pistachio", price: 59000, image: "/images/menu/gelato-pistachio.jpg" },
    ],
  },
];
