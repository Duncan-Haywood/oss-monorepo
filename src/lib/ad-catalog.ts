import { adPlatformPartners } from "./partners";
import {
  buildListingConsentGate,
  calculateCreativeReadiness,
  catalogArtworks,
  defaultListingConsentRecords,
  type CatalogArtwork,
  type ListingConsentRecord,
} from "./marketplace";
import {
  getSeoPagesWithPublishState,
  type SeoLandingPage,
  type SeoPublishState,
} from "./seo";

export type AdCatalogPlatform = "meta" | "google" | "pinterest";

export type AdCatalogFeedItem = {
  id: string;
  platform: AdCatalogPlatform;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  price: string;
  currency: string;
  availability: "in stock" | "out of stock";
  brand: string;
  condition: "new";
  googleProductCategory: string;
  customLabels: string[];
  creativeReadinessScore: number;
  seoSlug: string;
  artworkSlug: string;
  artistName: string;
  eligible: boolean;
  blockers: string[];
};

export type AdCatalogPlatformSummary = {
  eligible: number;
  blocked: number;
  minCreativesRequired: number;
  minCreativesMet: boolean;
  syncReady: boolean;
};

export type AdCatalogFeedResult = {
  items: AdCatalogFeedItem[];
  eligibleCount: number;
  blockedCount: number;
  feedHealthScore: number;
  platformSummary: Record<AdCatalogPlatform, AdCatalogPlatformSummary>;
};

export type AdCatalogFeedOptions = {
  baseUrl?: string;
  consentRecords?: ListingConsentRecord[];
  artworks?: CatalogArtwork[];
  baselineCAC?: number;
  minCreativeScore?: number;
  platforms?: AdCatalogPlatform[];
};

const DEFAULT_MIN_CREATIVE_SCORE = 60;
const GOOGLE_PRODUCT_CATEGORY = "Home & Garden > Decor > Artwork > Prints";

const platformIds: AdCatalogPlatform[] = ["meta", "google", "pinterest"];

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

function artworkImageLink(baseUrl: string, artwork: CatalogArtwork): string {
  return `${baseUrl}/api/og/print/${artwork.slug}`;
}

function buildCustomLabels(page: SeoLandingPage, creativeScore: number): string[] {
  return [page.intent, `creative-${creativeScore}`, ...page.tags.slice(0, 3)];
}

export function evaluateAdCatalogEligibility(
  page: SeoLandingPage,
  publishState: SeoPublishState,
  artwork: CatalogArtwork | undefined,
  consentAllowsPaidAds: boolean,
  options: { baselineCAC?: number; minCreativeScore?: number } = {},
): { eligible: boolean; blockers: string[]; creativeScore: number } {
  const minCreativeScore = options.minCreativeScore ?? DEFAULT_MIN_CREATIVE_SCORE;
  const blockers: string[] = [];

  if (!publishState.publishable) {
    blockers.push(...publishState.blockers);
  }
  if (!consentAllowsPaidAds) {
    blockers.push("Paid ad rights not accepted");
  }
  if (!artwork) {
    blockers.push("Artwork not found in catalog");
    return { eligible: false, blockers, creativeScore: 0 };
  }

  const creative = calculateCreativeReadiness(artwork, { baselineCAC: options.baselineCAC });
  if (creative.score < minCreativeScore) {
    blockers.push(`Creative readiness ${creative.score} below ${minCreativeScore}`);
    if (creative.blockers.length > 0) {
      blockers.push(...creative.blockers.slice(0, 2));
    }
  }

  const uniqueBlockers = Array.from(new Set(blockers));
  return {
    eligible: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    creativeScore: creative.score,
  };
}

function buildFeedItem(
  page: SeoLandingPage,
  publishState: SeoPublishState,
  artwork: CatalogArtwork,
  platform: AdCatalogPlatform,
  baseUrl: string,
  eligibility: ReturnType<typeof evaluateAdCatalogEligibility>,
): AdCatalogFeedItem {
  const normalizedBase = normalizeBaseUrl(baseUrl);

  return {
    id: `${platform}-${page.slug}`,
    platform,
    title: page.title,
    description: page.metaDescription,
    link: `${normalizedBase}/prints/${page.slug}`,
    imageLink: artworkImageLink(normalizedBase, artwork),
    price: `${artwork.retailPrice.toFixed(2)} USD`,
    currency: "USD",
    availability: eligibility.eligible ? "in stock" : "out of stock",
    brand: "Print Atelier",
    condition: "new",
    googleProductCategory: GOOGLE_PRODUCT_CATEGORY,
    customLabels: buildCustomLabels(page, eligibility.creativeScore),
    creativeReadinessScore: eligibility.creativeScore,
    seoSlug: page.slug,
    artworkSlug: artwork.slug,
    artistName: artwork.artistName,
    eligible: eligibility.eligible,
    blockers: eligibility.blockers,
  };
}

