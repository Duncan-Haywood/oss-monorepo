import assert from "node:assert/strict";
import test from "node:test";

import {
  allocateWeeklyChannelBudget,
  calculateCatalogSummary,
  calculateChannelScenario,
  calculateCreativeReadiness,
  calculateLaunchReadiness,
  calculatePrintEconomics,
  calculateRoomPreviewExperiment,
  compareArtistPayoutModels,
  catalogArtworks,
  generateAdCreativeConcepts,
} from "../src/lib/marketplace";

test("calculatePrintEconomics splits net profit 30/70 after fulfillment, payment, and AI costs", () => {
  const economics = calculatePrintEconomics({
    retailPrice: 100,
    fulfillmentCost: 30,
    paymentFeeRate: 0.03,
    aiComputeCost: 1,
  });

  assert.equal(economics.paymentFee, 3);
  assert.equal(economics.netProfit, 66);
  assert.equal(economics.artistShare, 19.8);
  assert.equal(economics.platformShare, 46.2);
  assert.equal(economics.marginPercent, 66);
});

test("calculateCatalogSummary aggregates sellable catalog health from shared artworks", () => {
  const summary = calculateCatalogSummary(catalogArtworks);

  assert.equal(summary.totalArtworks, catalogArtworks.length);
  assert.equal(summary.liveArtworks, 5);
  assert.equal(summary.proofQueue, 1);
  assert.equal(summary.averageReadinessScore, 83);
  assert.equal(summary.projectedMonthlyArtistPayout, 1559.43);
});

test("calculateLaunchReadiness rewards complete metadata, mockups, and print economics", () => {
  const readyArtwork = catalogArtworks.find((artwork) => artwork.slug === "midnight-coast");
  const blockedArtwork = catalogArtworks.find((artwork) => artwork.slug === "abstract-no-4");

  assert.ok(readyArtwork);
  assert.ok(blockedArtwork);
  assert.deepEqual(calculateLaunchReadiness(readyArtwork), {
    score: 100,
    label: "Launch-ready",
    blockers: [],
  });
  assert.deepEqual(calculateLaunchReadiness(blockedArtwork), {
    score: 40,
    label: "Needs work",
    blockers: ["Approve proof", "Add room mockups", "Improve margin"],
  });
});

test("calculateChannelScenario models CAC payback from lifetime platform gross", () => {
  const scenario = calculateChannelScenario({
    retailPrice: 85,
    fulfillmentCost: 28,
    monthlyOrders: 500,
    customerAcquisitionCost: 34,
    purchasesPerCustomer: 1.8,
  });

  assert.equal(scenario.platformGrossPerOrder, 37.87);
  assert.equal(scenario.artistPayoutPerOrder, 16.23);
  assert.equal(scenario.lifetimePlatformGross, 68.17);
  assert.equal(scenario.profitAfterCAC, 34.17);
  assert.equal(scenario.paybackOrders, 1);
  assert.equal(scenario.ltvToCacRatio, 2);
  assert.equal(scenario.monthlyMarketingSpend, 9444.44);
  assert.equal(scenario.monthlyContributionAfterCAC, 9490.56);
  assert.equal(scenario.monthlyArtistPayout, 8115);
});

test("calculateChannelScenario flags channels that need repeat purchases to break even", () => {
  const scenario = calculateChannelScenario({
    retailPrice: 65,
    fulfillmentCost: 18,
    monthlyOrders: 300,
    customerAcquisitionCost: 90,
    purchasesPerCustomer: 1.2,
  });

  assert.equal(scenario.platformGrossPerOrder, 31.29);
  assert.equal(scenario.lifetimePlatformGross, 37.55);
  assert.equal(scenario.profitAfterCAC, -52.45);
  assert.equal(scenario.paybackOrders, 3);
  assert.equal(scenario.ltvToCacRatio, 0.42);
  assert.equal(scenario.monthlyContributionAfterCAC, -13113);
});

