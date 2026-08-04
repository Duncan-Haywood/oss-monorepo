import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateChannelContributionMargin,
  summarizePortfolioContributionMargin,
  ChannelMarginInput,
} from "../src/lib/contribution-margin.ts";

test("calculateChannelContributionMargin computes net contribution, margin %, and ROAS", () => {
  const input: ChannelMarginInput = {
    channelId: "meta_ads",
    channelName: "Meta Ads (Instagram / FB)",
    orderCount: 20,
    grossRevenueUsd: 1800,
    podFulfillmentCostUsd: 440,
    artistPayoutUsd: 408, // 30% of (1800 - 440 = 1360) -> 408
    adSpendUsd: 350,
  };

  const perf = calculateChannelContributionMargin(input);

  // Net contribution = 1800 - 440 - 408 - 350 = 602
  assert.equal(perf.netContributionUsd, 602);
  // Margin % = 602 / 1800 * 100 = 33.44%
  assert.equal(perf.contributionMarginPct, 33.44);
  // ROAS = 1800 / 350 = 5.14
  assert.equal(perf.roas, 5.14);
  assert.equal(perf.actualCacUsd, 17.5); // 350 / 20
  assert.equal(perf.breakEvenCacUsd, 47.6); // (1800 - 440 - 408) / 20 = 47.6
  assert.equal(perf.status, "scale");
});

test("calculateChannelContributionMargin flags channel needing review when net contribution is negative", () => {
  const input: ChannelMarginInput = {
    channelId: "google_search",
    channelName: "Google Search Ads",
    orderCount: 5,
    grossRevenueUsd: 450,
    podFulfillmentCostUsd: 110,
    artistPayoutUsd: 102,
    adSpendUsd: 300, // Spend $300 -> Net = 450 - 110 - 102 - 300 = -62
  };

  const perf = calculateChannelContributionMargin(input);

  assert.equal(perf.netContributionUsd, -62);
  assert.equal(perf.status, "review");
  assert.match(perf.recommendation, /Negative net contribution/i);
});

test("summarizePortfolioContributionMargin aggregates multiple channels accurately", () => {
  const sampleChannels: ChannelMarginInput[] = [
    {
      channelId: "b2b_trade",
      channelName: "B2B Trade Program",
      orderCount: 15,
      grossRevenueUsd: 4200,
      podFulfillmentCostUsd: 900,
      artistPayoutUsd: 990,
      adSpendUsd: 200,
    },
    {
      channelId: "direct_outreach",
      channelName: "Direct Artist/Buyer Outreach",
      orderCount: 10,
      grossRevenueUsd: 900,
      podFulfillmentCostUsd: 220,
      artistPayoutUsd: 204,
      adSpendUsd: 50,
    },
    {
      channelId: "pinterest_ads",
      channelName: "Pinterest Ads",
      orderCount: 2,
      grossRevenueUsd: 180,
      podFulfillmentCostUsd: 44,
      artistPayoutUsd: 40.8,
      adSpendUsd: 150, // Unprofitable
    },
  ];

  const summary = summarizePortfolioContributionMargin(sampleChannels);

  assert.equal(summary.totalOrders, 27);
  assert.equal(summary.totalGrossRevenueUsd, 5280);
  assert.equal(summary.topPerformingChannel, "B2B Trade Program");
  assert.deepEqual(summary.channelsNeedingReview, ["Pinterest Ads"]);
  assert.equal(summary.channels.length, 3);
});
