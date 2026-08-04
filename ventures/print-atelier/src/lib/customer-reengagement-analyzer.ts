import { AcquisitionChannelId } from "./contribution-margin";

export type CustomerSegmentLifecycleStage = "active" | "at_risk" | "dormant" | "churned";

export type BuyerCohortSegmentInput = {
  segmentId: string;
  segmentName: string;
  channelId: AcquisitionChannelId;
  customerCount: number;
  averageHistoricalAovUsd: number;
  averageOrdersPerCustomer: number;
  daysSinceLastPurchaseAvg: number;
  grossMarginPct: number; // e.g. 0.40 = 40% gross profit margin
  emailOptInRate: number; // e.g. 0.75 = 75% email reachable
};

export type ReengagementCampaignOption = {
  campaignId: string;
  campaignName: string;
  offerType: "vip_preview" | "room_refresh_discount" | "framing_upgrade" | "winback_credit";
  discountRatePct: number; // e.g. 0.15 = 15% discount off retail
  campaignCostPerCustomerUsd: number; // ad spend or email delivery cost per target
  expectedConversionRatePct: number; // e.g. 0.08 = 8% convert
};

export type SegmentReengagementAnalysis = {
  segmentId: string;
  segmentName: string;
  lifecycleStage: CustomerSegmentLifecycleStage;
  customerCount: number;
  reachableCustomers: number;
  totalCampaignCostUsd: number;
  expectedConversions: number;
  expectedGrossRevenueUsd: number;
  expectedGrossProfitUsd: number;
  campaignNetProfitUsd: number;
  roasRatio: number;
  incrementalLtvPerCustomerUsd: number;
  recommendedCampaignId: string;
  recommendedCampaignName: string;
  status: "highly_profitable" | "profitable" | "break_even" | "unprofitable";
  recommendation: string;
};

export type BuyerReengagementPortfolioReport = {
  segments: SegmentReengagementAnalysis[];
  totalTargetableCustomers: number;
  totalReachableCustomers: number;
  totalCampaignSpendUsd: number;
  totalExpectedGrossRevenueUsd: number;
  totalExpectedNetProfitUsd: number;
  blendedRoasRatio: number;
  topReengagementSegment: string;
  warnings: string[];
};

export function classifyLifecycleStage(daysSinceLastPurchase: number): CustomerSegmentLifecycleStage {
  if (daysSinceLastPurchase <= 60) return "active";
  if (daysSinceLastPurchase <= 120) return "at_risk";
  if (daysSinceLastPurchase <= 240) return "dormant";
  return "churned";
}

export const DEFAULT_CAMPAIGN_OPTIONS: ReengagementCampaignOption[] = [
  {
    campaignId: "vip_preview",
    campaignName: "Exclusive VIP Early Release Access",
    offerType: "vip_preview",
    discountRatePct: 0.05,
    campaignCostPerCustomerUsd: 0.5,
    expectedConversionRatePct: 0.12,
  },
  {
    campaignId: "room_refresh",
    campaignName: "Room-Scene Art Refresh Discount",
    offerType: "room_refresh_discount",
    discountRatePct: 0.15,
    campaignCostPerCustomerUsd: 1.2,
    expectedConversionRatePct: 0.09,
  },
  {
    campaignId: "framing_upgrade",
    campaignName: "Complimentary Framing Upgrade",
    offerType: "framing_upgrade",
    discountRatePct: 0.1,
    campaignCostPerCustomerUsd: 2.0,
    expectedConversionRatePct: 0.07,
  },
  {
    campaignId: "winback_credit",
    campaignName: "$25 Collector Win-Back Store Credit",
    offerType: "winback_credit",
    discountRatePct: 0.25,
    campaignCostPerCustomerUsd: 3.5,
    expectedConversionRatePct: 0.05,
  },
];

