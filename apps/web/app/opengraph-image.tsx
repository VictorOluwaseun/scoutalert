import { ImageResponse } from "next/og";
import { publicSite } from "@/features/seo/site";

export const alt =
  "ScoutAlert — Your AI scout for jobs, contracts, and client projects.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Prerenders a branded sharing card using local markup, without remote assets or runtime services. */
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "64px 72px",
        background: "#f6f7f8",
        color: "#191c22",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <svg width="64" height="64" viewBox="0 0 34 34" fill="none">
          <rect width="34" height="34" rx="11" fill="#191c22" />
          <path
            d="m22.5 10.5-3.2 8.8-8.8 3.2 3.2-8.8 8.8-3.2Z"
            fill="#D9EF70"
          />
          <path d="m14 14 5.4 5.4" stroke="#191c22" strokeWidth="1.5" />
        </svg>
        <span style={{ fontSize: 38, fontWeight: 700 }}>{publicSite.name}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            fontSize: 76,
            fontWeight: 700,
            lineHeight: 1.08,
            maxWidth: 940,
          }}
        >
          Your AI scout for work worth pursuing.
        </div>
        <div style={{ fontSize: 30, color: "#394657" }}>
          Jobs, contracts, and client projects. On your terms.
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 24 }}>scoutalert.app</span>
        <div
          style={{
            width: 160,
            height: 12,
            borderRadius: 6,
            background: "#d9ef70",
          }}
        />
      </div>
    </div>,
    size,
  );
}
