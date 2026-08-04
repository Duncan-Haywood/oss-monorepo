import {
  buildListingConsentGate,
  buildListingReleaseDecisions,
  buildPayoutExceptionQueue,
  calculateCatalogSummary,
  calculateCreativeReadiness,
  catalogArtworks,
  type CatalogArtwork,
} from "./marketplace";

export type IntegrationStatus = "ready" | "configured" | "blocked" | "not_started";

export type FulfillmentPartner = {
  id: string;
  name: string;
  regions: string[];
  apiStatus: IntegrationStatus;
  avgFulfillmentCost: number;
  marginImpactPercent: number;
  setupBlockers: string[];
  nextAction: string;
};

export type AdPlatformPartner = {
  id: string;
  name: string;
  channel: "paid-social" | "search" | "programmatic";
  pixelStatus: IntegrationStatus;
  catalogSyncStatus: IntegrationStatus;
  minCreativesRequired: number;
  creativesReady: number;
  setupBlockers: string[];
  nextAction: string;
};

export const fulfillmentPartners: FulfillmentPartner[] = [
  {
    id: "printful",
    name: "Printful",
    regions: ["US", "EU", "UK", "CA", "AU"],
    apiStatus: "configured",
    avgFulfillmentCost: 28,
    marginImpactPercent: 0,
    setupBlockers: [],
    nextAction: "Connect production API key and map product SKUs to catalog slugs.",
  },
  {
    id: "gelato",
    name: "Gelato",
    regions: ["US", "EU", "UK", "APAC"],
    apiStatus: "ready",
    avgFulfillmentCost: 26,
    marginImpactPercent: -2.1,
    setupBlockers: [],
    nextAction: "Enable as secondary route for EU/APAC margin optimization.",
  },
  {
    id: "prodigi",
    name: "Prodigi",
    regions: ["US", "EU", "UK"],
    apiStatus: "not_started",
    avgFulfillmentCost: 30,
    marginImpactPercent: 1.8,
    setupBlockers: ["No API credentials", "SKU mapping incomplete"],
    nextAction: "Evaluate as backup only if Printful margin compresses on large formats.",
  },
];

export const adPlatformPartners: AdPlatformPartner[] = [
  {
    id: "meta",
    name: "Meta Ads",
    channel: "paid-social",
    pixelStatus: "configured",
    catalogSyncStatus: "ready",
    minCreativesRequired: 6,
    creativesReady: 0,
    setupBlockers: [],
    nextAction: "Sync live catalog feed once consent-cleared listings hit minimum creative score.",
  },
  {
    id: "google",
    name: "Google Ads",
    channel: "search",
    pixelStatus: "configured",
    catalogSyncStatus: "configured",
    minCreativesRequired: 4,
    creativesReady: 0,
    setupBlockers: [],
    nextAction: "Generate programmatic SEO landing pages from catalog tags before scaling search.",
  },
  {
    id: "pinterest",
    name: "Pinterest",
    channel: "programmatic",
    pixelStatus: "ready",
    catalogSyncStatus: "blocked",
    minCreativesRequired: 8,
    creativesReady: 0,
    setupBlockers: ["Room mockup coverage below 80% on live SKUs"],
    nextAction: "Prioritize room mockups on high-margin listings before catalog upload.",
  },
];

export type PartnerReadinessInput = {
  artworks?: CatalogArtwork[];
  consentClearedCount?: number;
  liveArtworks?: number;
};

export function countCreativesReady(artworks: CatalogArtwork[]) {
  return artworks.filter((artwork) => {
    if (artwork.status !== "Live") return false;
    const readiness = calculateCreativeReadiness(artwork);
    return readiness.score >= 60 && readiness.blockers.length <= 1;
  }).length;
}

export function calculateFulfillmentReadiness(artworks: CatalogArtwork[] = catalogArtworks) {
  const payoutQueue = buildPayoutExceptionQueue(artworks);
  const configured = fulfillmentPartners.filter((partner) => partner.apiStatus !== "not_started");
  const primary = fulfillmentPartners.find((partner) => partner.id === "printful");
  const marginRiskCount = payoutQueue.filter((item) => item.severity === "critical").length;

  const score = Math.max(
    0,
    Math.min(
      100,
      configured.length * 25 +
        (primary?.apiStatus === "configured" ? 25 : 0) +
        (marginRiskCount === 0 ? 25 : marginRiskCount <= 2 ? 12 : 0) +
        (artworks.filter((a) => a.status === "Live").length >= 4 ? 25 : 12),
    ),
  );

  return {
    score,
    label: score >= 85 ? "Fulfillment-ready" : score >= 60 ? "Pilot-ready" : "Setup required",
    configuredPartners: configured.length,
    marginRiskCount,
    recommendedPrimary: primary?.name ?? "Printful",
    blockers: [
      ...payoutQueue
        .filter((item) => item.severity === "critical")
        .slice(0, 2)
        .map((item) => `${item.artwork.title}: ${item.blockers[0] ?? "POD margin risk"}`),
      ...fulfillmentPartners
        .filter((partner) => partner.apiStatus === "not_started")
        .map((partner) => `${partner.name} not integrated`),
    ],
  };
}

