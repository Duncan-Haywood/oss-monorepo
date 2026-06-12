import { buildCheckoutFunnelMetrics, type CheckoutFunnelMetrics } from "./checkout";
import { buildMarketLaunchCommandCenter, type MarketLaunchCommandCenter } from "./market-launch";
import { buildOrderSummary, type OrderSummary } from "./orders";
import { buildStripePayoutLedgerSummary, type StripePayoutLedgerSummary } from "./stripe-ledger";
import {
  allocateWeeklyChannelBudget,
  buildListingConsentGate,
  buildListingReleaseDecisions,
  buildPayoutExceptionQueue,
  calculateCatalogSummary,
  calculatePrintEconomics,
  catalogArtworks,
  type CatalogArtwork,
} from "./marketplace";
import { calculateOutreachSummary, outreachProspects } from "./outreach";
import {
  adPlatformPartners,
  calculateAdCampaignReadiness,
  calculateFulfillmentReadiness,
  calculateMarketLaunchScore,
  fulfillmentPartners,
} from "./partners";

const defaultWeeklyBudget = 6800;
const defaultRetailPrice = 85;
const defaultFulfillmentCost = 28;
const defaultMonthlyOrders = 500;

export type InvestorSnapshot = {
  generatedAt: string;
  marketLaunch: ReturnType<typeof calculateMarketLaunchScore>;
  catalog: ReturnType<typeof calculateCatalogSummary>;
  outreach: ReturnType<typeof calculateOutreachSummary>;
  release: ReturnType<typeof buildListingReleaseDecisions>;
  consent: ReturnType<typeof buildListingConsentGate>;
  payoutExceptions: ReturnType<typeof buildPayoutExceptionQueue>;
  fulfillment: ReturnType<typeof calculateFulfillmentReadiness>;
  advertising: ReturnType<typeof calculateAdCampaignReadiness>;
  channelBudget: ReturnType<typeof allocateWeeklyChannelBudget>;
  unitEconomics: ReturnType<typeof calculatePrintEconomics>;
  monthlyGrossRevenue: number;
  monthlyPlatformShare: number;
  monthlyArtistPayouts: number;
  fulfillmentPartnerCount: number;
  adPlatformCount: number;
  pipelineStages: Array<{ stage: string; count: number; status: "healthy" | "watch" | "blocked" }>;
  checkoutFunnel: CheckoutFunnelMetrics;
  launchCommandCenter: MarketLaunchCommandCenter;
  payoutLedger: StripePayoutLedgerSummary;
  orderSummary: OrderSummary;
};

export function buildInvestorSnapshot(
  artworks: CatalogArtwork[] = catalogArtworks,
  env: Record<string, string | undefined> = {},
): InvestorSnapshot {
  const catalog = calculateCatalogSummary(artworks);
  const outreach = calculateOutreachSummary(outreachProspects);
  const release = buildListingReleaseDecisions(artworks);
  const consent = buildListingConsentGate(artworks);
  const payoutExceptions = buildPayoutExceptionQueue(artworks);
  const fulfillment = calculateFulfillmentReadiness(artworks);
  const advertising = calculateAdCampaignReadiness(artworks, consent.clearedCount);
  const marketLaunch = calculateMarketLaunchScore(artworks);
  const unitEconomics = calculatePrintEconomics({
    retailPrice: defaultRetailPrice,
    fulfillmentCost: defaultFulfillmentCost,
  });

  const channelBudget = allocateWeeklyChannelBudget({
    totalWeeklyBudget: defaultWeeklyBudget,
    retailPrice: defaultRetailPrice,
    fulfillmentCost: defaultFulfillmentCost,
    minLtvToCacRatio: 1.5,
    channels: [
      {
        id: "artist-community",
        label: "Artist community loop",
        weeklyBudgetCap: 1200,
        baselineCAC: 12,
        purchasesPerCustomer: 1.4,
        previewLiftPercent: 0,
      },
      {
        id: "paid-social-preview",
        label: "Paid social + room preview",
        weeklyBudgetCap: 2200,
        baselineCAC: 68,
        purchasesPerCustomer: 1.6,
        previewLiftPercent: 35,
      },
      {
        id: "search-intent",
        label: "Search intent pages",
        weeklyBudgetCap: 1600,
        baselineCAC: 42,
        purchasesPerCustomer: 1.5,
        previewLiftPercent: 10,
      },
      {
        id: "designer-trade",
        label: "Designer trade referrals",
        weeklyBudgetCap: 1800,
        baselineCAC: 35,
        purchasesPerCustomer: 2.4,
        previewLiftPercent: 15,
      },
    ],
  });

  const monthlyGrossRevenue = defaultMonthlyOrders * defaultRetailPrice;
  const monthlyPlatformShare = defaultMonthlyOrders * unitEconomics.platformShare;
  const monthlyArtistPayouts = catalog.projectedMonthlyArtistPayout;

  const checkoutFunnel = buildCheckoutFunnelMetrics(artworks, undefined, env);
  const launchCommandCenter = buildMarketLaunchCommandCenter(artworks, env);
  const payoutLedger = buildStripePayoutLedgerSummary();
  const orderSummary = buildOrderSummary();

  const pipelineStages = [
    {
      stage: "Outreach prospects",
      count: outreach.totalProspects,
      status: outreach.readyForOnboarding >= 2 ? ("healthy" as const) : ("watch" as const),
    },
    {
      stage: "Onboarding-ready replies",
      count: outreach.readyForOnboarding,
      status: outreach.readyForOnboarding >= 1 ? ("healthy" as const) : ("watch" as const),
    },
    {
      stage: "Live catalog SKUs",
      count: catalog.liveArtworks,
      status: catalog.liveArtworks >= 5 ? ("healthy" as const) : ("watch" as const),
    },
    {
      stage: "Release-ready listings",
      count: release.releaseReadyCount,
      status: release.releaseReadyCount >= 3 ? ("healthy" as const) : ("blocked" as const),
    },
    {
      stage: "Consent-cleared channels",
      count: consent.clearedCount,
      status: consent.clearedCount >= 3 ? ("healthy" as const) : ("blocked" as const),
    },
    {
      stage: "Payout exceptions",
      count: payoutExceptions.length,
      status: payoutExceptions.length === 0 ? ("healthy" as const) : ("watch" as const),
    },
    {
      stage: "Ad-ready creatives",
      count: advertising.creativesReady,
      status: advertising.creativesReady >= 6 ? ("healthy" as const) : ("blocked" as const),
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    marketLaunch,
    catalog,
    outreach,
    release,
    consent,
    payoutExceptions,
    fulfillment,
    advertising,
    channelBudget,
    unitEconomics,
    monthlyGrossRevenue,
    monthlyPlatformShare,
    monthlyArtistPayouts,
    fulfillmentPartnerCount: fulfillmentPartners.filter((p) => p.apiStatus !== "not_started").length,
    adPlatformCount: adPlatformPartners.length,
    pipelineStages,
    checkoutFunnel,
    launchCommandCenter,
    payoutLedger,
    orderSummary,
  };
}