export function analyzeSegmentReengagement(
  segment: BuyerCohortSegmentInput,
  campaignOptions: ReengagementCampaignOption[] = DEFAULT_CAMPAIGN_OPTIONS,
): SegmentReengagementAnalysis {
  const lifecycleStage = classifyLifecycleStage(segment.daysSinceLastPurchaseAvg);
  const reachableCustomers = Math.round(segment.customerCount * segment.emailOptInRate);

  // Evaluate candidate campaigns and select the one maximizing net campaign profit
  let bestCampaign = campaignOptions[0];
  let bestNetProfit = -Infinity;
  let bestMetrics = {
    totalCampaignCostUsd: 0,
    expectedConversions: 0,
    expectedGrossRevenueUsd: 0,
    expectedGrossProfitUsd: 0,
    roasRatio: 0,
    incrementalLtvPerCustomerUsd: 0,
  };

  for (const campaign of campaignOptions) {
    const totalCost = reachableCustomers * campaign.campaignCostPerCustomerUsd;
    const expectedConversions = Math.round(reachableCustomers * campaign.expectedConversionRatePct);
    const effectiveAov = segment.averageHistoricalAovUsd * (1 - campaign.discountRatePct);
    const expectedRevenue = expectedConversions * effectiveAov;
    const netMarginPct = Math.max(segment.grossMarginPct - campaign.discountRatePct, 0.05);
    const expectedProfit = expectedRevenue * netMarginPct;
    const netProfit = expectedProfit - totalCost;
    const roas = totalCost > 0 ? expectedRevenue / totalCost : expectedRevenue > 0 ? 99 : 0;
    const incrementalLtv = segment.customerCount > 0 ? netProfit / segment.customerCount : 0;

    if (netProfit > bestNetProfit) {
      bestNetProfit = netProfit;
      bestCampaign = campaign;
      bestMetrics = {
        totalCampaignCostUsd: Math.round(totalCost * 100) / 100,
        expectedConversions,
        expectedGrossRevenueUsd: Math.round(expectedRevenue * 100) / 100,
        expectedGrossProfitUsd: Math.round(expectedProfit * 100) / 100,
        roasRatio: Math.round(roas * 100) / 100,
        incrementalLtvPerCustomerUsd: Math.round(incrementalLtv * 100) / 100,
      };
    }
  }

  const campaignNetProfitUsd = Math.round(bestNetProfit * 100) / 100;
  let status: "highly_profitable" | "profitable" | "break_even" | "unprofitable" = "profitable";
  let recommendation = `Deploy '${bestCampaign.campaignName}' for ${reachableCustomers} reachable customers.`;

  if (campaignNetProfitUsd < 0) {
    status = "unprofitable";
    recommendation = `Segment is unprofitable under current offers (Loss: $${Math.abs(campaignNetProfitUsd)}). Restructure audience targeting.`;
  } else if (bestMetrics.roasRatio >= 4.0) {
    status = "highly_profitable";
    recommendation = `High-yield re-engagement segment (${bestMetrics.roasRatio}x ROAS). Scale campaign budget immediately.`;
  } else if (bestMetrics.roasRatio < 1.2) {
    status = "break_even";
    recommendation = `Low margin margin (${bestMetrics.roasRatio}x ROAS). Limit ad spend to organic email/SMS channels.`;
  }

  return {
    segmentId: segment.segmentId,
    segmentName: segment.segmentName,
    lifecycleStage,
    customerCount: segment.customerCount,
    reachableCustomers,
    totalCampaignCostUsd: bestMetrics.totalCampaignCostUsd,
    expectedConversions: bestMetrics.expectedConversions,
    expectedGrossRevenueUsd: bestMetrics.expectedGrossRevenueUsd,
    expectedGrossProfitUsd: bestMetrics.expectedGrossProfitUsd,
    campaignNetProfitUsd,
    roasRatio: bestMetrics.roasRatio,
    incrementalLtvPerCustomerUsd: bestMetrics.incrementalLtvPerCustomerUsd,
    recommendedCampaignId: bestCampaign.campaignId,
    recommendedCampaignName: bestCampaign.campaignName,
    status,
    recommendation,
  };
}

