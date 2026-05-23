import { ImageResponse } from "next/og";

export const alt = "Slate — The CMS WordPress should have been";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#0a0a0c",
          backgroundImage:
            "radial-gradient(ellipse 70% 50% at 25% 15%, rgba(168, 163, 255, 0.20), transparent 60%), radial-gradient(ellipse 60% 40% at 75% 85%, rgba(255, 180, 140, 0.10), transparent 60%)",
          color: "#f5f5f0",
          fontFamily: "Georgia, serif",
          padding: 80,
        }}
      >
        <div
          style={{
            fontSize: 18,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "#6b6b80",
            fontFamily: "ui-monospace, monospace",
            marginBottom: 32,
          }}
        >
          ◐ Slate · Hosted CMS
        </div>
        <div
          style={{
            fontSize: 90,
            lineHeight: 1.05,
            letterSpacing: -2,
            textAlign: "center",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          The CMS&nbsp;
          <span style={{ color: "#a8a3ff", fontStyle: "italic" }}>WordPress</span>
          &nbsp;should have been.
        </div>
        <div
          style={{
            fontSize: 24,
            color: "#9a9aa8",
            marginTop: 32,
            textAlign: "center",
          }}
        >
          Block-based authoring with AI drafts — fully managed.
        </div>
      </div>
    ),
    size,
  );
}
