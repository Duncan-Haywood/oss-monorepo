import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const title = searchParams.get("title") || "The Adventurous Anchors";
    const score = searchParams.get("score") || "88%";
    const names = searchParams.get("names") || "You & Partner";
    const insight = searchParams.get("insight") || "High alignment on life direction with a creative gap on spontaneity.";

    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "space-between",
            backgroundImage: "linear-gradient(to bottom right, #180d2a, #0d0d12, #210d1c)",
            padding: "60px",
            fontFamily: "sans-serif",
            color: "#ffffff",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: "28px", marginRight: "12px" }}>✨</span>
              <span style={{ fontSize: "22px", fontWeight: 700, color: "#a855f7", letterSpacing: "2px" }}>
                QUICK PICK • RELATIONSHIP INSIGHT
              </span>
            </div>
            <div
              style={{
                display: "flex",
                background: "rgba(168, 85, 247, 0.2)",
                border: "1px solid rgba(168, 85, 247, 0.4)",
                padding: "8px 20px",
                borderRadius: "30px",
                fontSize: "20px",
                fontWeight: 700,
                color: "#e9d5ff",
              }}
            >
              {score} Aligned
            </div>
          </div>

          {/* Center Card Content */}
          <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
            <div style={{ fontSize: "18px", color: "#d8b4fe", marginBottom: "8px", fontWeight: 600 }}>
              RELATIONSHIP ARCHETYPE
            </div>
            <div
              style={{
                fontSize: "44px",
                fontWeight: 800,
                backgroundImage: "linear-gradient(to right, #f472b6, #c084fc, #ffffff)",
                backgroundClip: "text",
                color: "transparent",
                marginBottom: "24px",
                lineHeight: 1.2,
              }}
            >
              {title}
            </div>
            <div style={{ fontSize: "24px", color: "#d1d5db", lineHeight: 1.5, maxWidth: "900px" }}>
              &ldquo;{insight}&rdquo;
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              width: "100%",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid rgba(255, 255, 255, 0.1)",
              paddingTop: "30px",
              color: "#9ca3af",
              fontSize: "20px",
            }}
          >
            <div>{names}</div>
            <div style={{ color: "#c084fc", fontWeight: 600 }}>quickpick.app</div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (err) {
    console.error("OG generation error", err);
    return new Response("Failed to generate OG image", { status: 500 });
  }
}
