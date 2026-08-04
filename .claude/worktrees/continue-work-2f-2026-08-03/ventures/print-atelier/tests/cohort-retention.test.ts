import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calculateChannelCohortRetention,
  summarizePortfolioCohortRetention,
} from "../src/lib/cohort-retention.ts";

test("calculateChannelCohortRetention computes LTV curve and payback period correctly", () => {
  const channelMetrics = calculateChannelCohortRetention({
    channelId: "meta_ads",
    channelName: "Meta Ads",
    initialCustomers: 100,
    initialAdSpendUsd: 2000, // CAC = $20.00
    averageFirstOrderValueUsd: 120,
    grossMarginPct: 0.45, // First order gross profit = $54.00
    monthlyRepeatOrderRate: 0.05,
  });

  assert.equal(channelMetrics.cacUsd, 20.0);
  assert.ok(channelMetrics.ltv30d >= 42.0);
  assert.ok(channelMetrics.ltv365d > channelMetrics.ltv30d);
  assert.ok(channelMetrics.ltvToCacRatio365d > 1.5);
  assert.ok(channelMetrics.paybackPeriodDays <= 30);
  assert.equal(channelMetrics.status, "high_margin_scale");
});

test("calculateChannelCohortRetention flags unprofitable acquisition channels", () => {
  const channelMetrics = calculateChannelCohortRetention({
    channelId: "google_search",
    channelName: "Google Search",
    initialCustomers: 20,
    initialAdSpendUsd: 2000, // CAC = $100.00
    averageFirstOrderValueUsd: 80,
    grossMarginPct: 0.30, // First order profit = $24.00
    monthlyRepeatOrderRate: 0.02,
  });

  assert.equal(channelMetrics.cacUsd, 100.0);
  assert.ok(channelMetrics.ltvToCacRatio365d < 1.0);
  assert.equal(channelMetrics.status, "unprofitable");
  assert.ok(channelMetrics.recommendation.includes("Pause spend"));
});

test("summarizePortfolioCohortRetention aggregates cohort performance across channels", () => {
  const summary = summarizePortfolioCohortRetention([
    {
      channelId: "b2b_trade",
      channelName: "B2B Trade",
      initialCustomers: 50,
      initialAdSpendUsd: 1000, // CAC = $20
      averageFirstOrderValueUsd: 350,
      grossMarginPct: 0.40,
      monthlyRepeatOrderRate: 0.12,
    },
    {
      channelId: "pinterest_ads",
      channelName: "Pinterest Ads",
      initialCustomers: 40,
      initialAdSpendUsd: 1600, // CAC = $40
      averageFirstOrderValueUsd: 90,
      grossMarginPct: 0.35,
      monthlyRepeatOrderRate: 0.03,
    },
  ]);

  assert.equal(summary.totalInitialCustomers, 90);
  assert.equal(summary.totalInitialSpendUsd, 2600);
  assert.equal(summary.topScalingChannel, "B2B Trade");
  assert.ok(summary.blendedLtv365d > 100);
});
