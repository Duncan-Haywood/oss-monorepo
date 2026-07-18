/**
 * SEO helpers shared by the marketing site and per-client preview pages.
 * Starter sells "Basic SEO" (see landing page copy) — this is what backs it:
 * per-page metadata, canonical URLs, and LocalBusiness structured data.
 */
import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { softCapLeadForPublicSurface } from "@/lib/leads/public-fields";
import type { BusinessCategory, Lead } from "@/lib/leads/types";
import { leadPreviewAbsoluteUrl } from "@/lib/leads/slug-path";

const DEFAULT_SITE_URL = "http://localhost:3000";

/** Absolute site origin, no trailing slash. Falls back to localhost outside Vercel/prod. */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;
  return DEFAULT_SITE_URL;
}

/**
 * Root layout metadata — the homepage, and every page that doesn't export
 * its own generateMetadata (/checkout, /docs/*, /privacy, /terms,
 * /dashboard/*; only /preview/[slug] overrides it). Extracted out of
 * src/app/layout.tsx so it's unit-testable: layout.tsx imports globals.css
 * and has no React test harness in this repo (same reason event-handler
 * logic gets extracted to a pure sibling module — see AGENT_PROTOCOL).
 * Previously title/description only — no openGraph/twitter/canonical, so
 * sharing the homepage (or any uncustomized page) on social/chat apps
 * unfurled with no title, description, or link preview at all.
 */
export function homepageMetadata(): Metadata {
  const title = `${brand.name} — Pre-built websites for local businesses`;
  const description = `${brand.name} builds professional websites before you buy. Preview your site, pay $500, go live. Operated by ${brand.legalEntity} (${brand.legalLocation}).`;
  const url = siteUrl();
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: brand.name, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

/** Absolute /preview URL — slug is encodeURIComponent'd (legacy-slug path safety). */
export function previewUrl(slug: string): string {
  return leadPreviewAbsoluteUrl(siteUrl(), slug);
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
 * Shared by src/app/sitemap.ts, the /preview/[slug] generateMetadata robots
 * directive, AND LocalBusiness JSON-LD emission so the three surfaces cannot
 * drift (a sitemap entry for a noindex page — or JSON-LD on a noindex page —
 * sends crawlers contradictory / over-eager structured-data signals).
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
  const capped = softCapLeadForPublicSurface(lead);
  return `${capped.businessName} — ${capped.city}, ${capped.state} | ${capped.tagline}`;
}

export function leadMetaDescription(lead: Lead): string {
  return softCapLeadForPublicSurface(lead).description;
}

/** JSON-LD LocalBusiness object for a lead's preview site. Serialize with safeJsonLdScript. */
export function leadLocalBusinessJsonLd(lead: Lead): Record<string, unknown> {
  const capped = softCapLeadForPublicSurface(lead);
  return {
    "@context": "https://schema.org",
    "@type": SCHEMA_TYPE_BY_CATEGORY[capped.category],
    name: capped.businessName,
    description: capped.description,
    url: previewUrl(capped.slug),
    telephone: capped.phone,
    address: {
      "@type": "PostalAddress",
      streetAddress: capped.address,
      addressLocality: capped.city,
      addressRegion: capped.state,
    },
  };
}

/**
 * LocalBusiness JSON-LD only when the preview is publicly indexable.
 * Cold-prospected / closed leads stay noindex AND must not emit structured
 * data that crawlers still parse under robots=noindex (preview-jsonld-indexable-only).
 */
export function leadPreviewJsonLdIfIndexable(
  lead: Lead,
  opts: { isCuratedDemo: boolean },
): Record<string, unknown> | null {
  if (!isLeadPreviewIndexable(lead, opts)) return null;
  return leadLocalBusinessJsonLd(lead);
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
