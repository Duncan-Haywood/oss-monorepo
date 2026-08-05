import { adPlatformPartners, calculateAdCampaignReadiness } from "./partners";
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
import { resolveSiteUrl, SITE_URL_ENV } from "./site-url";

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

/**
 * A feed row with no origin behind it. `link` and `imageLink` are what ad
 * platforms fetch and what a shopper clicks, so an unconfigured deployment
 * emits them empty and marks the row ineligible rather than filling them with a
 * guessed host — see `src/lib/site-url.ts`. Ineligible is what stops the row:
 * `executeAdCatalogSync` counts eligible items, so with no origin configured
 * every platform reports blocked and `executeAdCatalogSyncLive` makes no
 * outbound request at all.
 */
export const SITE_ORIGIN_BLOCKER = `Site origin not configured — set ${SITE_URL_ENV}`;

function buildFeedItem(
  page: SeoLandingPage,
  publishState: SeoPublishState,
  artwork: CatalogArtwork,
  platform: AdCatalogPlatform,
  baseUrl: string | null,
  eligibility: ReturnType<typeof evaluateAdCatalogEligibility>,
): AdCatalogFeedItem {
  const normalizedBase = baseUrl === null ? null : normalizeBaseUrl(baseUrl);
  const blockers =
    normalizedBase === null
      ? Array.from(new Set([...eligibility.blockers, SITE_ORIGIN_BLOCKER]))
      : eligibility.blockers;
  const eligible = normalizedBase === null ? false : eligibility.eligible;

  return {
    id: `${platform}-${page.slug}`,
    platform,
    title: page.title,
    description: page.metaDescription,
    link: normalizedBase === null ? "" : `${normalizedBase}/prints/${page.slug}`,
    imageLink: normalizedBase === null ? "" : artworkImageLink(normalizedBase, artwork),
    price: `${artwork.retailPrice.toFixed(2)} USD`,
    currency: "USD",
    availability: eligible ? "in stock" : "out of stock",
    brand: "Print Atelier",
    condition: "new",
    googleProductCategory: GOOGLE_PRODUCT_CATEGORY,
    customLabels: buildCustomLabels(page, eligibility.creativeScore),
    creativeReadinessScore: eligibility.creativeScore,
    seoSlug: page.slug,
    artworkSlug: artwork.slug,
    artistName: artwork.artistName,
    eligible,
    blockers,
  };
}

