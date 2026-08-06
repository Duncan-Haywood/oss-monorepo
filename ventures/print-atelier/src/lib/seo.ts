import {
  buildListingConsentGate,
  calculatePrintEconomics,
  catalogArtworks,
  defaultListingConsentRecords,
  type CatalogArtwork,
  type ListingConsentGateItem,
  type ListingConsentRecord,
  roundCurrency,
} from "@/lib/marketplace";
import { validateCheckoutLineItem } from "@/lib/checkout";

export type SeoLandingIntent =
  | "room-style"
  | "artist-story"
  | "payout-proof"
  | "long-tail-tag";

export type SeoLandingPage = {
  slug: string;
  intent: SeoLandingIntent;
  title: string;
  metaDescription: string;
  heroHeadline: string;
  primaryCta: string;
  secondaryCta: string;
  artworkSlug: string;
  artworkTitle: string;
  artistName: string;
  tags: string[];
  estimatedMonthlySearchVolume: number;
  readinessScore: number;
  blockers: string[];
  payoutProofLine: string;
};

export type SeoLandingGeneratorResult = {
  pages: SeoLandingPage[];
  totalEligible: number;
  blockedCount: number;
  topIntents: Record<SeoLandingIntent, number>;
};

const intentLabels: Record<SeoLandingIntent, string> = {
  "room-style": "Room & decor intent",
  "artist-story": "Artist story intent",
  "payout-proof": "Artist acquisition intent",
  "long-tail-tag": "Long-tail search intent",
};

export function estimateSearchVolume(artwork: CatalogArtwork, intent: SeoLandingIntent): number {
  const base = artwork.salesLast30Days * 120 + artwork.tags.length * 90;
  const styleBoost =
    intent === "room-style" ? 240 : intent === "long-tail-tag" ? 180 : intent === "payout-proof" ? 60 : 120;
  return Math.round(base + styleBoost + (artwork.readinessScore ?? 0) * 2);
}

function buildBlockers(artwork: CatalogArtwork): string[] {
  const blockers: string[] = [];
  if (!artwork.hasApprovedProof || artwork.status !== "Live") {
    blockers.push("Proof not approved");
  }
  if (!artwork.hasRoomMockups) {
    blockers.push("Room mockups missing");
  }
  if (!artwork.hasSeoCopy || artwork.tags.length < 2) {
    blockers.push("SEO tags or copy incomplete");
  }
  return blockers;
}