export function calculateAdCampaignReadiness(
  artworks: CatalogArtwork[] = catalogArtworks,
  consentClearedCount?: number,
) {
  const liveArtworks = artworks.filter((artwork) => artwork.status === "Live");
  const creativesReady = countCreativesReady(artworks);
  const consentGate = buildListingConsentGate(artworks);
  const cleared = consentClearedCount ?? consentGate.clearedCount;
  const mockupCoverage = Math.round(
    (liveArtworks.filter((artwork) => artwork.hasRoomMockups).length / Math.max(liveArtworks.length, 1)) * 100,
  );

  const platforms = adPlatformPartners.map((platform) => {
    const creativesReadyForPlatform = Math.min(creativesReady, platform.minCreativesRequired);
    const catalogReady = cleared >= 3 && creativesReady >= platform.minCreativesRequired / 2;
    const pixelReady = platform.pixelStatus === "configured" || platform.pixelStatus === "ready";
    const ready = pixelReady && catalogReady && creativesReady >= platform.minCreativesRequired;

    return {
      ...platform,
      creativesReady: creativesReadyForPlatform,
      readinessPercent: Math.round(
        ((pixelReady ? 35 : 0) +
          (catalogReady ? 35 : 0) +
          (creativesReady / Math.max(platform.minCreativesRequired, 1)) * 30) *
          (platform.catalogSyncStatus === "blocked" ? 0.6 : 1),
      ),
      launchReady: ready && platform.catalogSyncStatus !== "blocked",
    };
  });

  const score = Math.round(
    platforms.reduce((sum, platform) => sum + platform.readinessPercent, 0) / Math.max(platforms.length, 1),
  );

  return {
    score,
    label: score >= 80 ? "Ad-ready catalog" : score >= 55 ? "Limited test spend" : "Hold paid spend",
    creativesReady,
    consentClearedCount: cleared,
    mockupCoveragePercent: mockupCoverage,
    platforms,
    blockers: [
      ...(mockupCoverage < 80 ? [`Room mockup coverage at ${mockupCoverage}% (target 80%+)`] : []),
      ...(cleared < 3 ? [`Only ${cleared} consent-cleared listings (need 3+)`] : []),
      ...(creativesReady < 6 ? [`${creativesReady} ad-ready creatives (need 6+)`] : []),
    ],
  };
}

export function calculateMarketLaunchScore(artworks: CatalogArtwork[] = catalogArtworks) {
  const catalog = calculateCatalogSummary(artworks);
  const releaseQueue = buildListingReleaseDecisions(artworks);
  const consentGate = buildListingConsentGate(artworks);
  const fulfillment = calculateFulfillmentReadiness(artworks);
  const ads = calculateAdCampaignReadiness(artworks, consentGate.clearedCount);

  const supplyScore = Math.min(100, catalog.averageReadinessScore);
  const demandScore = ads.score;
  const opsScore = Math.round(
    ((releaseQueue.releaseReadyCount / Math.max(catalog.liveArtworks, 1)) * 50 +
      (consentGate.clearedCount / Math.max(catalog.liveArtworks, 1)) * 50) *
      (catalog.liveArtworks > 0 ? 1 : 0),
  );
  const fulfillmentScore = fulfillment.score;

  const overall = Math.round((supplyScore + demandScore + opsScore + fulfillmentScore) / 4);

  return {
    overall,
    label:
      overall >= 80
        ? "Market launch ready"
        : overall >= 60
          ? "Soft launch with guardrails"
          : "Pre-launch — fix blockers",
    supplyScore,
    demandScore,
    opsScore,
    fulfillmentScore,
    liveListings: catalog.liveArtworks,
    releaseReadyCount: releaseQueue.releaseReadyCount,
    consentClearedCount: consentGate.clearedCount,
    topBlockers: [
      ...fulfillment.blockers.slice(0, 1),
      ...ads.blockers.slice(0, 2),
      ...(releaseQueue.holdCount > 0 ? [`${releaseQueue.holdCount} listings on ops hold`] : []),
    ].slice(0, 4),
  };
}