export function buildAdCatalogFeed(options: AdCatalogFeedOptions = {}): AdCatalogFeedResult {
  const {
    // Was `"https://printatelier.com"`. A caller that does not name an origin
    // gets this deployment's configured one, or none — never a guessed domain.
    // `AdCatalogFeedLab` and `AdSyncHealthMonitor` are the callers that matter:
    // their operator exports a CSV/JSON feed straight into Meta and Google.
    baseUrl = resolveSiteUrl(),
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

export type SyncHealthStatus = "healthy" | "degraded" | "blocked";

export type SyncHealthCheck = {
  id: string;
  category: "pixel" | "feed" | "creative-quota" | "consent";
  platform?: AdCatalogPlatform;
  label: string;
  status: SyncHealthStatus;
  detail: string;
};

export type AdCatalogSyncHealth = {
  overallScore: number;
  overallStatus: SyncHealthStatus;
  checks: SyncHealthCheck[];
  platformReadiness: Record<
    AdCatalogPlatform,
    { score: number; syncReady: boolean; blockers: string[] }
  >;
  feedHealthScore: number;
  eligibleFeedRows: number;
  recommendedActions: string[];
  summaryLabel: string;
};

export type AdCatalogSyncHealthOptions = AdCatalogFeedOptions & {
  generatedAt?: string;
};

function statusFromScore(score: number): SyncHealthStatus {
  if (score >= 75) return "healthy";
  if (score >= 45) return "degraded";
  return "blocked";
}

export function buildAdCatalogSyncHealth(
  options: AdCatalogSyncHealthOptions = {},
): AdCatalogSyncHealth {
  const { generatedAt = new Date().toISOString(), ...feedOptions } = options;
  const feed = buildAdCatalogFeed(feedOptions);
  const adReadiness = calculateAdCampaignReadiness(
    feedOptions.artworks ?? catalogArtworks,
  );
  const checks: SyncHealthCheck[] = [];

  for (const platform of platformIds) {
    const partner = adPlatformPartners.find((entry) => entry.id === platform);
    const summary = feed.platformSummary[platform];
    const platformReadiness = adReadiness.platforms.find((entry) => entry.id === platform);

    const pixelOk =
      partner?.pixelStatus === "configured" || partner?.pixelStatus === "ready";
    checks.push({
      id: `${platform}-pixel`,
      category: "pixel",
      platform,
      label: `${partner?.name ?? platform} pixel`,
      status: pixelOk ? "healthy" : partner?.pixelStatus === "blocked" ? "blocked" : "degraded",
      detail: pixelOk
        ? `Pixel ${partner?.pixelStatus}`
        : partner?.setupBlockers[0] ?? "Pixel not configured",
    });

    const feedOk = summary.minCreativesMet && partner?.catalogSyncStatus !== "blocked";
    checks.push({
      id: `${platform}-feed`,
      category: "feed",
      platform,
      label: `${partner?.name ?? platform} catalog feed`,
      status: feedOk ? "healthy" : summary.eligible > 0 ? "degraded" : "blocked",
      detail: feedOk
        ? `${summary.eligible} eligible rows (min ${summary.minCreativesRequired})`
        : `Only ${summary.eligible}/${summary.minCreativesRequired} creatives; sync blocked`,
    });

    const creativeOk = summary.minCreativesMet;
    checks.push({
      id: `${platform}-creative-quota`,
      category: "creative-quota",
      platform,
      label: `${partner?.name ?? platform} creative quota`,
      status: creativeOk ? "healthy" : summary.eligible >= summary.minCreativesRequired / 2 ? "degraded" : "blocked",
      detail: creativeOk
        ? "Minimum distinct creatives met"
        : `Need ${summary.minCreativesRequired - summary.eligible} more eligible SKUs`,
    });

    if (platformReadiness && !platformReadiness.launchReady) {
      checks.push({
        id: `${platform}-launch-readiness`,
        category: "consent",
        platform,
        label: `${partner?.name ?? platform} launch readiness`,
        status: platformReadiness.readinessPercent >= 55 ? "degraded" : "blocked",
        detail: platformReadiness.setupBlockers[0] ?? adReadiness.blockers[0] ?? "Launch checks incomplete",
      });
    }
  }

  if (adReadiness.consentClearedCount < 3) {
    checks.push({
      id: "consent-cleared-minimum",
      category: "consent",
      label: "Consent-cleared listings",
      status: adReadiness.consentClearedCount >= 1 ? "degraded" : "blocked",
      detail: `${adReadiness.consentClearedCount} cleared (need 3+ for catalog sync)`,
    });
  }

  if (adReadiness.mockupCoveragePercent < 80) {
    checks.push({
      id: "mockup-coverage",
      category: "creative-quota",
      label: "Room mockup coverage",
      status: adReadiness.mockupCoveragePercent >= 50 ? "degraded" : "blocked",
      detail: `${adReadiness.mockupCoveragePercent}% on live SKUs (target 80%+)`,
    });
  }

  const healthyCount = checks.filter((check) => check.status === "healthy").length;
  const overallScore = Math.round(
    (feed.feedHealthScore * 0.4 + adReadiness.score * 0.3 + (healthyCount / Math.max(checks.length, 1)) * 100 * 0.3),
  );

  const platformReadiness = {} as AdCatalogSyncHealth["platformReadiness"];
  for (const platform of platformIds) {
    const platformChecks = checks.filter((check) => check.platform === platform);
    const platformHealthy = platformChecks.filter((check) => check.status === "healthy").length;
    const score = Math.round((platformHealthy / Math.max(platformChecks.length, 1)) * 100);
    const blockers = platformChecks
      .filter((check) => check.status !== "healthy")
      .map((check) => check.detail);

    platformReadiness[platform] = {
      score,
      syncReady: feed.platformSummary[platform].syncReady && score >= 75,
      blockers,
    };
  }

  const recommendedActions = [
    ...adReadiness.blockers.slice(0, 2),
    ...Object.entries(platformReadiness)
      .filter(([, readiness]) => !readiness.syncReady)
      .map(([platform, readiness]) => `${platform}: ${readiness.blockers[0] ?? "Complete sync setup"}`),
    feed.eligibleCount === 0 ? "Clear consent and creative blockers before any catalog API sync" : "",
  ].filter(Boolean);

  const syncReadyPlatforms = Object.values(platformReadiness).filter((entry) => entry.syncReady).length;

  return {
    overallScore,
    overallStatus: statusFromScore(overallScore),
    checks,
    platformReadiness,
    feedHealthScore: feed.feedHealthScore,
    eligibleFeedRows: feed.eligibleCount,
    recommendedActions: Array.from(new Set(recommendedActions)).slice(0, 5),
    summaryLabel: `${syncReadyPlatforms}/3 platforms sync-ready • ${feed.eligibleCount} feed rows • generated ${generatedAt.slice(0, 10)}`,
  };
}