function slugify(parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildPage(
  artwork: CatalogArtwork,
  intent: SeoLandingIntent,
  economics: ReturnType<typeof calculatePrintEconomics>,
): SeoLandingPage {
  const tagPhrase = artwork.tags.slice(0, 3).join(" ");
  const blockers = buildBlockers(artwork);
  const slugSuffix =
    intent === "room-style"
      ? `${artwork.style.toLowerCase()}-wall-art`
      : intent === "artist-story"
        ? `${slugify([artwork.artistName])}-prints`
        : intent === "payout-proof"
          ? "artist-payout-proof"
          : slugify(artwork.tags.slice(0, 2));
  const slug = `${artwork.slug}-${slugSuffix}`;

  const titleByIntent: Record<SeoLandingIntent, string> = {
    "room-style": `${artwork.title} — ${artwork.style} Wall Art Print | Print Atelier`,
    "artist-story": `${artwork.artistName} Prints — ${artwork.title} | Print Atelier`,
    "payout-proof": `How ${artwork.artistName} Earns on Every ${artwork.title} Print`,
    "long-tail-tag": `${tagPhrase} Wall Art — Museum-Quality Prints`,
  };

  const heroByIntent: Record<SeoLandingIntent, string> = {
    "room-style": `See ${artwork.title} in a ${artwork.style.toLowerCase()} room before you buy.`,
    "artist-story": `Collect ${artwork.artistName}'s ${artwork.style.toLowerCase()} work with transparent artist economics.`,
    "payout-proof": `${artwork.artistName} earns $${economics.artistShare.toFixed(2)} per print — here's the math.`,
    "long-tail-tag": `Shop ${tagPhrase} prints with room-ready mockups and fast POD fulfillment.`,
  };

  return {
    slug,
    intent,
    title: titleByIntent[intent],
    metaDescription: `${heroByIntent[intent]} From $${artwork.retailPrice}. Artist earns $${economics.artistShare.toFixed(2)} per order after fulfillment, payment, and AI costs.`,
    heroHeadline: heroByIntent[intent],
    primaryCta: blockers.length === 0 ? "Shop this print" : "Preview listing (blocked)",
    secondaryCta: intent === "payout-proof" ? "Become an artist" : "View in room",
    artworkSlug: artwork.slug,
    artworkTitle: artwork.title,
    artistName: artwork.artistName,
    tags: artwork.tags,
    estimatedMonthlySearchVolume: estimateSearchVolume(artwork, intent),
    readinessScore: artwork.readinessScore ?? 0,
    blockers,
    payoutProofLine: `Artist earns $${economics.artistShare.toFixed(2)} · Platform $${economics.platformShare.toFixed(2)} · ${economics.marginPercent}% net margin`,
  };
}

export function generateSeoLandingPages(
  artworks: CatalogArtwork[] = catalogArtworks,
): SeoLandingGeneratorResult {
  const pages: SeoLandingPage[] = [];

  for (const artwork of artworks) {
    const economics = calculatePrintEconomics({
      retailPrice: artwork.retailPrice,
      fulfillmentCost: artwork.fulfillmentCost,
    });

    const intents: SeoLandingIntent[] =
      artwork.status === "Live"
        ? ["room-style", "long-tail-tag", "artist-story"]
        : ["payout-proof"];

    for (const intent of intents) {
      pages.push(buildPage(artwork, intent, economics));
    }
  }

  const sorted = pages.sort(
    (a, b) => b.estimatedMonthlySearchVolume - a.estimatedMonthlySearchVolume,
  );
  const blockedCount = sorted.filter((page) => page.blockers.length > 0).length;
  const topIntents = sorted.reduce<Record<SeoLandingIntent, number>>(
    (acc, page) => {
      acc[page.intent] = (acc[page.intent] ?? 0) + 1;
      return acc;
    },
    { "room-style": 0, "artist-story": 0, "payout-proof": 0, "long-tail-tag": 0 },
  );

  return {
    pages: sorted,
    totalEligible: sorted.filter((page) => page.blockers.length === 0).length,
    blockedCount,
    topIntents,
  };
}

export function getSeoIntentLabel(intent: SeoLandingIntent): string {
  return intentLabels[intent];
}

export function formatSeoVolume(volume: number): string {
  if (volume >= 1000) {
    return `${roundCurrency(volume / 1000)}k/mo`;
  }
  return `${volume}/mo`;
}

export type SeoPublishState = {
  publishable: boolean;
  blockers: string[];
  consentBlocked: boolean;
};

/**
 * The prefix on every blocker this function takes from the checkout gate, so an
 * operator reading a blocker list can tell "this page is not ready to publish"
 * apart from "this print cannot be bought".
 */
export const UNSELLABLE_BLOCKER_PREFIX = "Cannot be sold: ";

/**
 * Whether a `/prints/[slug]` landing page may be published, indexed and
 * advertised.
 *
 * `buildBlockers` above is a *second enumeration* of listing readiness — proof,
 * room mockups, SEO copy — and it is the one that drives money out of the door:
 * `publishable` decides the page's `robots` directive
 * (`src/app/prints/[slug]/page.tsx:26`), whether the slug enters `sitemap.xml`
 * (`buildSitemapEntries`), whether the "Shop this print" CTA is enabled
 * (`src/components/PrintLandingPage.tsx:98`), and — the expensive one — whether
 * a row is pushed to Meta, Google and Pinterest with `availability: "in stock"`
 * and a price (`ad-catalog.ts:93`, `:156`).
 *
 * It did not ask whether the print could actually be bought. Measured on the
 * seeded catalog 2026-08-06, with an origin configured:
 *
 *   catalog listings ................ 6
 *   sellable (validateCheckoutLineItem) 0
 *   landing pages generated ......... 16
 *   publishable ..................... 3
 *   ad feed rows .................... 48
 *   rows offered as "in stock" ...... 9
 *
 * Nine rows carrying a price and an `in stock` availability were ready to push
 * to Meta, Google and Pinterest for prints the storefront answers 422 on. That
 * is the `listing-sellability.ts` drift one surface further out — the
 * storefront correct and silent, the paid channel wrong and spending — and it
 * is also a misstatement of availability to three ad platforms, which is a
 * policy exposure on top of the wasted spend. All six figures are 0 after this
 * change except the two the catalog fixes (6 listings, 16 pages, 48 rows).
 *
 * So sellability is not re-derived here. It is taken from
 * `validateCheckoutLineItem`'s own `blockerDetails`, the same list
 * `listing-sellability.ts` reads, which is what stops a third enumeration
 * existing and means a blocker added to the checkout tomorrow reaches the ad
 * feed without anybody remembering this file.
 *
 * `artworks` and `consentRecords` default to the real catalog rather than being
 * required, because the two call sites that pass neither
 * (`PrintLandingPage.tsx`) are rendering the real catalog. An artwork absent
 * from the list is a blocker, not a skip: a page whose artwork cannot be found
 * is a page whose sellability is unknown, and unknown must not publish.
 */
export function evaluateSeoPagePublishability(
  page: SeoLandingPage,
  consentItem?: ListingConsentGateItem,
  artworks: CatalogArtwork[] = catalogArtworks,
  consentRecords: ListingConsentRecord[] = defaultListingConsentRecords,
): SeoPublishState {
  const blockers = [...page.blockers];
  let consentBlocked = false;

  const artwork = artworks.find((item) => item.slug === page.artworkSlug);
  if (!artwork) {
    blockers.push(`${UNSELLABLE_BLOCKER_PREFIX}artwork is not in the catalog`);
  } else {
    for (const blocker of validateCheckoutLineItem(artwork, consentRecords).blockerDetails) {
      blockers.push(`${UNSELLABLE_BLOCKER_PREFIX}${blocker.message}`);
    }
  }

  if (!consentItem) {
    consentBlocked = true;
    blockers.push("Consent record missing");
  } else if (consentItem.consentStatus === "release-blocked") {
    consentBlocked = true;
    blockers.push("Listing release blocked");
  } else if (consentItem.consentStatus === "missing-consent") {
    consentBlocked = true;
    for (const missing of consentItem.missingConsents) {
      blockers.push(`Missing consent: ${missing}`);
    }
  } else if (!consentItem.allowedChannels.includes("storefront")) {
    consentBlocked = true;
    blockers.push("Storefront channel not cleared");
  }

  return {
    publishable: blockers.length === 0,
    blockers,
    consentBlocked,
  };
}

export function getSeoPageBySlug(
  slug: string,
  artworks: CatalogArtwork[] = catalogArtworks,
): SeoLandingPage | undefined {
  return generateSeoLandingPages(artworks).pages.find((page) => page.slug === slug);
}

export function getSeoPagesWithPublishState(
  consentRecords: ListingConsentRecord[] = defaultListingConsentRecords,
  artworks: CatalogArtwork[] = catalogArtworks,
): Array<SeoLandingPage & { publishState: SeoPublishState }> {
  const pages = generateSeoLandingPages(artworks).pages;
  const consentGate = buildListingConsentGate(artworks, consentRecords);
  const consentBySlug = new Map(consentGate.items.map((item) => [item.artwork.slug, item]));

  return pages.map((page) => ({
    ...page,
    // `artworks` and `consentRecords` are forwarded rather than left to the
    // defaults. A caller that supplies its own catalog — every test here, and
    // `buildAdCatalogFeed`'s `artworks` option — would otherwise have its
    // sellability judged against the seeded catalog instead of the one it
    // passed, which is the shape where a control reads a surface nobody chose.
    publishState: evaluateSeoPagePublishability(
      page,
      consentBySlug.get(page.artworkSlug),
      artworks,
      consentRecords,
    ),
  }));
}

export function getAllSeoSlugs(artworks: CatalogArtwork[] = catalogArtworks): string[] {
  return generateSeoLandingPages(artworks).pages.map((page) => page.slug);
}

export function getPublishableSeoSlugs(
  consentRecords: ListingConsentRecord[] = defaultListingConsentRecords,
  artworks: CatalogArtwork[] = catalogArtworks,
): string[] {
  return getSeoPagesWithPublishState(consentRecords, artworks)
    .filter((page) => page.publishState.publishable)
    .map((page) => page.slug);
}

export type SitemapEntry = {
  path: string;
  changeFrequency: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority: number;
};

const staticMarketRoutes: SitemapEntry[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/docs", changeFrequency: "weekly", priority: 0.9 },
  { path: "/investor", changeFrequency: "weekly", priority: 0.85 },
  { path: "/storefront", changeFrequency: "daily", priority: 0.8 },
  { path: "/artist-portal", changeFrequency: "weekly", priority: 0.75 },
  { path: "/capture", changeFrequency: "weekly", priority: 0.7 },
];

/** Builds sitemap paths: static market routes + consent-gated `/prints/[slug]` pages only. */
export function buildSitemapEntries(
  consentRecords: ListingConsentRecord[] = defaultListingConsentRecords,
  artworks: CatalogArtwork[] = catalogArtworks,
): SitemapEntry[] {
  const publishableSlugs = getPublishableSeoSlugs(consentRecords, artworks);
  const printEntries: SitemapEntry[] = publishableSlugs.map((slug) => ({
    path: `/prints/${slug}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticMarketRoutes, ...printEntries];
}

export function buildSitemapXml(
  baseUrl: string,
  consentRecords: ListingConsentRecord[] = defaultListingConsentRecords,
  artworks: CatalogArtwork[] = catalogArtworks,
  lastModified: Date = new Date(),
): string {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const entries = buildSitemapEntries(consentRecords, artworks);
  const isoDate = lastModified.toISOString();

  const urlNodes = entries
    .map(
      (entry) => `  <url>
    <loc>${normalizedBase}${entry.path}</loc>
    <lastmod>${isoDate}</lastmod>
    <changefreq>${entry.changeFrequency}</changefreq>
    <priority>${entry.priority.toFixed(2)}</priority>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlNodes}
</urlset>`;
}
