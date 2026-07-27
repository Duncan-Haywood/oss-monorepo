/**
 * Per-lead Open Graph / Twitter card image for /preview/[slug] — shared by
 * src/app/preview/[slug]/opengraph-image.tsx and twitter-image.tsx.
 *
 * Every /preview/[slug] link is shared cold (outreach emails, Slack/iMessage
 * previews of a link the operator or a prospect pastes) — before this, that
 * unfurl had a title/description (leadMetaTitle/leadMetaDescription, see
 * seo.ts) but no image, same gap as the site-wide pages
 * (site-brand-image.tsx). A branded per-business card makes a shared preview
 * link look like a real, already-built site rather than a bare text link,
 * which is the entire pitch of "preview before you buy."
 *
 * Reuses softCapLeadForPublicSurface (same read-time cap every other public
 * preview surface applies) and getCategoryTheme's `label` (single source of
 * truth for the category display string — see themes.ts). The hex accent
 * map below is separate from CATEGORY_THEMES's Tailwind classes: satori (the
 * next/og renderer) does not resolve Tailwind utility classes, only inline
 * style objects, so this needs its own literal color per category rather
 * than reusing accentTextClass.
 */
import { ImageResponse } from "next/og";
import { brand } from "@/lib/brand";
import { softCapLeadForPublicSurface } from "@/lib/leads/public-fields";
import type { BusinessCategory, Lead } from "@/lib/leads/types";
import { getCategoryTheme } from "@/lib/previews/themes";
import type { RateLimitResult } from "@/lib/security/rate-limit";

export const LEAD_OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;
export const LEAD_OG_IMAGE_ALT = "Business preview";

/**
 * Visual fit on a fixed 1200x630 canvas, distinct from the storage/HTML soft
 * cap in public-fields.ts (MAX_BUSINESS_NAME_LENGTH=200 etc — far longer
 * than a headline can render at a legible size).
 */
export function truncateForOgImage(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

const CATEGORY_ACCENT_HEX: Record<BusinessCategory, string> = {
  restaurant: "#fb923c",
  salon: "#fb7185",
  trades: "#2dd4bf",
  retail: "#8b5cf6",
  generic: "#a1a1aa",
};

export function leadOgImageAccentHex(category: BusinessCategory): string {
  return CATEGORY_ACCENT_HEX[category];
}

export function renderLeadOgImage(lead: Lead): ImageResponse {
  const capped = softCapLeadForPublicSurface(lead);
  const theme = getCategoryTheme(capped.category);
  const accent = leadOgImageAccentHex(capped.category);
  const name = truncateForOgImage(capped.businessName, 48);
  const location = truncateForOgImage(`${capped.city}, ${capped.state}`, 60);

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
          {theme.label}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 68,
            fontWeight: 700,
            lineHeight: 1.1,
            color: "#ffffff",
          }}
        >
          {name}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 20,
            fontSize: 32,
            color: "#a1a1aa",
          }}
        >
          {location}
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
    LEAD_OG_IMAGE_SIZE,
  );
}

export type LeadOgImagePlan =
  | { kind: "rate_limited" }
  | { kind: "not_found" }
  | { kind: "lead"; lead: Lead };

export interface PlanLeadOgImageDeps {
  loadLead: (slug: string) => Promise<Lead | null>;
  checkRateLimit: (key: string) => RateLimitResult;
}

/**
 * Both opengraph-image.tsx and twitter-image.tsx are public, unauthenticated,
 * and take an arbitrary attacker-chosen slug — unlike every other public
 * data-driven route in this codebase (contact form, checkout create,
 * preview-open beacon, unsubscribe), neither had per-IP rate limiting before
 * this, even though rendering costs a DB round trip (loadPreviewPageLead
 * resolves ANY slug to a real or synthetic lead, so there's no cheap
 * existence short-circuit) plus a full satori layout + PNG raster — the most
 * CPU-expensive operation any public route in the app performs. A scripted
 * loop over random slugs could force unbounded renders with zero throttling.
 * See preview-og-image-rate-limit.
 *
 * Checks the rate limit BEFORE the DB lookup (same ordering every other
 * public route uses) so a limited request never pays the DB round trip
 * either. One shared bucket key across both routes (og-image/twitter-image
 * cost the same and are the same abuse surface) — key by clientIp, not by
 * slug, matching preview-open's `preview-open:${clientIp}` pattern.
 */
export async function planLeadOgImageResponse(
  slug: string,
  clientIp: string,
  deps: PlanLeadOgImageDeps,
): Promise<LeadOgImagePlan> {
  const rate = deps.checkRateLimit(`preview-og-image:${clientIp}`);
  if (!rate.allowed) {
    return { kind: "rate_limited" };
  }
  const lead = await deps.loadLead(slug);
  if (!lead) {
    return { kind: "not_found" };
  }
  return { kind: "lead", lead };
}
