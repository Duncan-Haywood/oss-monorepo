/**
 * Shared render for the site-wide (non-lead) Open Graph / Twitter card image
 * — the homepage and every static page that doesn't ship its own image
 * (docs pages, /checkout, /privacy, /terms) via the opengraph-image.tsx /
 * twitter-image.tsx file convention's segment-inheritance.
 *
 * homepage-social-share-metadata (2026-07-18) added openGraph/twitter TEXT
 * metadata but no image — sharing any of these links on Slack/iMessage/X/
 * LinkedIn still unfurled with no visual, just a title/description. This is
 * the follow-up: an actual branded card so a shared link looks intentional.
 */
import { ImageResponse } from "next/og";
import { brand } from "@/lib/brand";

export const SITE_OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

export function siteOgImageAlt(): string {
  return `${brand.name} — pre-built websites for local businesses`;
}

export function renderSiteOgImage(): ImageResponse {
  const name = brand.name;
  const monogram = name.trim().charAt(0).toUpperCase() || "?";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#18181b",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 96,
            height: 96,
            borderRadius: 24,
            background: "#f4f4f5",
            color: "#18181b",
            fontSize: 48,
            fontWeight: 700,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 40,
          }}
        >
          {monogram}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 700,
            color: "#ffffff",
            textAlign: "center",
          }}
        >
          {name}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 20,
            fontSize: 30,
            color: "#a1a1aa",
            textAlign: "center",
          }}
        >
          Pre-built websites for local businesses
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 10,
            fontSize: 24,
            color: "#71717a",
            textAlign: "center",
          }}
        >
          Preview before you buy · Live in days
        </div>
      </div>
    ),
    SITE_OG_IMAGE_SIZE,
  );
}
