/**
 * SEO helpers shared by the marketing site and per-client preview pages.
 * Starter sells "Basic SEO" (see landing page copy) — this is what backs it:
 * per-page metadata, canonical URLs, and LocalBusiness structured data.
 */
import type { BusinessCategory, Lead } from "@/lib/leads/types";

const DEFAULT_SITE_URL = "http://localhost:3000";

/** Absolute site origin, no trailing slash. Falls back to localhost outside Vercel/prod. */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;
  return DEFAULT_SITE_URL;
}

export function previewUrl(slug: string): string {
  return `${siteUrl()}/preview/${slug}`;
}

/**
 * Whether a lead's /preview/[slug] page should be publicly indexable (listed
 * in the marketing sitemap AND crawlable by search engines).
 *
 * A cold-prospected local business is a real person's business that never
 * engaged, never consented, and never paid — publishing an AI-generated demo
 * of it to Google's index under the platform domain is the same consent
 * concern the repo already legal-gates on the ingestion side (lead-ingestion /
 * Places). So only publish previews we are entitled to:
 *   - curated DEMO_LEADS showcases (intentional public product samples), and
 *   - real customers who consented by buying / going live (stage paid | live).
 * Everyone else (discovered / site_built / outreach_sent / discovery_call /
 * closed, and slug-inferred previews) stays noindex and out of the sitemap.
 *
 * Shared by src/app/sitemap.ts and the /preview/[slug] generateMetadata robots
 * directive so the two surfaces cannot drift (a sitemap entry for a noindex
 * page sends Google contradictory signals).
 */
export function isLeadPreviewIndexable(
  lead: Pick<Lead, "stage">,
  opts: { isCuratedDemo: boolean },
): boolean {
  if (opts.isCuratedDemo) return true;
  return lead.stage === "paid" || lead.stage === "live";
}

/** schema.org LocalBusiness subtype per category — falls back to the generic type. */
const SCHEMA_TYPE_BY_CATEGORY: Record<BusinessCategory, string> = {
  restaurant: "Restaurant",
  salon: "HairSalon",
  trades: "HomeAndConstructionBusiness",
  generic: "LocalBusiness",
};

export function leadMetaTitle(lead: Lead): string {
  return `${lead.businessName} — ${lead.city}, ${lead.state} | ${lead.tagline}`;
}

export function leadMetaDescription(lead: Lead): string {
  return lead.description;
}

/** JSON-LD LocalBusiness object for a lead's preview site. Serialize with safeJsonLdScript. */
export function leadLocalBusinessJsonLd(lead: Lead): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": SCHEMA_TYPE_BY_CATEGORY[lead.category],
    name: lead.businessName,
    description: lead.description,
    url: previewUrl(lead.slug),
    telephone: lead.phone,
    address: {
      "@type": "PostalAddress",
      streetAddress: lead.address,
      addressLocality: lead.city,
      addressRegion: lead.state,
    },
  };
}

/**
 * Serialize JSON-LD for embedding via dangerouslySetInnerHTML inside a
 * <script type="application/ld+json"> tag. The HTML parser scans for the
 * literal byte sequence "</script" to close that element before any
 * JSON/JS parsing happens, regardless of surrounding content — so an
 * unescaped lead field containing "</script>" (businessName, description,
 * address, city, state are free text from scraped/CSV-imported leads, not
 * just operator-typed) would prematurely close the script and let anything
 * after it execute as live HTML/script on the public, unauthenticated
 * /preview/[slug] page. Escaping "<" to its unicode escape neutralizes that
 * while JSON.parse still recovers an identical object.
 */
export function safeJsonLdScript(jsonLd: Record<string, unknown>): string {
  return JSON.stringify(jsonLd).replace(/</g, "\\u003c");
}
