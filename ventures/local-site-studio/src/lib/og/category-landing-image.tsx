/**
 * Open Graph / Twitter card image for the /websites-for-* category landing
 * pages — shared by each category's opengraph-image.tsx / twitter-image.tsx.
 *
 * Without this, the three pages (src/app/websites-for-restaurants, -salons,
 * -trades) inherited the generic site-wide card (site-brand-image.tsx) via
 * Next.js segment-inheritance fallback: sharing e.g.
 * /websites-for-restaurants in Slack/iMessage/X unfurled the same card as
 * the bare homepage, undercutting the whole point of a page built to earn
 * and convert category-specific organic/shared traffic (see
 * category-landing-pages in prompt_process.tsx BUSINESS_DECISIONS) — same
 * gap this codebase already fixed once for the homepage and once for
 * /preview/[slug] (see those modules' own header comments).
 *
 * Reuses leadOgImageAccentHex (lead-preview-image.tsx) so the category
 * accent color stays a single source of truth across the per-lead preview
 * card and this landing-page card. CATEGORY_LANDING_PAGES is a small, fixed,
 * curated array (not user input), so unlike /preview/[slug]'s per-lead
 * image this needs no rate limiting — it's prerendered at build time same
 * as the root opengraph-image.tsx (confirmed ○ Static in the build output).
 */
import { ImageResponse } from "next/og";
import { brand } from "@/lib/brand";
import type { CategoryLandingPage } from "@/lib/marketing/category-landing";
import { leadOgImageAccentHex, truncateForOgImage } from "./lead-preview-image";

export const CATEGORY_LANDING_OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

export function categoryLandingOgImageAlt(page: CategoryLandingPage): string {
  return `${page.seoTitle} — ${brand.name}`;
}

export function renderCategoryLandingOgImage(page: CategoryLandingPage): ImageResponse {
  const accent = leadOgImageAccentHex(page.category);
  const headline = truncateForOgImage(page.heroHeadline, 72);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 80,
          background: "#18181b",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 24,
            fontWeight: 700,
            color: accent,
            textTransform: "uppercase",
            letterSpacing: 4,
          }}
        >
          {page.navLabel}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.15,
            color: "#ffffff",
          }}
        >
          {headline}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: "auto",
            fontSize: 26,
            color: "#71717a",
          }}
        >
          {brand.name}
        </div>
      </div>
    ),
    CATEGORY_LANDING_OG_IMAGE_SIZE,
  );
}