test("calculateCreativeReadiness rewards proofed listings with SEO copy and room mockups", () => {
  const artwork = catalogArtworks.find((item) => item.slug === "midnight-coast");

  assert.ok(artwork);
  assert.deepEqual(calculateCreativeReadiness(artwork, { baselineCAC: 68 }), {
    score: 100,
    label: "Scale paid concepts",
    similarityRisk: "Low",
    predictedCacReductionPercent: 28,
    predictedCAC: 48.96,
    blockers: [],
  });
});

test("calculateCreativeReadiness blocks spend when proof, mockups, or margin are weak", () => {
  const artwork = catalogArtworks.find((item) => item.slug === "abstract-no-4");

  assert.ok(artwork);
  const readiness = calculateCreativeReadiness(artwork, { baselineCAC: 68 });

  assert.equal(readiness.score, 33);
  assert.equal(readiness.label, "Fix before spend");
  assert.equal(readiness.similarityRisk, "High");
  assert.deepEqual(readiness.blockers, [
    "Approve artist proof",
    "Generate room mockups",
    "Raise price or reduce POD cost",
  ]);
});

test("generateAdCreativeConcepts creates distinct demand concepts from catalog tags and payout math", () => {
  const artwork = catalogArtworks.find((item) => item.slug === "urban-geometry");

  assert.ok(artwork);
  const concepts = generateAdCreativeConcepts(artwork, "paid-social");

  assert.equal(concepts.length, 3);
  assert.deepEqual(
    concepts.map((concept) => concept.format),
    ["Room mockup carousel", "Artist payout proof", "Search-intent static"],
  );
  assert.match(concepts[1].message, /\$21\.10 artist payout/);
  assert.match(concepts[2].message, /urban geometry monochrome wall art/);
});

test("calculateRoomPreviewExperiment converts preview lift into lower effective CAC", () => {
  const artwork = catalogArtworks.find((item) => item.slug === "midnight-coast");

  assert.ok(artwork);
  const experiment = calculateRoomPreviewExperiment(artwork, {
    monthlyVisitors: 10000,
    baselineConversionRate: 2,
    baselineCAC: 68,
    previewEngagementRate: 30,
    conversionLiftPercent: 50,
    purchasesPerCustomer: 1.6,
  });

  assert.equal(experiment.baselineOrders, 200);
  assert.equal(experiment.projectedOrders, 230);
  assert.equal(experiment.incrementalOrders, 30);
  assert.equal(experiment.blendedConversionRate, 2.3);
  assert.equal(experiment.adjustedCAC, 59.13);
  assert.equal(experiment.channelScenario.profitAfterCAC, 1.46);
  assert.equal(experiment.monthlyIncrementalArtistPayout, 486.9);
});

test("calculateRoomPreviewExperiment blocks uplift when mockups are missing", () => {
  const artwork = catalogArtworks.find((item) => item.slug === "abstract-no-4");

  assert.ok(artwork);
  const experiment = calculateRoomPreviewExperiment(artwork, {
    monthlyVisitors: 10000,
    baselineConversionRate: 2,
    baselineCAC: 68,
    previewEngagementRate: 40,
    conversionLiftPercent: 80,
    purchasesPerCustomer: 1.6,
  });

  assert.equal(experiment.projectedOrders, 200);
  assert.equal(experiment.incrementalOrders, 0);
  assert.equal(experiment.adjustedCAC, 68);
  assert.deepEqual(experiment.blockers, ["Generate room mockups", "Approve artist proof"]);
});

