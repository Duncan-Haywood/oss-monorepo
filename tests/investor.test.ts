import assert from "node:assert/strict";
import { test } from "node:test";
import { buildInvestorSnapshot } from "../src/lib/investor.ts";
import {
  calculateAdCampaignReadiness,
  calculateFulfillmentReadiness,
  calculateMarketLaunchScore,
} from "../src/lib/partners.ts";
import { catalogArtworks } from "../src/lib/marketplace.ts";

test("buildInvestorSnapshot aggregates catalog, outreach, finance, and partner readiness", () => {
  const snapshot = buildInvestorSnapshot();

  assert.ok(snapshot.marketLaunch.overall >= 0 && snapshot.marketLaunch.overall <= 100);
  assert.equal(snapshot.catalog.totalArtworks, catalogArtworks.length);
  assert.ok(snapshot.outreach.totalProspects > 0);
  assert.ok(snapshot.channelBudget.allocations.length >= 3);
  assert.ok(snapshot.monthlyGrossRevenue > 0);
  assert.equal(snapshot.pipelineStages.length, 7);
  assert.ok(snapshot.checkoutFunnel.stages.length === 5);
  assert.ok(snapshot.checkoutFunnel.overallReadiness >= 0);
  assert.equal(snapshot.launchCommandCenter.gates.length, 4);
  assert.equal(typeof snapshot.payoutLedger.totalEntries, "number");
  assert.equal(typeof snapshot.orderSummary.totalOrders, "number");
});

test("calculateFulfillmentReadiness scores configured POD partners", () => {
  const readiness = calculateFulfillmentReadiness();

  assert.ok(readiness.score >= 60);
  assert.ok(readiness.configuredPartners >= 2);
  assert.equal(readiness.recommendedPrimary, "Printful");
});

test("calculateAdCampaignReadiness blocks spend when creatives or consent are insufficient", () => {
  const readiness = calculateAdCampaignReadiness(catalogArtworks);

  assert.ok(readiness.platforms.length >= 3);
  assert.ok(readiness.mockupCoveragePercent > 0);
  assert.ok(readiness.blockers.length >= 0);
});

test("calculateMarketLaunchScore blends supply, demand, ops, and fulfillment", () => {
  const launch = calculateMarketLaunchScore();

  assert.ok(launch.overall > 0);
  assert.ok(launch.liveListings >= 5);
  assert.ok(launch.supplyScore > 0);
  assert.ok(launch.demandScore >= 0);
});
