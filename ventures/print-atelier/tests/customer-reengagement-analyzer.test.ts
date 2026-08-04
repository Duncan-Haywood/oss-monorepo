import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyLifecycleStage,
  analyzeSegmentReengagement,
  analyzeBuyerReengagementPortfolio,
  generateConvexReengagementAnalyzerSchema,
  persistReengagementCampaignReport,
  getReengagementCampaignReports,
  clearReengagementReportsForTesting,
  BuyerCohortSegmentInput,
} from "../src/lib/customer-reengagement-analyzer";

describe("customer re-engagement analyzer", () => {
  describe("classifyLifecycleStage", () => {
    it("classifies <= 60 days as active", () => {
      assert.equal(classifyLifecycleStage(30), "active");
      assert.equal(classifyLifecycleStage(60), "active");
    });

    it("classifies 61-120 days as at_risk", () => {
      assert.equal(classifyLifecycleStage(90), "at_risk");
      assert.equal(classifyLifecycleStage(120), "at_risk");
    });

    it("classifies 121-240 days as dormant", () => {
      assert.equal(classifyLifecycleStage(180), "dormant");
      assert.equal(classifyLifecycleStage(240), "dormant");
    });

    it("classifies > 240 days as churned", () => {
      assert.equal(classifyLifecycleStage(300), "churned");
    });
  });

  describe("analyzeSegmentReengagement", () => {
    const sampleSegment: BuyerCohortSegmentInput = {
      segmentId: "seg_vip_collectors",
      segmentName: "VIP Repeat Fine Art Collectors",
      channelId: "meta_ads",
      customerCount: 500,
      averageHistoricalAovUsd: 250,
      averageOrdersPerCustomer: 3.2,
      daysSinceLastPurchaseAvg: 45,
      grossMarginPct: 0.45,
      emailOptInRate: 0.8,
    };

    it("analyzes segment and selects the optimal profit-maximizing campaign", () => {
      const result = analyzeSegmentReengagement(sampleSegment);

      assert.equal(result.segmentId, "seg_vip_collectors");
      assert.equal(result.lifecycleStage, "active");
      assert.equal(result.reachableCustomers, 400); // 500 * 0.8
      assert.equal(result.campaignNetProfitUsd > 0, true);
      assert.equal(result.roasRatio > 0, true);
      assert.equal(result.recommendedCampaignId.length > 0, true);
      assert.equal(result.status, "highly_profitable");
    });

    it("handles low opt-in and low margin segments gracefully", () => {
      const lowMarginSegment: BuyerCohortSegmentInput = {
        segmentId: "seg_low_margin",
        segmentName: "Single-Item Discount Shoppers",
        channelId: "google_search",
        customerCount: 100,
        averageHistoricalAovUsd: 30,
        averageOrdersPerCustomer: 1.0,
        daysSinceLastPurchaseAvg: 280,
        grossMarginPct: 0.1,
        emailOptInRate: 0.2,
      };

      const result = analyzeSegmentReengagement(lowMarginSegment);
      assert.equal(result.lifecycleStage, "churned");
      assert.equal(result.reachableCustomers, 20);
    });
  });

  describe("analyzeBuyerReengagementPortfolio", () => {
    const segments: BuyerCohortSegmentInput[] = [
      {
        segmentId: "seg_1",
        segmentName: "Active Enthusiasts",
        channelId: "meta_ads",
        customerCount: 1000,
        averageHistoricalAovUsd: 180,
        averageOrdersPerCustomer: 2.1,
        daysSinceLastPurchaseAvg: 40,
        grossMarginPct: 0.4,
        emailOptInRate: 0.85,
      },
      {
        segmentId: "seg_2",
        segmentName: "At-Risk Print Buyers",
        channelId: "pinterest_ads",
        customerCount: 600,
        averageHistoricalAovUsd: 120,
        averageOrdersPerCustomer: 1.5,
        daysSinceLastPurchaseAvg: 110,
        grossMarginPct: 0.35,
        emailOptInRate: 0.7,
      },
      {
        segmentId: "seg_3",
        segmentName: "Dormant Collectors",
        channelId: "google_search",
        customerCount: 800,
        averageHistoricalAovUsd: 220,
        averageOrdersPerCustomer: 1.8,
        daysSinceLastPurchaseAvg: 200,
        grossMarginPct: 0.42,
        emailOptInRate: 0.6,
      },
    ];

    it("aggregates portfolio re-engagement metrics across cohorts", () => {
      const summary = analyzeBuyerReengagementPortfolio(segments);

      assert.equal(summary.segments.length, 3);
      assert.equal(summary.totalTargetableCustomers, 2400);
      assert.equal(summary.totalReachableCustomers > 0, true);
      assert.equal(summary.totalExpectedNetProfitUsd > 0, true);
      assert.equal(summary.blendedRoasRatio > 0, true);
      assert.equal(summary.topReengagementSegment.length > 0, true);
    });

    it("issues warning when high proportion of customers are dormant/churned", () => {
      const dormantHeavySegments: BuyerCohortSegmentInput[] = [
        {
          segmentId: "seg_dormant_1",
          segmentName: "Dormant 2025 Cohort",
          channelId: "meta_ads",
          customerCount: 1000,
          averageHistoricalAovUsd: 100,
          averageOrdersPerCustomer: 1.0,
          daysSinceLastPurchaseAvg: 300,
          grossMarginPct: 0.35,
          emailOptInRate: 0.5,
        },
      ];

      const summary = analyzeBuyerReengagementPortfolio(dormantHeavySegments);
      assert.equal(
        summary.warnings.some((w) => w.includes("High proportion of portfolio customers are dormant/churned")),
        true,
      );
    });
  });

  describe("Convex schema generation and report persistence", () => {
    it("generates valid Convex schema definition for reengagement_campaign_reports", () => {
      const schemaDef = generateConvexReengagementAnalyzerSchema();
      assert.equal(schemaDef.tableName, "reengagement_campaign_reports");
      assert.equal(schemaDef.indexes.includes("by_reportId"), true);
      assert.equal(schemaDef.indexes.includes("by_timestamp"), true);
      assert.equal(schemaDef.schemaCode.includes("defineTable"), true);
    });

    it("persists report and retrieves persisted records", () => {
      clearReengagementReportsForTesting();

      const summary = analyzeBuyerReengagementPortfolio([
        {
          segmentId: "seg_test",
          segmentName: "Test Segment",
          channelId: "meta_ads",
          customerCount: 500,
          averageHistoricalAovUsd: 150,
          averageOrdersPerCustomer: 2.0,
          daysSinceLastPurchaseAvg: 50,
          grossMarginPct: 0.4,
          emailOptInRate: 0.8,
        },
      ]);

      const record = persistReengagementCampaignReport(summary, "2026-08-01T12:00:00Z");
      assert.match(record.reportId, /^reengage_rpt_/);
      assert.equal(record.totalTargetableCustomers, 500);

      const allRecords = getReengagementCampaignReports();
      assert.equal(allRecords.length, 1);
      assert.equal(allRecords[0].reportId, record.reportId);
    });
  });
});
