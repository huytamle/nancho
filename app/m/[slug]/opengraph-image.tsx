import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { site } from "@/data/site";
import { formatPrice } from "@/lib/format";
import { getCatalog } from "@/lib/server/dal/catalog";

// Ảnh chia sẻ từng món (§13.2): ảnh món + tên + giá + "Đặt lò tại theheatpizza.vn" — để link Facebook/Zalo đẹp.
// Font Be Vietnam Pro (OFL, từ @fontsource) nằm trong assets/og: font mặc định của ImageResponse thiếu dấu tiếng Việt.

export const alt = "Món của THE HEAT PIZZA";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#ff3d00";

const font = (file: string) => readFile(join(process.cwd(), "assets/og", file));
// product.image = "/images/<thư mục>/<tệp>.jpg" (data/seed.ts) → chỉ đọc trong public/images.
const photoOf = (image: string) => readFile(join(process.cwd(), "public/images", image.replace(/^\/images\//, "")));

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { products } = await getCatalog();
  const p = products.find((x) => x.id === slug);
  const [latin, vi] = await Promise.all([font("be-vietnam-pro-latin-700-normal.woff"), font("be-vietnam-pro-vietnamese-700-normal.woff")]);
  const photo = p ? `data:image/jpeg;base64,${(await photoOf(p.image)).toString("base64")}` : null;
  const host = site.url.replace(/^https?:\/\//, "");

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#000", color: "#fff", fontFamily: "BVP" }}>
        {photo ? (
          <img src={photo} alt="" width={630} height={630} style={{ width: 630, height: 630, objectFit: "cover" }} />
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, padding: "56px 52px" }}>
          <div style={{ display: "flex", fontSize: 28, letterSpacing: 4, color: ACCENT }}>{site.name}</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: p && p.name.length > 22 ? 52 : 62, lineHeight: 1.1 }}>{p?.name ?? site.name}</div>
            {p ? <div style={{ display: "flex", marginTop: 20, fontSize: 44, color: "#c8c8c8" }}>{formatPrice(p.price)}</div> : null}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 26, color: "#c8c8c8" }}>Nướng theo mẻ · Đặt trước mới làm</div>
            <div
              style={{ display: "flex", marginTop: 16, alignSelf: "flex-start", background: ACCENT, color: "#000", borderRadius: 999, padding: "14px 30px", fontSize: 30 }}
            >
              {`Đặt lò tại ${host}`}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "BVP", data: latin, weight: 700, style: "normal" },
        { name: "BVP", data: vi, weight: 700, style: "normal" },
      ],
    },
  );
}