export function analyzeBuyerReengagementPortfolio(
  segments: BuyerCohortSegmentInput[],
  campaignOptions: ReengagementCampaignOption[] = DEFAULT_CAMPAIGN_OPTIONS,
): BuyerReengagementPortfolioReport {
  const analyzedSegments = segments.map((s) => analyzeSegmentReengagement(s, campaignOptions));

  const totalTargetableCustomers = analyzedSegments.reduce((sum, s) => sum + s.customerCount, 0);
  const totalReachableCustomers = analyzedSegments.reduce((sum, s) => sum + s.reachableCustomers, 0);
  const totalCampaignSpendUsd = Math.round(
    analyzedSegments.reduce((sum, s) => sum + s.totalCampaignCostUsd, 0) * 100,
  ) / 100;
  const totalExpectedGrossRevenueUsd = Math.round(
    analyzedSegments.reduce((sum, s) => sum + s.expectedGrossRevenueUsd, 0) * 100,
  ) / 100;
  const totalExpectedNetProfitUsd = Math.round(
    analyzedSegments.reduce((sum, s) => sum + s.campaignNetProfitUsd, 0) * 100,
  ) / 100;

  const blendedRoasRatio =
    totalCampaignSpendUsd > 0
      ? Math.round((totalExpectedGrossRevenueUsd / totalCampaignSpendUsd) * 100) / 100
      : totalExpectedGrossRevenueUsd > 0
      ? 999
      : 0;

  const sortedByProfit = [...analyzedSegments].sort((a, b) => b.campaignNetProfitUsd - a.campaignNetProfitUsd);
  const topReengagementSegment = sortedByProfit[0]?.segmentName ?? "None";

  const warnings: string[] = [];
  const unprofitableSegments = analyzedSegments.filter((s) => s.status === "unprofitable");
  if (unprofitableSegments.length > 0) {
    warnings.push(
      `${unprofitableSegments.length} customer segment(s) produce negative net profit on re-engagement campaigns.`,
    );
  }

  const dormantOrChurnedCount = analyzedSegments
    .filter((s) => s.lifecycleStage === "dormant" || s.lifecycleStage === "churned")
    .reduce((sum, s) => sum + s.customerCount, 0);

  if (dormantOrChurnedCount > totalTargetableCustomers * 0.4) {
    warnings.push(
      `High proportion of portfolio customers are dormant/churned (${dormantOrChurnedCount} of ${totalTargetableCustomers}). Focus on early at-risk intervention.`,
    );
  }

  return {
    segments: analyzedSegments,
    totalTargetableCustomers,
    totalReachableCustomers,
    totalCampaignSpendUsd,
    totalExpectedGrossRevenueUsd,
    totalExpectedNetProfitUsd,
    blendedRoasRatio,
    topReengagementSegment,
    warnings,
  };
}

export type ConvexReengagementAnalyzerRecord = {
  reportId: string;
  timestamp: string;
  totalTargetableCustomers: number;
  totalReachableCustomers: number;
  totalCampaignSpendUsd: number;
  totalExpectedGrossRevenueUsd: number;
  totalExpectedNetProfitUsd: number;
  blendedRoasRatio: number;
  topReengagementSegment: string;
  warningsCount: number;
  convexSyncedAt: string;
};

const reengagementReportStore: ConvexReengagementAnalyzerRecord[] = [];

export function generateConvexReengagementAnalyzerSchema() {
  const schemaCode = `
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  reengagement_campaign_reports: defineTable({
    reportId: v.string(),
    timestamp: v.string(),
    totalTargetableCustomers: v.number(),
    totalReachableCustomers: v.number(),
    totalCampaignSpendUsd: v.number(),
    totalExpectedGrossRevenueUsd: v.number(),
    totalExpectedNetProfitUsd: v.number(),
    blendedRoasRatio: v.number(),
    topReengagementSegment: v.string(),
    warningsCount: v.number(),
    convexSyncedAt: v.string(),
  })
    .index("by_reportId", ["reportId"])
    .index("by_timestamp", ["timestamp"]),
});
`;
  return {
    tableName: "reengagement_campaign_reports",
    indexes: ["by_reportId", "by_timestamp"],
    schemaCode: schemaCode.trim(),
  };
}

export function persistReengagementCampaignReport(
  report: BuyerReengagementPortfolioReport,
  timestamp: string = new Date().toISOString(),
): ConvexReengagementAnalyzerRecord {
  const reportId = `reengage_rpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const record: ConvexReengagementAnalyzerRecord = {
    reportId,
    timestamp,
    totalTargetableCustomers: report.totalTargetableCustomers,
    totalReachableCustomers: report.totalReachableCustomers,
    totalCampaignSpendUsd: report.totalCampaignSpendUsd,
    totalExpectedGrossRevenueUsd: report.totalExpectedGrossRevenueUsd,
    totalExpectedNetProfitUsd: report.totalExpectedNetProfitUsd,
    blendedRoasRatio: report.blendedRoasRatio,
    topReengagementSegment: report.topReengagementSegment,
    warningsCount: report.warnings.length,
    convexSyncedAt: timestamp,
  };

  reengagementReportStore.unshift(record);
  return record;
}

export function getReengagementCampaignReports(limit?: number): ConvexReengagementAnalyzerRecord[] {
  let records = [...reengagementReportStore];
  if (limit) {
    records = records.slice(0, limit);
  }
  return records;
}

export function clearReengagementReportsForTesting(): void {
  reengagementReportStore.length = 0;
}
