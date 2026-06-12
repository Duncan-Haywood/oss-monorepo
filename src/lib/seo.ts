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