export function buildAdCatalogFeed(options: AdCatalogFeedOptions = {}): AdCatalogFeedResult {
  const {
    baseUrl = "https://printatelier.com",
    consentRecords = defaultListingConsentRecords,
    artworks = catalogArtworks,
    baselineCAC = 68,
    minCreativeScore = DEFAULT_MIN_CREATIVE_SCORE,
    platforms = platformIds,
  } = options;

  const pagesWithState = getSeoPagesWithPublishState(consentRecords, artworks);
  const consentGate = buildListingConsentGate(artworks, consentRecords);
  const consentBySlug = new Map(consentGate.items.map((item) => [item.artwork.slug, item]));
  const artworkBySlug = new Map(artworks.map((artwork) => [artwork.slug, artwork]));

  const items: AdCatalogFeedItem[] = [];

  for (const page of pagesWithState) {
    const artwork = artworkBySlug.get(page.artworkSlug);
    const consentItem = consentBySlug.get(page.artworkSlug);
    const consentAllowsPaidAds = consentItem?.allowedChannels.includes("paid-ads") ?? false;

    if (!artwork) continue;

    const eligibility = evaluateAdCatalogEligibility(
      page,
      page.publishState,
      artwork,
      consentAllowsPaidAds,
      { baselineCAC, minCreativeScore },
    );

    for (const platform of platforms) {
      items.push(
        buildFeedItem(page, page.publishState, artwork, platform, baseUrl, eligibility),
      );
    }
  }

  const eligibleCount = items.filter((item) => item.eligible).length;
  const blockedCount = items.length - eligibleCount;

  const platformSummary = {} as Record<AdCatalogPlatform, AdCatalogPlatformSummary>;

  for (const platform of platformIds) {
    const partner = adPlatformPartners.find((entry) => entry.id === platform);
    const platformItems = items.filter((item) => item.platform === platform);
    const platformEligible = platformItems.filter((item) => item.eligible).length;
    const minCreativesRequired = partner?.minCreativesRequired ?? 6;
    const minCreativesMet = platformEligible >= minCreativesRequired;
    const syncReady =
      minCreativesMet &&
      partner?.catalogSyncStatus !== "blocked" &&
      (partner?.pixelStatus === "configured" || partner?.pixelStatus === "ready");

    platformSummary[platform] = {
      eligible: platformEligible,
      blocked: platformItems.length - platformEligible,
      minCreativesRequired,
      minCreativesMet,
      syncReady,
    };
  }

  const syncReadyCount = Object.values(platformSummary).filter((summary) => summary.syncReady).length;
  const feedHealthScore = Math.round(
    (eligibleCount / Math.max(items.length, 1)) * 50 +
      (syncReadyCount / platformIds.length) * 50,
  );

  return {
    items,
    eligibleCount,
    blockedCount,
    feedHealthScore,
    platformSummary,
  };
}

export function serializeAdCatalogFeedJson(feed: AdCatalogFeedResult, eligibleOnly = true): string {
  const payload = eligibleOnly ? feed.items.filter((item) => item.eligible) : feed.items;
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      eligibleCount: feed.eligibleCount,
      blockedCount: feed.blockedCount,
      feedHealthScore: feed.feedHealthScore,
      items: payload,
    },
    null,
    2,
  );
}

/** Meta / Google Merchant Center style CSV (subset of required fields). */
export function serializeMetaCatalogFeedCsv(
  feed: AdCatalogFeedResult,
  platform: AdCatalogPlatform = "meta",
  eligibleOnly = true,
): string {
  const rows = feed.items.filter(
    (item) => item.platform === platform && (!eligibleOnly || item.eligible),
  );
  const header = [
    "id",
    "title",
    "description",
    "availability",
    "condition",
    "price",
    "link",
    "image_link",
    "brand",
    "google_product_category",
    "custom_label_0",
    "custom_label_1",
  ].join(",");

  const body = rows
    .map((item) =>
      [
        item.id,
        `"${item.title.replace(/"/g, '""')}"`,
        `"${item.description.replace(/"/g, '""')}"`,
        item.availability,
        item.condition,
        item.price,
        item.link,
        item.imageLink,
        item.brand,
        `"${item.googleProductCategory}"`,
        item.customLabels[0] ?? "",
        item.customLabels[1] ?? "",
      ].join(","),
    )
    .join("\n");

  return `${header}\n${body}`;
}
