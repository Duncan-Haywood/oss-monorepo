import { buildAdCatalogFeed, buildAdCatalogSyncHealth } from "./ad-catalog";
import { buildCatalogMetadataDashboard } from "./catalog-intelligence";
import { buildCheckoutFunnelMetrics } from "./checkout";
import { buildOrderSummary } from "./orders";
import { calculateOutreachSummary, outreachProspects } from "./outreach";
import {
  calculateCatalogSummary,
  catalogArtworks,
  type CatalogArtwork,
} from "./marketplace";
import { calculateFulfillmentReadiness } from "./partners";
import { getPublishableSeoSlugs } from "./seo";

export type PipelineStageStatus = "ready" | "partial" | "blocked";

export type ProductPipelineStage = {
  id: "capture" | "catalog" | "storefront" | "fulfillment" | "growth";
  label: string;
  headline: string;
  metricLabel: string;
  metricValue: string;
  progressPercent: number;
  status: PipelineStageStatus;
  href: string;
  blockers: string[];
};

export type ProductPipeline = {
  generatedAt: string;
  stages: ProductPipelineStage[];
  growthEngines: Array<{
    id: string;
    label: string;
    metric: string;
    href: string;
    status: PipelineStageStatus;
  }>;
  overallReadiness: number;
  summaryLabel: string;
};

function statusFromProgress(progress: number, blockers: string[]): PipelineStageStatus {
  if (blockers.length > 0) {
    return progress >= 70 ? "partial" : "blocked";
  }
  if (progress >= 85) {
    return "ready";
  }
  if (progress >= 50) {
    return "partial";
  }
  return "blocked";
}

export function buildProductPipeline(
  artworks: CatalogArtwork[] = catalogArtworks,
  env: Record<string, string | undefined> = {},
): ProductPipeline {
  const catalog = calculateCatalogSummary(artworks);
  const metadata = buildCatalogMetadataDashboard(artworks);
  const publishable = getPublishableSeoSlugs(undefined, artworks);
  const checkout = buildCheckoutFunnelMetrics(artworks, undefined, env);
  const fulfillment = calculateFulfillmentReadiness(artworks);
  const outreach = calculateOutreachSummary(outreachProspects);
  const adFeed = buildAdCatalogFeed({ artworks });
  const adSync = buildAdCatalogSyncHealth({ artworks });
  const orders = buildOrderSummary();

  const captureBlockers: string[] = [];
  if (catalog.proofQueue > 0) {
    captureBlockers.push(`${catalog.proofQueue} proofs awaiting approval`);
  }
  const captureProgress = Math.min(
    100,
    Math.round((catalog.liveArtworks / Math.max(artworks.length, 1)) * 100),
  );

  const catalogBlockers: string[] = [];
  if (metadata.needsAttentionCount > 0) {
    catalogBlockers.push(`${metadata.needsAttentionCount} listings need metadata work`);
  }
  const catalogProgress = Math.round(metadata.averageConfidence);

  const storefrontBlockers = checkout.stages.flatMap((stage) => stage.blockers);
  const storefrontProgress = checkout.overallReadiness;

  const fulfillmentBlockers = [...fulfillment.blockers];
  const printfulConfigured = Boolean(env.PRINTFUL_API_KEY && env.PRINTFUL_STORE_ID);
  if (!printfulConfigured) {
    fulfillmentBlockers.push("PRINTFUL_API_KEY + PRINTFUL_STORE_ID not configured");
  }
  const fulfillmentProgress = printfulConfigured
    ? Math.min(100, fulfillment.score + 15)
    : Math.max(0, fulfillment.score - 20);

  const growthBlockers: string[] = [];
  const syncReadyCount = Object.values(adSync.platformReadiness).filter(
    (entry) => entry.syncReady,
  ).length;
  if (syncReadyCount < 2) {
    growthBlockers.push("Ad catalog sync health below 2/3 platforms");
  }
  if (adFeed.eligibleCount < 3) {
    growthBlockers.push("Fewer than 3 consent-cleared ad feed rows");
  }
  const growthProgress = Math.round(
    (syncReadyCount / 3) * 40 + (adFeed.eligibleCount / Math.max(publishable.length, 1)) * 60,
  );

  const stages: ProductPipelineStage[] = [
    {
      id: "capture",
      label: "Capture",
      headline: "Phone → digitized art",
      metricLabel: "Live SKUs",
      metricValue: `${catalog.liveArtworks} / ${artworks.length}`,
      progressPercent: captureProgress,
      status: statusFromProgress(captureProgress, captureBlockers),
      href: "/capture",
      blockers: captureBlockers,
    },
    {
      id: "catalog",
      label: "Catalog",
      headline: "AI tags, SEO, mockups",
      metricLabel: "Metadata confidence",
      metricValue: `${metadata.averageConfidence}%`,
      progressPercent: catalogProgress,
      status: statusFromProgress(catalogProgress, catalogBlockers),
      href: "/catalog-intelligence",
      blockers: catalogBlockers,
    },
    {
      id: "storefront",
      label: "Storefront",
      headline: "Sell prints + room preview",
      metricLabel: "Checkout readiness",
      metricValue: `${checkout.overallReadiness}%`,
      progressPercent: storefrontProgress,
      status: statusFromProgress(storefrontProgress, storefrontBlockers),
      href: "/storefront",
      blockers: storefrontBlockers,
    },
    {
      id: "fulfillment",
      label: "Fulfillment",
      headline: "POD routing + artist payout",
      metricLabel: "Orders queued",
      metricValue: `${orders.fulfillmentQueued} · ${fulfillment.recommendedPrimary}`,
      progressPercent: fulfillmentProgress,
      status: statusFromProgress(fulfillmentProgress, fulfillmentBlockers),
      href: "/partner-setup",
      blockers: fulfillmentBlockers,
    },
    {
      id: "growth",
      label: "Growth",
      headline: "Outreach, SEO, ads",
      metricLabel: "Ad-sync + outreach",
      metricValue: `${syncReadyCount}/3 sync · ${outreach.readyForOnboarding} onboard-ready`,
      progressPercent: growthProgress,
      status: statusFromProgress(growthProgress, growthBlockers),
      href: "/investor",
      blockers: growthBlockers,
    },
  ];

  const growthEngines = [
    {
      id: "outreach",
      label: "Outreach CRM",
      metric: `${outreach.readyForOnboarding} artists ready`,
      href: "/sales-portal",
      status: (outreach.readyForOnboarding >= 1 ? "ready" : "partial") as PipelineStageStatus,
    },
    {
      id: "seo",
      label: "Programmatic SEO",
      metric: `${publishable.length} indexable slugs`,
      href: "/seo-lab",
      status: (publishable.length >= 3 ? "ready" : "partial") as PipelineStageStatus,
    },
    {
      id: "ads",
      label: "Ad catalog sync",
      metric: `${adFeed.eligibleCount} feed rows`,
      href: "/ad-sync-health",
      status: (syncReadyCount >= 2 ? "ready" : "blocked") as PipelineStageStatus,
    },
  ];

  const overallReadiness = Math.round(
    stages.reduce((sum, stage) => sum + stage.progressPercent, 0) / stages.length,
  );

  return {
    generatedAt: new Date().toISOString(),
    stages,
    growthEngines,
    overallReadiness,
    summaryLabel: `${overallReadiness}% pipeline readiness · ${publishable.length} SEO pages · ${orders.paidOrders} paid orders`,
  };
}
