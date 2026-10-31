import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Be_Vietnam_Pro } from "next/font/google";
import { LanguageProvider } from "@/components/language-provider";
import { JsonLd } from "@/components/json-ld";
import { site } from "@/data/site";
import "./globals.css";

const beVietnam = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const themeInit = `(function(){try{var t=localStorage.getItem("theheat-theme");if(t==="light"){document.documentElement.classList.add("light");document.documentElement.classList.remove("dark")}else{document.documentElement.classList.add("dark");document.documentElement.classList.remove("light")}var l=localStorage.getItem("theheat-lang");document.documentElement.lang=l==="en"?"en":"vi"}catch(e){document.documentElement.classList.add("dark");document.documentElement.lang="vi"}})();`;

export const metadata: Metadata = {
  metadataBase: new URL("https://theheat.vn"),
  title: {
    default: "THE HEAT – Café, pizza, BBQ & loaded fries tại Thăng Bình",
    template: "%s · THE HEAT",
  },
  description: site.description,
  keywords: [
    "THE HEAT",
    "Thăng Bình",
    "café specialty",
    "pizza",
    "BBQ",
    "loaded fries",
    "KOLD Gelato",
    "gelato",
    "quán ăn Đà Nẵng",
    "đặt bàn",
  ],
  applicationName: site.name,
  authors: [{ name: site.name }],
  openGraph: {
    type: "website",
    locale: "vi_VN",
    siteName: site.name,
    title: "THE HEAT – Café, pizza, BBQ & loaded fries tại Thăng Bình",
    description: site.description,
  },
  twitter: {
    card: "summary_large_image",
    title: "THE HEAT – Café, pizza, BBQ & loaded fries tại Thăng Bình",
    description: site.description,
  },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${beVietnam.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-bg font-sans text-text">
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInit}
        </Script>
        <JsonLd />
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