test("allocateWeeklyChannelBudget caps spend and blocks channels below contribution guardrails", () => {
  const plan = allocateWeeklyChannelBudget({
    retailPrice: 85,
    fulfillmentCost: 28,
    totalWeeklyBudget: 4000,
    minLtvToCacRatio: 1.5,
    channels: [
      {
        id: "artist-loop",
        label: "Artist community loop",
        weeklyBudgetCap: 1200,
        baselineCAC: 12,
        purchasesPerCustomer: 1.4,
        previewLiftPercent: 0,
      },
      {
        id: "paid-social",
        label: "Paid social prospecting",
        weeklyBudgetCap: 2000,
        baselineCAC: 90,
        purchasesPerCustomer: 1.3,
        previewLiftPercent: 0,
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

  const artistLoop = plan.allocations.find((channel) => channel.id === "artist-loop");
  const paidSocial = plan.allocations.find((channel) => channel.id === "paid-social");
  const designerTrade = plan.allocations.find((channel) => channel.id === "designer-trade");

  assert.equal(plan.allocatedBudget, 3000);
  assert.equal(plan.unallocatedBudget, 1000);
  assert.equal(artistLoop?.recommendedWeeklyBudget, 1200);
  assert.equal(designerTrade?.recommendedWeeklyBudget, 1800);
  assert.equal(paidSocial?.recommendedWeeklyBudget, 0);
  assert.equal(paidSocial?.eligible, false);
  assert.deepEqual(paidSocial?.blockers, ["LTV:CAC below 1.5x", "Negative contribution after CAC"]);
});

test("allocateWeeklyChannelBudget lets room-preview lift rescue an otherwise marginal paid channel", () => {
  const plan = allocateWeeklyChannelBudget({
    retailPrice: 85,
    fulfillmentCost: 28,
    totalWeeklyBudget: 2000,
    minLtvToCacRatio: 1.5,
    channels: [
      {
        id: "paid-social-preview",
        label: "Paid social with room preview",
        weeklyBudgetCap: 2000,
        baselineCAC: 68,
        purchasesPerCustomer: 1.6,
        previewLiftPercent: 50,
      },
      {
        id: "search-flat-listing",
        label: "Search flat listing",
        weeklyBudgetCap: 2000,
        baselineCAC: 42,
        purchasesPerCustomer: 1.5,
        previewLiftPercent: 0,
      },
    ],
  });

  const previewChannel = plan.allocations.find((channel) => channel.id === "paid-social-preview");
  const flatListingChannel = plan.allocations.find((channel) => channel.id === "search-flat-listing");

  assert.equal(plan.recommendedChannelId, "paid-social-preview");
  assert.equal(previewChannel?.adjustedCAC, 34);
  assert.equal(previewChannel?.recommendedWeeklyBudget, 2000);
  assert.equal(flatListingChannel?.recommendedWeeklyBudget, 0);
  assert.equal(flatListingChannel?.eligible, false);
});

test("compareArtistPayoutModels shows Print Atelier payout advantage against POD marketplace royalties", () => {
  const comparison = compareArtistPayoutModels({
    retailPrice: 100,
    fulfillmentCost: 30,
    monthlyOrders: 25,
    paymentFeeRate: 0.03,
    aiComputeCost: 1,
  });

  const society6 = comparison.models.find((model) => model.id === "society6-wall-art");
  const redbubbleStandard = comparison.models.find((model) => model.id === "redbubble-standard");

  assert.equal(comparison.printAtelier.artistPayoutPerOrder, 19.8);
  assert.equal(comparison.printAtelier.monthlyArtistPayout, 495);
  assert.equal(society6?.artistPayoutPerOrder, 10);
  assert.equal(redbubbleStandard?.artistPayoutPerOrder, 10);
  assert.equal(comparison.bestPodAlternative?.id, "redbubble-premium");
  assert.equal(comparison.podAdvantagePerOrder, 3.8);
  assert.equal(comparison.recommendation, "Lead with transparent payout proof");
});

test("compareArtistPayoutModels flags weak Print Atelier economics before artist outreach", () => {
  const comparison = compareArtistPayoutModels({
    retailPrice: 55,
    fulfillmentCost: 40,
    monthlyOrders: 12,
    aiComputeCost: 1.35,
  });

  assert.equal(comparison.printAtelier.artistPayoutPerOrder, 3.6);
  assert.equal(comparison.bestPodAlternative?.id, "redbubble-premium");
  assert.equal(comparison.podAdvantagePerOrder, -5.2);
  assert.deepEqual(comparison.blockers, ["Raise price or reduce POD cost before promising payout advantage"]);
  assert.equal(comparison.recommendation, "Fix economics before outreach");
});
