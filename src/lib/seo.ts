/**
 * SEO helpers shared by the marketing site and per-client preview pages.
 * Starter sells "Basic SEO" (see landing page copy) — this is what backs it:
 * per-page metadata, canonical URLs, and LocalBusiness structured data.
 */
import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { DOCS_PAGES } from "@/lib/docs/routes";
import type { CategoryLandingPage } from "@/lib/marketing/category-landing";
import { softCapLeadForPublicSurface } from "@/lib/leads/public-fields";
import { leadOpeningHoursSpecification } from "@/lib/leads/hours-schema";
import type { BusinessCategory, Lead } from "@/lib/leads/types";
import { leadPreviewAbsoluteUrl } from "@/lib/leads/slug-path";
import { BUNDLES, bundlePriceHeadingLabel, minBundleSetupPriceUsd } from "@/lib/pricing/bundles";
import type { CommerceSku } from "@/lib/commerce/types";

const DEFAULT_SITE_URL = "http://localhost:3000";

/**
 * Google truncates SERP snippets at roughly this width (see
 * MAX_CATEGORY_META_DESCRIPTION_LENGTH in category-landing.ts, the first
 * surface this was fixed for — that fix hand-shortened static copy since
 * those strings are hardcoded). staticPageMetadata applies the same cap to
 * every description that passes through it (homepage, /docs/*, category
 * landing) so one truncation point protects every current and future
 * caller — homepageMetadata's description is built from operator-set env
 * vars (brand.name/legalEntity/legalLocation via NEXT_PUBLIC_BRAND_NAME/
 * NEXT_PUBLIC_LEGAL_ENTITY/NEXT_PUBLIC_LEGAL_LOCATION), which have no length
 * bound anywhere upstream and can realistically push the assembled sentence
 * well past this width for any real operator-chosen business name at launch
 * (see homepage-meta-description-length-cap). leadMetaDescription (a real
 * client's own /preview/[slug] page, not this platform's own copy) applies
 * this same cap directly rather than through staticPageMetadata, since the
 * preview page's generateMetadata builds its Metadata object by hand (see
 * lead-preview-meta-description-length-cap).
 */
export const MAX_META_DESCRIPTION_LENGTH = 155;

/**
 * Google truncates a SERP title around this width too — narrower than the
 * description's ~155-160 chars (see MAX_META_DESCRIPTION_LENGTH's comment).
 * Same unbounded-upstream-input problem: staticPageMetadata's title (homepage/
 * docs/category-landing) can include brand.name, and leadMetaTitle's title is
 * built from a real client's businessName/city/state/tagline — none of those
 * fields are bounded anywhere near 60 chars (see MAX_BUSINESS_NAME_LENGTH=200
 * / MAX_TAGLINE_LENGTH=200 in leads/create-fields.ts).
 */
export const MAX_META_TITLE_LENGTH = 60;

/** Truncate at a word boundary with an ellipsis rather than mid-word. */
function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength - 1);
  const lastSpace = truncated.lastIndexOf(" ");
  const wordSafe = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
  return `${wordSafe.trimEnd()}…`;
}

function capMetaDescription(description: string): string {
  return truncateAtWordBoundary(description, MAX_META_DESCRIPTION_LENGTH);
}

function capMetaTitle(title: string): string {
  return truncateAtWordBoundary(title, MAX_META_TITLE_LENGTH);
}

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
  const title = capMetaTitle(opts.title);
  const description = capMetaDescription(opts.description);
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
  const description = `${brand.name} builds professional websites before you buy. Preview your site, pay $${minBundleSetupPriceUsd()}, go live. Operated by ${brand.legalEntity} (${brand.legalLocation}).`;
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
    makesOffer: BUNDLES.map((bundle) => ({
      "@type": "Offer",
      name: `${bundle.name} website package`,
      description: bundlePriceHeadingLabel(bundle),
      price: bundle.setupPriceUsd.toFixed(2),
      priceCurrency: "USD",
      url: `${siteUrl()}/#pricing`,
    })),
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

/**
 * Metadata for a /websites-for-* category landing page — same
 * staticPageMetadata shape as docPageMetadata, sourced from the page's own
 * CATEGORY_LANDING_PAGES entry (src/lib/marketing/category-landing.ts) so
 * title/description/canonical can never drift from what the page itself
 * renders.
 */
export function categoryLandingPageMetadata(page: CategoryLandingPage): Metadata {
  return staticPageMetadata({
    title: page.seoTitle,
    description: page.metaDescription,
    path: page.href,
  });
}

/**
 * schema.org Service JSON-LD for a category landing page — describes the
 * platform's offering for that business category (distinct from
 * leadLocalBusinessJsonLd, which describes a client's own business on their
 * preview page). FAQPage JSON-LD was deliberately not used here: Google
 * restricted FAQ rich-result eligibility to government/health sites before
 * this repo's last SEO pass (see homepage-organization-jsonld in
 * prompt_process.tsx), so it would not earn the rich-snippet benefit that
 * markup used to. Service schema has durable, policy-independent value for
 * any crawler resolving what this page offers, the same rationale as
 * homepageOrganizationJsonLd.
 */
