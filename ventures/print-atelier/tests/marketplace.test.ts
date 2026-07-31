import assert from "node:assert/strict";
import test from "node:test";

import {
  allocateWeeklyChannelBudget,
  buildListingConsentGate,
  buildListingReleaseDecisions,
  buildPayoutExceptionQueue,
  calculateCatalogSummary,
  calculateChannelScenario,
  calculateCreativeReadiness,
  calculateLaunchReadiness,
  calculatePrintEconomics,
  calculateRoomPreviewExperiment,
  compareArtistPayoutModels,
  optimizePayoutSensitivityPriceFloor,
  recommendPodCostOptimization,
  calculateB2bTradeProgramTierDiscount,
  calculateChannelContributionMarginDashboard,
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

test("buildPayoutExceptionQueue prioritizes listings where POD cost breaks the payout promise", () => {
  const queue = buildPayoutExceptionQueue(catalogArtworks, {
    monthlyOrders: 12,
    minimumArtistPayoutPerOrder: 8,
    targetPodAdvantagePerOrder: 0,
  });

  assert.equal(queue.length, 1);
  assert.equal(queue[0].artwork.slug, "abstract-no-4");
  assert.equal(queue[0].severity, "critical");
  assert.equal(queue[0].currentArtistPayoutPerOrder, 3.9);
  assert.equal(queue[0].podAdvantagePerOrder, -4.9);
  assert.equal(queue[0].suggestedRetailPrice, 93);
  assert.deepEqual(queue[0].blockers, [
    "Trails Redbubble Premium by $4.90/order",
    "Artist payout below $8.00/order floor",
    "Proof is not approved",
    "Room mockups missing",
  ]);
  assert.equal("trustMessage" in queue[0], false);
  assert.match(queue[0].holdMessage, /Do not use the 30% payout promise/);
  assert.match(queue[0].nextAction, /Raise retail price to \$93/);
});

test("buildPayoutExceptionQueue creates review items when payout advantage is positive but thin", () => {
  const queue = buildPayoutExceptionQueue(catalogArtworks, {
    monthlyOrders: 20,
    targetPodAdvantagePerOrder: 4,
  });
  const springBloom = queue.find((item) => item.artwork.slug === "spring-bloom");

  assert.ok(springBloom);
  assert.equal(springBloom.severity, "review");
  assert.equal(springBloom.podAdvantagePerOrder, 3.01);
  assert.equal(springBloom.suggestedRetailPrice, 73);
  assert.match(
    springBloom.holdMessage,
    /Hold Spring Bloom until payout advantage reaches \$4\.00\/order target/,
  );
});

test("buildListingReleaseDecisions marks safe listings as ready with artist-facing payout proof", () => {
  const releaseQueue = buildListingReleaseDecisions(catalogArtworks, {
    monthlyOrders: 12,
    minimumArtistPayoutPerOrder: 8,
    targetPodAdvantagePerOrder: 0,
  });
  const midnightCoast = releaseQueue.decisions.find((decision) => decision.artwork.slug === "midnight-coast");

  assert.equal(releaseQueue.releaseReadyCount, 5);
  assert.equal(releaseQueue.holdCount, 1);
  assert.equal(releaseQueue.overrideReviewCount, 0);
  assert.ok(midnightCoast);
  assert.equal(midnightCoast.releaseStatus, "release-ready");
  assert.equal(midnightCoast.owner, "Growth");
  assert.equal(midnightCoast.canUsePayoutPromise, true);
  assert.match(midnightCoast.artistFacingCopy, /\$16\.23\/print/);
  assert.match(midnightCoast.artistFacingCopy, /beats Redbubble Premium by \$2\.63\/print/);
});

test("buildListingReleaseDecisions keeps unsafe listings on hold without leaking payout-promise copy", () => {
  const releaseQueue = buildListingReleaseDecisions(catalogArtworks, {
    monthlyOrders: 12,
    minimumArtistPayoutPerOrder: 8,
    targetPodAdvantagePerOrder: 0,
  });
  const abstractNo4 = releaseQueue.decisions.find((decision) => decision.artwork.slug === "abstract-no-4");

  assert.ok(abstractNo4);
  assert.equal(abstractNo4.releaseStatus, "hold");
  assert.equal(abstractNo4.owner, "Ops");
  assert.equal(abstractNo4.canUsePayoutPromise, false);
  assert.equal(abstractNo4.suggestedRetailPrice, 93);
  assert.deepEqual(abstractNo4.overrideReasons, []);
  assert.match(abstractNo4.operatorAction, /Raise retail price to \$93/);
  assert.doesNotMatch(abstractNo4.artistFacingCopy, /30% payout promise/);
});

test("buildListingReleaseDecisions separates finance override review from operational holds", () => {
  const releaseQueue = buildListingReleaseDecisions(catalogArtworks, {
    monthlyOrders: 20,
    targetPodAdvantagePerOrder: 4,
  });
  const springBloom = releaseQueue.decisions.find((decision) => decision.artwork.slug === "spring-bloom");

  assert.equal(releaseQueue.releaseReadyCount, 0);
  assert.equal(releaseQueue.overrideReviewCount, 5);
  assert.ok(springBloom);
  assert.equal(springBloom.releaseStatus, "override-review");
  assert.equal(springBloom.owner, "Finance");
  assert.equal(springBloom.canUsePayoutPromise, false);
  assert.equal(springBloom.suggestedRetailPrice, 73);
  assert.deepEqual(springBloom.overrideReasons, [
    "Finance may approve lower POD advantage for strategic artist or cohort test",
  ]);
});

test("buildListingConsentGate blocks release channels until license, ads, AI room scenes, and payout acknowledgement are recorded", () => {
  const consentGate = buildListingConsentGate(catalogArtworks, [
    {
      artworkSlug: "midnight-coast",
      podLicenseAccepted: true,
      paidAdRightsAccepted: true,
      aiRoomSceneAccepted: true,
      payoutAcknowledged: true,
    },
    {
      artworkSlug: "urban-geometry",
      podLicenseAccepted: true,
      paidAdRightsAccepted: false,
      aiRoomSceneAccepted: false,
      payoutAcknowledged: true,
    },
  ]);
  const midnightCoast = consentGate.items.find((item) => item.artwork.slug === "midnight-coast");
  const urbanGeometry = consentGate.items.find((item) => item.artwork.slug === "urban-geometry");
  const abstractNo4 = consentGate.items.find((item) => item.artwork.slug === "abstract-no-4");

  assert.equal(consentGate.clearedCount, 1);
  assert.equal(consentGate.blockedCount, 5);
  assert.equal(consentGate.missingConsentCount, 4);
  assert.ok(midnightCoast);
  assert.equal(midnightCoast.consentStatus, "cleared");
  assert.deepEqual(midnightCoast.allowedChannels, ["storefront", "artist-outreach", "paid-ads", "ai-room-preview"]);
  assert.ok(urbanGeometry);
  assert.equal(urbanGeometry.consentStatus, "missing-consent");
  assert.deepEqual(urbanGeometry.allowedChannels, ["storefront", "artist-outreach"]);
  assert.deepEqual(urbanGeometry.missingConsents, ["Paid advertising rights", "AI room-scene use"]);
  assert.match(urbanGeometry.operatorAction, /Collect paid advertising rights and AI room-scene use/);
  assert.ok(abstractNo4);
  assert.equal(abstractNo4.consentStatus, "release-blocked");
  assert.deepEqual(abstractNo4.allowedChannels, []);
  assert.match(abstractNo4.operatorAction, /Resolve release hold before collecting consent/);
});

test("optimizePayoutSensitivityPriceFloor calculates optimal retail floor for artist trust and CAC recovery", () => {
  const result = optimizePayoutSensitivityPriceFloor({
    fulfillmentCost: 28,
    targetArtistPayout: 20,
    customerAcquisitionCost: 15,
    paymentFeeRate: 0.03,
    aiComputeCost: 0.5,
  });

  assert.equal(result.priceFloorForArtistTrust, 98.11);
  assert.equal(result.priceFloorForPlatformContribution, 51.47);
  assert.equal(result.recommendedRetailPriceFloor, 99);
  assert.equal(result.status, "optimal");
  assert.ok(result.platformContributionPostCac > 5);
  assert.equal(result.artistPayoutAtFloor, 20.26);
  assert.match(result.recommendations[0], /Strong economics at \$99 retail floor/);
  assert.match(result.recommendations[1], /Artist trust target \(\$20\.00\) drives the retail floor requirement/);
});

test("buildListingReleaseDecisions flags SLA warnings and breaches based on aging days", () => {
  const releaseQueue = buildListingReleaseDecisions(catalogArtworks, {
    monthlyOrders: 20,
    targetPodAdvantagePerOrder: 4,
    agingDaysMap: {
      "spring-bloom": 6,
      "desert-sun": 3,
      "abstract-no-4": 8,
    },
  });

  const springBloom = releaseQueue.decisions.find((d) => d.artwork.slug === "spring-bloom");
  const desertSun = releaseQueue.decisions.find((d) => d.artwork.slug === "desert-sun");
  const abstractNo4 = releaseQueue.decisions.find((d) => d.artwork.slug === "abstract-no-4");

  assert.ok(springBloom);
  assert.equal(springBloom.slaStatus, "breached");
  assert.match(springBloom.operatorAction, /\[SLA BREACHED 6d\]/);

  assert.ok(desertSun);
  assert.equal(desertSun.slaStatus, "warning");
  assert.match(desertSun.operatorAction, /\[SLA WARNING 3d\]/);

  assert.ok(abstractNo4);
  assert.equal(abstractNo4.slaStatus, "breached");
  assert.match(abstractNo4.operatorAction, /\[SLA BREACHED 8d\]/);

  assert.equal(releaseQueue.agingWarningCount, 1);
  assert.equal(releaseQueue.agingBreachedCount, 2);
  assert.equal(releaseQueue.oldestUnresolvedDays, 8);
});

test("recommendPodCostOptimization suggests switching to lower-cost POD provider when available", () => {
  const artwork = catalogArtworks.find((item) => item.slug === "desert-sun")!;
  const result = recommendPodCostOptimization({
    artwork,
    alternativeProviders: [
      { providerName: "ProPrint Global", fulfillmentCost: 22 },
      { providerName: "EcoArt Labs", fulfillmentCost: 26 },
    ],
    targetArtistPayout: 20,
  });

  assert.equal(result.currentFulfillmentCost, 32);
  assert.ok(result.recommendedProvider);
  assert.equal(result.recommendedProvider.providerName, "ProPrint Global");
  assert.equal(result.costSavingsPerOrder, 10);
  assert.equal(result.canAvoidPriceRaise, true);
  assert.match(result.recommendationCopy, /Switch POD fulfillment for Desert Sun to ProPrint Global/);
});

test("calculateB2bTradeProgramTierDiscount calculates wholesale discount, artist payout, and platform net margin", () => {
  const result = calculateB2bTradeProgramTierDiscount({
    tier: "Silver",
    orderRetailTotal: 1000,
    fulfillmentCostTotal: 250,
  });

  assert.equal(result.tier, "Silver");
  assert.equal(result.discountPercent, 25);
  assert.equal(result.designerSavings, 250);
  assert.equal(result.wholesaleNetPrice, 750);
  assert.equal(result.fulfillmentCostTotal, 250);
  assert.equal(result.paymentProcessingFee, 22.5);
  assert.ok(result.isEconomicallyViable);
  assert.ok(result.artistPayoutTotal > 100);
  assert.ok(result.platformNetProfit > 200);
  assert.match(result.operatorGuidance, /Silver Trade order \(\$750\.00\) yields \$143\.10 artist payout/);
});

test("calculateChannelContributionMarginDashboard calculates net contribution and provides channel recommendations", () => {
  const summaries = calculateChannelContributionMarginDashboard([
    {
      channelId: "instagram_ads",
      channelName: "Instagram Ads",
      monthlySpend: 500,
      ordersCount: 40,
      averageOrderValue: 90,
      averageFulfillmentCostPerOrder: 30,
      roomPreviewUpliftPercent: 10,
    },
    {
      channelId: "unprofitable_ads",
      channelName: "Unprofitable Ads",
      monthlySpend: 1000,
      ordersCount: 10,
      averageOrderValue: 50,
      averageFulfillmentCostPerOrder: 35,
    },
  ]);

  assert.equal(summaries.length, 2);

  const insta = summaries[0];
  assert.equal(insta.channelId, "instagram_ads");
  assert.equal(insta.status, "high-margin");
  assert.ok(insta.totalContributionMargin > 1000);
  assert.match(insta.recommendation, /Scale spend on Instagram Ads/);

  const unprof = summaries[1];
  assert.equal(unprof.channelId, "unprofitable_ads");
  assert.equal(unprof.status, "unprofitable");
  assert.ok(unprof.totalContributionMargin < 0);
  assert.match(unprof.recommendation, /Optimize or pause spend on Unprofitable Ads/);
});

test("allocateWeeklyChannelBudget applies actualChannelLiftMap over baseline preview lift", () => {
  const defaultResult = allocateWeeklyChannelBudget({
    totalWeeklyBudget: 500,
  });
  const customLiftResult = allocateWeeklyChannelBudget({
    totalWeeklyBudget: 500,
    actualChannelLiftMap: {
      meta_ads: 45,
    },
  });

  const defaultMeta = defaultResult.allocations.find((a) => a.id === "meta_ads");
  const customMeta = customLiftResult.allocations.find((a) => a.id === "meta_ads");

  assert.ok(defaultMeta);
  assert.ok(customMeta);
  assert.equal(customMeta.actualLiftApplied, true);
  assert.equal(customMeta.previewLiftPercent, 45);
  assert.ok(customMeta.adjustedCAC < defaultMeta.adjustedCAC);
});



