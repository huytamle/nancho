import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 22,
            height: 22,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 2,
              top: 2,
              width: 8,
              height: 18,
              background: "#c8c8c8",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 2,
              top: 8,
              width: 12,
              height: 6,
              background: "#c8c8c8",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 1,
              top: 1,
              width: 10,
              height: 20,
              background: "#ff3d00",
              borderRadius: "0 8px 2px 0",
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