export function categoryLandingServiceJsonLd(page: CategoryLandingPage): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: page.seoTitle,
    serviceType: `Website design for ${page.navLabel.toLowerCase()}`,
    description: page.metaDescription,
    url: `${siteUrl()}${page.href}`,
    provider: { "@type": "Organization", name: brand.name, url: siteUrl() },
    areaServed: "US",
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
  retail: "Store",
  health: "MedicalBusiness",
  generic: "LocalBusiness",
};

/**
 * businessName/tagline soft-cap at create-path max (200 chars each, see
 * MAX_BUSINESS_NAME_LENGTH/MAX_TAGLINE_LENGTH in leads/create-fields.ts) —
 * an on-page-rendering bound, not the much narrower ~60-char SERP title
 * width capMetaTitle enforces. Same gap class as leadMetaDescription (see
 * lead-preview-meta-description-length-cap), just on the title instead of
 * the description, and left open by that fix as a distinct follow-up (see
 * lead-preview-meta-title-length-cap).
 */
export function leadMetaTitle(lead: Lead): string {
  const capped = softCapLeadForPublicSurface(lead);
  return capMetaTitle(
    `${capped.businessName} — ${capped.city}, ${capped.state} | ${capped.tagline}`,
  );
}

/**
 * The lead's stored description is soft-capped at create-path max
 * (MAX_DESCRIPTION_LENGTH=2000, softCapLeadForPublicSurface) for on-page
 * body rendering, which is a completely different bound than the ~155-char
 * SERP-truncation width capMetaDescription enforces — a real client's
 * business description (this is the paid "Basic SEO" deliverable, see the
 * file header) can easily run several hundred characters and, before this
 * fix, was passed straight into generateMetadata's description/
 * openGraph.description/twitter.description on the actual live /preview/
 * [slug] page with no SERP-width cap at all, unlike every static-copy page
 * that already goes through staticPageMetadata (see
 * category-landing-meta-description-length-cap /
 * homepage-meta-description-length-cap for the two prior surfaces this
 * exact bug was fixed on — this is the same gap on the highest-value
 * surface: a real paying customer's own site).
 */
export function leadMetaDescription(lead: Lead): string {
  return capMetaDescription(softCapLeadForPublicSurface(lead).description);
}

/**
 * schema.org OfferCatalog for a lead's Commerce add-on SKUs — attached to
 * LocalBusiness JSON-LD as hasOfferCatalog so search engines can surface
 * priced products/menu items in rich results, the same way any indexed
 * ecommerce or restaurant site does. A SKU only reached the public preview
 * catalog by passing loadPreviewCommerceItems' own eligibility gate
 * (leadStageEligibleForCommerceCatalog + leadEligibleForCommerceCatalog), so
 * no separate consent check is needed here beyond the indexable gate the
 * caller already applies. `availability` is included only once
 * stripePriceId is set (syncCommerceCatalogToStripe has run) — an unsynced
 * SKU shows a "contact us" CTA on the page itself (commerce-catalog.tsx),
 * not a real-time purchasable state, so asserting InStock for it would be a
 * false structured-data signal.
 */
function commerceOfferCatalogJsonLd(items: CommerceSku[]): Record<string, unknown> | undefined {
  if (items.length === 0) return undefined;
  return {
    "@type": "OfferCatalog",
    name: "Products",
    itemListElement: items.map((item) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Product", name: item.name, description: item.description },
      price: (item.priceCents / 100).toFixed(2),
      priceCurrency: "USD",
      ...(item.stripePriceId ? { availability: "https://schema.org/InStock" } : {}),
    })),
  };
}

/** JSON-LD LocalBusiness object for a lead's preview site. Serialize with safeJsonLdScript. */
export function leadLocalBusinessJsonLd(
  lead: Lead,
  opts: { commerceItems?: CommerceSku[] } = {},
): Record<string, unknown> {
  const capped = softCapLeadForPublicSurface(lead);
  const hasOfferCatalog = commerceOfferCatalogJsonLd(opts.commerceItems ?? []);
  const openingHoursSpecification = leadOpeningHoursSpecification(capped.hours);
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
    ...(hasOfferCatalog ? { hasOfferCatalog } : {}),
    ...(openingHoursSpecification ? { openingHoursSpecification } : {}),
  };
}

/**
 * LocalBusiness JSON-LD only when the preview is publicly indexable.
 * Cold-prospected / closed leads stay noindex AND must not emit structured
 * data that crawlers still parse under robots=noindex (preview-jsonld-indexable-only).
 */
export function leadPreviewJsonLdIfIndexable(
  lead: Lead,
  opts: { isCuratedDemo: boolean; commerceItems?: CommerceSku[] },
): Record<string, unknown> | null {
  if (!isLeadPreviewIndexable(lead, opts)) return null;
  return leadLocalBusinessJsonLd(lead, { commerceItems: opts.commerceItems });
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
