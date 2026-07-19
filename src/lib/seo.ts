/**
 * SEO helpers shared by the marketing site and per-client preview pages.
 * Starter sells "Basic SEO" (see landing page copy) — this is what backs it:
 * per-page metadata, canonical URLs, and LocalBusiness structured data.
 */
import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { DOCS_PAGES } from "@/lib/docs/routes";
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
 * siteUrl() as a URL object, for the one metadata field (metadataBase) that
 * requires one rather than a string. NEXT_PUBLIC_APP_URL is presence-checked
 * by assessAppUrlEnvReadiness but never format-validated (an operator could
 * paste "mysite.com" with no scheme) — `new URL()` throws on that, and this
 * field is read at every page's metadata generation, so a throw here would
 * break the entire site rather than degrading one banner. Fail closed to the
 * localhost default on a parse error, same as every other siteUrl() consumer
 * silently falling back rather than crashing.
 */
function siteOriginUrl(): URL {
  try {
    return new URL(siteUrl());
  } catch {
    return new URL(DEFAULT_SITE_URL);
  }
}

/**
 * Metadata for any static (non-preview) page, self-referential by design:
 * alternates.canonical / openGraph.url always point at the page's own path,
 * never siteUrl() alone. Shared by homepageMetadata (path "") and
 * docPageMetadata below.
 */
export function staticPageMetadata(opts: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const { title, description } = opts;
  const url = `${siteUrl()}${opts.path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: brand.name, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

/**
 * Root layout metadata — the homepage, and (until each ships its own
 * generateMetadata) every page that doesn't export one. Extracted out of
 * src/app/layout.tsx so it's unit-testable: layout.tsx imports globals.css
 * and has no React test harness in this repo (same reason event-handler
 * logic gets extracted to a pure sibling module — see AGENT_PROTOCOL).
 * Previously title/description only — no openGraph/twitter/canonical, so
 * sharing the homepage (or any uncustomized page) on social/chat apps
 * unfurled with no title, description, or link preview at all.
 *
 * Sets metadataBase — required for the site-og-image opengraph-image.tsx /
 * twitter-image.tsx file-convention images (site-brand-image.tsx) to resolve
 * to an absolute URL. Without it, Next.js resolves those relative image URLs
 * against a hardcoded "http://localhost:3000" in every environment,
 * including production — the build even warns about this. Root layout is
 * the correct (and only necessary) place: metadataBase set here applies to
 * every descendant route's URL-based metadata fields that don't set their
 * own absolute URL, including /preview/[slug]'s per-lead opengraph-image.
 */
export function homepageMetadata(): Metadata {
  const title = `${brand.name} — Pre-built websites for local businesses`;
  const description = `${brand.name} builds professional websites before you buy. Preview your site, pay $500, go live. Operated by ${brand.legalEntity} (${brand.legalLocation}).`;
  return {
    ...staticPageMetadata({ title, description, path: "" }),
    metadataBase: siteOriginUrl(),
  };
}

/**
 * schema.org Organization JSON-LD for the platform's own identity — distinct
 * from leadLocalBusinessJsonLd, which describes a client's business, not this
 * platform. Serialize with safeJsonLdScript and embed sitewide (root layout)
 * the same way SiteHeader/SiteFooter branding already renders on every page,
 * including preview/dashboard routes — this describes the operator, who
 * always consents to describing itself, so (unlike LocalBusiness JSON-LD on
 * a cold-prospect preview) there is no indexable-only gate here.
 *
 * Deliberately omits brand.postalAddress: its no-env-set fallback is a
 * bracketed placeholder string ("[Registered business address — ...]"),
 * not real data, and every other brand.* fallback here reads as plausible
 * real content — publishing that placeholder verbatim as structured data
 * would look like a real address to any consumer that doesn't know it's a
 * fallback. Include it once NEXT_PUBLIC_COMPANY_ADDRESS is operator-set.
 */
export function homepageOrganizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brand.name,
    legalName: brand.legalEntity,
    url: siteUrl(),
    email: brand.supportEmail,
  };
}

/**
 * Metadata for a /docs/[slug] sub-page, sourced from DOCS_PAGES — the same
 * title/description already shared by the docs index and sitemap.xml (see
 * sitemap-docs-route-sync). Every one of the 12 docs pages previously had no
 * generateMetadata of its own, so it silently inherited homepageMetadata()
 * from the root layout verbatim: not just a generic/duplicate <title>, but
 * an actively wrong alternates.canonical pointing at "/" (the homepage) —
 * telling crawlers every docs page is a duplicate of the homepage and should
 * be dropped from the index in its favor. That directly undermines
 * sitemap-docs-route-sync (PR #397), whose entire point was getting these
 * pages indexed (docs-canonical-self-reference-fix). Throws on an unknown
 * href so a typo'd path fails fast in dev/test instead of silently falling
 * back to the homepage's identity again.
 */
export function docPageMetadata(href: string): Metadata {
  const doc = DOCS_PAGES.find((page) => page.href === href);
  if (!doc) {
    throw new Error(`docPageMetadata: no DOCS_PAGES entry for "${href}"`);
  }
  return staticPageMetadata({
    title: `${doc.title} — ${brand.name}`,
    description: doc.description,
    path: doc.href,
  });
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
