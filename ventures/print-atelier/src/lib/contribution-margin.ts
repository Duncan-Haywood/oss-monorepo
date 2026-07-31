export type AcquisitionChannelId =
  | "meta_ads"
  | "google_search"
  | "pinterest_ads"
  | "direct_outreach"
  | "b2b_trade"
  | "programmatic_seo";

export type ChannelMarginInput = {
  channelId: AcquisitionChannelId;
  channelName: string;
  orderCount: number;
  grossRevenueUsd: number;
  podFulfillmentCostUsd: number;
  artistPayoutUsd: number;
  adSpendUsd: number;
};

export type ChannelMarginPerformance = {
  channelId: AcquisitionChannelId;
  channelName: string;
  orderCount: number;
  grossRevenueUsd: number;
  podFulfillmentCostUsd: number;
  artistPayoutUsd: number;
  adSpendUsd: number;
  netContributionUsd: number;
  contributionMarginPct: number;
  roas: number; // Gross revenue / Ad spend
  breakEvenCacUsd: number; // Average gross profit per order before ad spend
  actualCacUsd: number;
  status: "scale" | "maintain" | "review";
  recommendation: string;
};

export type PortfolioMarginSummary = {
  channels: ChannelMarginPerformance[];
  totalOrders: number;
  totalGrossRevenueUsd: number;
  totalPodCostUsd: number;
  totalArtistPayoutUsd: number;
  totalAdSpendUsd: number;
  totalNetContributionUsd: number;
  portfolioMarginPct: number;
  blendedRoas: number;
  blendedCacUsd: number;
  topPerformingChannel: string;
  channelsNeedingReview: string[];
};

export function calculateChannelContributionMargin(
  input: ChannelMarginInput,
): ChannelMarginPerformance {
  const {
    channelId,
    channelName,
    orderCount,
    grossRevenueUsd,
    podFulfillmentCostUsd,
    artistPayoutUsd,
    adSpendUsd,
  } = input;

  const netContributionUsd = Math.round(
    (grossRevenueUsd - podFulfillmentCostUsd - artistPayoutUsd - adSpendUsd) * 100,
  ) / 100;

  const contributionMarginPct =
    grossRevenueUsd > 0
      ? Math.round((netContributionUsd / grossRevenueUsd) * 10000) / 100
      : 0;

  const roas =
    adSpendUsd > 0
      ? Math.round((grossRevenueUsd / adSpendUsd) * 100) / 100
      : grossRevenueUsd > 0
      ? 999
      : 0;

  const grossProfitBeforeSpend = grossRevenueUsd - podFulfillmentCostUsd - artistPayoutUsd;
  const breakEvenCacUsd =
    orderCount > 0
      ? Math.round((grossProfitBeforeSpend / orderCount) * 100) / 100
      : 0;

  const actualCacUsd =
    orderCount > 0 ? Math.round((adSpendUsd / orderCount) * 100) / 100 : 0;

  let status: "scale" | "maintain" | "review" = "maintain";
  let recommendation = "Maintain current spend caps and monitor CAC.";

  if (netContributionUsd < 0 || (adSpendUsd > 0 && roas < 1.5)) {
    status = "review";
    recommendation = `Negative net contribution or low ROAS (${roas}x). Pause or reduce bid caps to lower CAC below break-even ($${breakEvenCacUsd}).`;
  } else if (contributionMarginPct >= 15 && (adSpendUsd === 0 || roas >= 2.5)) {
    status = "scale";
    recommendation = `Strong net contribution margin (${contributionMarginPct}%) and ROAS (${roas}x). Increase channel budget cap by 20%.`;
  }

  return {
    channelId,
    channelName,
    orderCount,
    grossRevenueUsd,
    podFulfillmentCostUsd,
    artistPayoutUsd,
    adSpendUsd,
    netContributionUsd,
    contributionMarginPct,
    roas,
    breakEvenCacUsd,
    actualCacUsd,
    status,
    recommendation,
  };
}

export function summarizePortfolioContributionMargin(
  inputs: ChannelMarginInput[],
): PortfolioMarginSummary {
  const channels = inputs.map(calculateChannelContributionMargin);

  const totalOrders = channels.reduce((sum, c) => sum + c.orderCount, 0);
  const totalGrossRevenueUsd = Math.round(
    channels.reduce((sum, c) => sum + c.grossRevenueUsd, 0) * 100,
  ) / 100;
  const totalPodCostUsd = Math.round(
    channels.reduce((sum, c) => sum + c.podFulfillmentCostUsd, 0) * 100,
  ) / 100;
  const totalArtistPayoutUsd = Math.round(
    channels.reduce((sum, c) => sum + c.artistPayoutUsd, 0) * 100,
  ) / 100;
  const totalAdSpendUsd = Math.round(
    channels.reduce((sum, c) => sum + c.adSpendUsd, 0) * 100,
  ) / 100;
  const totalNetContributionUsd = Math.round(
    channels.reduce((sum, c) => sum + c.netContributionUsd, 0) * 100,
  ) / 100;

  const portfolioMarginPct =
    totalGrossRevenueUsd > 0
      ? Math.round((totalNetContributionUsd / totalGrossRevenueUsd) * 10000) / 100
      : 0;

  const blendedRoas =
    totalAdSpendUsd > 0
      ? Math.round((totalGrossRevenueUsd / totalAdSpendUsd) * 100) / 100
      : totalGrossRevenueUsd > 0
      ? 999
      : 0;

  const blendedCacUsd =
    totalOrders > 0 ? Math.round((totalAdSpendUsd / totalOrders) * 100) / 100 : 0;

  const sortedByContribution = [...channels].sort(
    (a, b) => b.netContributionUsd - a.netContributionUsd,
  );
  const topPerformingChannel =
    sortedByContribution[0]?.channelName ?? "None";

  const channelsNeedingReview = channels
    .filter((c) => c.status === "review")
    .map((c) => c.channelName);

  return {
    channels,
    totalOrders,
    totalGrossRevenueUsd,
    totalPodCostUsd,
    totalArtistPayoutUsd,
    totalAdSpendUsd,
    totalNetContributionUsd,
    portfolioMarginPct,
    blendedRoas,
    blendedCacUsd,
    topPerformingChannel,
    channelsNeedingReview,
  };
}
