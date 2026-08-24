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
  retailPrice: number;
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
    retailPrice: artwork.retailPrice,
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

export type PrintStructuredData = {
  "@context": "https://schema.org";
  "@graph": Array<Record<string, unknown>>;
};

/** Builds crawlable product facts without exposing blocked listings as purchasable. */
export function buildPrintStructuredData(
  page: SeoLandingPage,
  publishState: SeoPublishState,
  baseUrl = "https://printatelier.com",
): PrintStructuredData {
  const productUrl = `${baseUrl.replace(/\/$/, "")}/prints/${page.slug}`;
  const product: Record<string, unknown> = {
    "@type": "Product",
    "@id": `${productUrl}#product`,
    name: page.artworkTitle,
    description: page.metaDescription,
    url: productUrl,
    category: "Fine Art Prints",
    brand: { "@type": "Brand", name: "Print Atelier" },
    manufacturer: { "@type": "Person", name: page.artistName },
  };

  if (publishState.publishable) {
    product.offers = {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: "USD",
      price: page.retailPrice.toFixed(2),
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
    };
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      product,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Storefront", item: `${baseUrl.replace(/\/$/, "")}/storefront` },
          { "@type": "ListItem", position: 2, name: page.artworkTitle, item: productUrl },
        ],
      },
    ],
  };
}

export function evaluateSeoPagePublishability(
  page: SeoLandingPage,
  consentItem?: ListingConsentGateItem,
): SeoPublishState {
  const blockers = [...page.blockers];
  let consentBlocked = false;

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

const PRINT_INTENT_PRIORITY: SeoLandingIntent[] = [
  "room-style",
  "long-tail-tag",
  "artist-story",
  "payout-proof",
];

function preferPrintPage(pages: SeoLandingPage[]): SeoLandingPage | undefined {
  return [...pages].sort(
    (left, right) =>
      PRINT_INTENT_PRIORITY.indexOf(left.intent) - PRINT_INTENT_PRIORITY.indexOf(right.intent),
  )[0];
}

/**
 * Accepts either a programmatic SEO slug or a catalog artwork slug.
 * Storefront cards use catalog slugs (`midnight-coast`); landing pages use
 * intent suffixes (`midnight-coast-landscape-wall-art`). Linking the former
 * without this resolver 404s.
 */
export function resolvePrintPage(
  slug: string,
  consentRecords: ListingConsentRecord[] = defaultListingConsentRecords,
  artworks: CatalogArtwork[] = catalogArtworks,
): SeoLandingPage | undefined {
  const exact = getSeoPageBySlug(slug, artworks);
  if (exact) {
    return exact;
  }

  const forArtwork = generateSeoLandingPages(artworks).pages.filter(
    (page) => page.artworkSlug === slug,
  );
  if (forArtwork.length === 0) {
    return undefined;
  }

  const withState = getSeoPagesWithPublishState(consentRecords, artworks);
  const publishable = forArtwork.filter((page) =>
    withState.find((item) => item.slug === page.slug)?.publishState.publishable,
  );
  return preferPrintPage(publishable.length > 0 ? publishable : forArtwork);
}

export function resolvePrintHref(
  artwork: Pick<CatalogArtwork, "slug">,
  consentRecords: ListingConsentRecord[] = defaultListingConsentRecords,
  artworks: CatalogArtwork[] = catalogArtworks,
): string {
  const page = resolvePrintPage(artwork.slug, consentRecords, artworks);
  return `/prints/${page?.slug ?? artwork.slug}`;
}

export function getCatalogArtworkSlugs(artworks: CatalogArtwork[] = catalogArtworks): string[] {
  return artworks.map((artwork) => artwork.slug);
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
    publishState: evaluateSeoPagePublishability(page, consentBySlug.get(page.artworkSlug)),
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
  { path: "/print-file-preflight", changeFrequency: "weekly", priority: 0.75 },
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
