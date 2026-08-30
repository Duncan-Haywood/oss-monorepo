import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateBrandOrder,
  calculateRetailerOrder,
  compareBrandScenarios,
  compareFairePayNow,
  compareFairePromoted,
  compareFaireReturn,
  compareOpenHouse,
  comparePayoutSpeeds,
  comparePayoutSpeedsAfterFloat,
  compareRetailerLifetime,
  faireReturnNote,
  FAIRE_RETURN_DEFAULTS,
  payNowNote,
  PAY_NOW_DEFAULTS,
  openHouseNote,
  openHouseSummary,
  OPEN_HOUSE_DEFAULTS,
  PROMOTED_DEFAULTS,
  promotedNote,
  retailPriceForMargin,
  summarizePayoutFloat,
  wholesaleForMargin,
} from "./calc.mjs";

const naReorder = {
  unitWholesale: 20,
  quantity: 10,
  unitCogs: 8,
  shippingReimbursement: 15,
  shippingCost: 15,
  region: "north_america",
  payout: "day_60",
};

test("matches Faire's published NA payout formula on a reorder", () => {
  // $200 subtotal, 15% commission, 1.9% + $0.30 processing, $15 shipping back.
  const result = calculateBrandOrder(naReorder, "marketplace_reorder");
  assert.equal(result.orderSubtotal, 200);
  assert.equal(result.fees.commission, 30);
  assert.equal(result.fees.firstOrder, 0);
  assert.equal(result.fees.processing, 4.1);
  assert.equal(result.payoutAmount, 180.9);
  assert.equal(result.profit, 85.9);
});

test("adds the $10 North America new-customer fee only on a first marketplace order", () => {
  const first = calculateBrandOrder(naReorder, "marketplace_first");
  const reorder = calculateBrandOrder(naReorder, "marketplace_reorder");
  assert.equal(first.fees.firstOrder, 10);
  assert.equal(reorder.fees.firstOrder, 0);
  assert.equal(reorder.profit - first.profit, 10);
});

test("outside-NA first orders use the extra 10% instead of a flat $10", () => {
  const result = calculateBrandOrder({ ...naReorder, region: "outside_na" }, "marketplace_first");
  assert.equal(result.fees.commission, 30);
  assert.equal(result.fees.firstOrder, 20);
  assert.equal(result.commissionRate, 15);
  assert.equal(result.firstOrderExtraRate, 10);
});

test("Faire Direct zeros commission and the new-customer fee but still processes payment", () => {
  const result = calculateBrandOrder(naReorder, "faire_direct");
  assert.equal(result.fees.commission, 0);
  assert.equal(result.fees.firstOrder, 0);
  assert.equal(result.fees.processing, 4.1);
  assert.equal(result.profit, 115.9);
});

test("own invoice zeros Faire fees so a brand can compare keeping the account off-platform", () => {
  const result = calculateBrandOrder(naReorder, "own_invoice");
  assert.equal(result.feeTotal, 0);
  assert.equal(result.payoutAmount, 215);
  assert.equal(result.profit, 120);
});

test("brand-funded promotions come off the commission subtotal, matching Faire's wording", () => {
  const result = calculateBrandOrder({ ...naReorder, openingDiscountRate: 20 }, "marketplace_reorder");
  assert.equal(result.orderSubtotal, 160);
  assert.equal(result.fees.commission, 24);
  assert.equal(result.fees.processing, 3.34);
});

test("ranks first-order, reorder, Direct, and own invoice on the same order", () => {
  const comparison = compareBrandScenarios(naReorder);
  assert.equal(comparison.results.length, 4);
  assert.equal(comparison.best.id, "own_invoice");
  const first = comparison.results.find((row) => row.scenario === "marketplace_first");
  assert.ok(first.gapVsBest > 0);
  assert.equal(first.isBest, false);
});

test("payout-speed comparison only changes the processing line", () => {
  const speeds = comparePayoutSpeeds(naReorder);
  assert.equal(speeds.length, 3);
  const nextDay = speeds.find((row) => row.id === "next_day");
  const slow = speeds.find((row) => row.id === "day_60");
  assert.equal(nextDay.fees.commission, slow.fees.commission);
  assert.ok(nextDay.fees.processing > slow.fees.processing);
  assert.ok(slow.profit > nextDay.profit);
});

test("next-day payout beats waiting 60 days once 24% money eats the processing spread", () => {
  const comparison = comparePayoutSpeedsAfterFloat(naReorder, { annualCarryRate: 24 });
  const next = comparison.speeds.find((row) => row.id === "next_day");
  const mid = comparison.speeds.find((row) => row.id === "day_30");
  const slow = comparison.speeds.find((row) => row.id === "day_60");
  assert.equal(next.label, "Next-day payout");
  assert.equal(slow.label, "60-day payout");
  assert.equal(comparison.scenarioId, "marketplace_first");
  assert.ok(Math.abs(next.payoutAmount - 167.7) < 1e-9);
  assert.ok(Math.abs(next.profit - 72.7) < 1e-9);
  assert.ok(Math.abs(slow.profit - 75.9) < 1e-9);
  assert.ok(Math.abs(comparison.processingSpread - 3.2) < 1e-9);
  assert.ok(Math.abs(next.carryingCost - 167.7 * 0.24 * 1 / 365) < 1e-12);
  assert.ok(Math.abs(mid.carryingCost - 167.7 * 0.24 * 30 / 365) < 1e-12);
  assert.ok(Math.abs(slow.carryingCost - 167.7 * 0.24 * 60 / 365) < 1e-12);
  assert.ok(comparison.nextDayBeatsSlow);
  assert.equal(comparison.best.id, "next_day");
  assert.ok(comparison.nextDayPremium > 3);
  assert.ok(comparison.breakEvenAnnualRate > 11 && comparison.breakEvenAnnualRate < 12);
  const summary = summarizePayoutFloat(comparison);
  assert.match(summary, /\$72\.59/);
  assert.match(summary, /\$69\.28/);
  assert.match(summary, /behind/);
});

test("cheap 6% capital still leaves waiting 60 days ahead of next-day", () => {
  const comparison = comparePayoutSpeedsAfterFloat(naReorder, { annualCarryRate: 6 });
  assert.equal(comparison.nextDayBeatsSlow, false);
  assert.equal(comparison.best.id, "day_60");
  assert.ok(comparison.nextDayPremium < 0);
  const summary = summarizePayoutFloat(comparison);
  assert.match(summary, /covers the wait/);
  assert.match(summary, /\$74\.25/);
});

test("zero carrying cost keeps the fee-only ranking: 60-day still wins", () => {
  const comparison = comparePayoutSpeedsAfterFloat(naReorder, { annualCarryRate: 0 });
  const slow = comparison.speeds.find((row) => row.id === "day_60");
  assert.equal(slow.carryingCost, 0);
  assert.equal(comparison.best.id, "day_60");
  assert.equal(comparison.nextDayBeatsSlow, false);
});

test("rejects a nonsense carrying-cost rate", () => {
  assert.throws(() => comparePayoutSpeedsAfterFloat(naReorder, { annualCarryRate: -1 }), /non-negative/);
  assert.throws(() => comparePayoutSpeedsAfterFloat(naReorder, { annualCarryRate: 1000 }), /below 1000/);
});

test("finds the wholesale unit price that hits a target margin on a first order", () => {
  const price = wholesaleForMargin(naReorder, 40, "marketplace_first");
  const result = calculateBrandOrder({ ...naReorder, unitWholesale: price }, "marketplace_first");
  assert.ok(Math.abs(result.margin - 40) < 1e-9);
});

test("rejects impossible target margins", () => {
  assert.throws(() => wholesaleForMargin({ ...naReorder, commissionRate: 50, paymentRate: 40 }, 15), /not possible/);
});

test("rejects negative or non-numeric brand inputs", () => {
  assert.throws(() => calculateBrandOrder({ unitWholesale: -1 }));
  assert.throws(() => calculateBrandOrder({ unitWholesale: 20, quantity: 1.5 }));
  assert.throws(() => calculateBrandOrder({ unitWholesale: "nope" }));
});

test("retailer landed cost treats opening-order discount and unsold units as cash already spent", () => {
  const result = calculateRetailerOrder({
    unitWholesale: 20,
    quantity: 10,
    unitsSold: 8,
    openingDiscountRate: 20,
    shippingPaid: 12,
    unitRetail: 48,
    storePaymentRate: 2.9,
    storePaymentFixed: 0.3,
    otherCost: 0,
  });
  assert.equal(result.invoiceMerchandise, 160);
  assert.equal(result.landedCost, 172);
  assert.equal(result.retailRevenue, 384);
  assert.equal(result.unsoldUnits, 2);
  assert.ok(result.profit < result.retailRevenue - result.invoiceMerchandise);
});

test("finds the retail price that hits a target margin after store processing", () => {
  const input = {
    unitWholesale: 20,
    quantity: 10,
    unitsSold: 10,
    shippingPaid: 10,
    storePaymentRate: 2.9,
    storePaymentFixed: 0.3,
  };
  const price = retailPriceForMargin(input, 50);
  const result = calculateRetailerOrder({ ...input, unitRetail: price });
  assert.ok(Math.abs(result.margin - 50) < 1e-9);
});

test("lifetime view amortizes the first-order fee across expected reorders", () => {
  const life = compareRetailerLifetime(naReorder, 2);
  assert.equal(life.orders, 3);
  assert.equal(life.amortizedFirstOrderFee, 10 / 3);
  const marketplace = life.paths.find((row) => row.label.startsWith("Marketplace"));
  const direct = life.paths.find((row) => row.label.startsWith("Faire Direct"));
  const own = life.paths.find((row) => row.label.startsWith("Own invoice"));
  assert.equal(marketplace.profit, 75.9 + 85.9 * 2);
  assert.equal(direct.profit, 115.9 * 3);
  assert.equal(own.profit, 120 * 3);
  assert.equal(life.best.label, "Own invoice every order");
  assert.equal(life.reordersUntilPositive, 0);
});

test("counts how many reorders recover a loss-making first marketplace order", () => {
  // Reorder profit is first-order profit plus the $10 fee, so a $16 COGS
  // loses on the opening order and clears a few dollars on each reorder.
  const tight = { ...naReorder, unitCogs: 16 };
  const life = compareRetailerLifetime(tight, 0);
  assert.ok(life.first.profit < 0);
  assert.ok(life.reorder.profit > 0);
  assert.equal(life.reordersUntilPositive, Math.ceil(-life.first.profit / life.reorder.profit));
  const recovered = compareRetailerLifetime(tight, life.reordersUntilPositive);
  const marketplace = recovered.paths.find((row) => row.label.startsWith("Marketplace"));
  assert.ok(marketplace.profit >= 0);
});

test("rejects a fractional expected-reorder count", () => {
  assert.throws(() => compareRetailerLifetime(naReorder, 1.5), /whole number/);
});

test("compareOpenHouse shows a 20% event discount can eat the waived commission", () => {
  const comparison = compareOpenHouse(naReorder);
  const everyday = comparison.rows.find((row) => row.id === "everyday");
  const event = comparison.rows.find((row) => row.id === "open_house");
  const same = comparison.rows.find((row) => row.id === "open_house_same_list");
  assert.equal(everyday.profit, 75.9);
  assert.equal(everyday.commissionRate, 15);
  assert.equal(event.discountRate, 20);
  assert.equal(event.commissionRate, 0);
  assert.ok(event.profit < everyday.profit);
  assert.ok(Math.abs(event.profit - 66.66) < 1e-9);
  assert.equal(same.discountRate, 0);
  assert.equal(same.commissionRate, 0);
  assert.ok(same.profit > everyday.profit);
  assert.ok(Math.abs(same.profit - 105.9) < 1e-9);
  assert.equal(comparison.bestPerOrder.id, "open_house_same_list");
  assert.equal(comparison.extraRetailers, 2);
  assert.equal(event.retailers, 3);
  assert.ok(comparison.pileExtraVsEveryday > 0);
  assert.equal(comparison.bestPile.id, "open_house_same_list");
  assert.ok(comparison.discountCeiling > 15 && comparison.discountCeiling < 16);
  assert.equal(comparison.retailersToMatchEveryday, 2);
});

test("compareOpenHouse extra retailers flip a losing per-order event discount", () => {
  const comparison = compareOpenHouse(naReorder);
  const event = comparison.rows.find((row) => row.id === "open_house");
  const everyday = comparison.rows.find((row) => row.id === "everyday");
  assert.ok(event.profit < everyday.profit);
  assert.ok(event.pileProfit > everyday.pileProfit);
  const none = compareOpenHouse({ ...naReorder, openHouseExtraRetailers: 0 });
  const noneEvent = none.rows.find((row) => row.id === "open_house");
  assert.ok(noneEvent.pileProfit < none.rows.find((row) => row.id === "everyday").pileProfit);
  assert.equal(none.bestPile.id, "open_house_same_list");
});

test("compareOpenHouse everyday 15% opening makes the 20% event path win per order", () => {
  const comparison = compareOpenHouse({ ...naReorder, openingDiscountRate: 15 });
  const everyday = comparison.rows.find((row) => row.id === "everyday");
  const event = comparison.rows.find((row) => row.id === "open_house");
  assert.ok(event.profit > everyday.profit);
  assert.equal(comparison.bestPerOrder.id, "open_house_same_list");
});

test("openHouseNote names the default leak, ceiling, and pile flip", () => {
  const comparison = compareOpenHouse(naReorder);
  const text = openHouseNote(comparison);
  assert.equal(text, comparison.summary);
  assert.equal(text, openHouseSummary(comparison));
  assert.match(text, /\$75\.90/);
  assert.match(text, /\$66\.66/);
  assert.match(text, /15\.3%/);
  assert.match(text, /\$105\.90/);
  assert.match(text, /2 extra new retailers/);
});

test("compareOpenHouse rejects impossible discounts and fractional extra retailers", () => {
  assert.throws(() => compareOpenHouse({ ...naReorder, openHouseDiscountRate: 100 }), /below 100/);
  assert.throws(() => compareOpenHouse({ ...naReorder, openHouseExtraRetailers: 1.5 }), /whole number/);
  assert.throws(() => openHouseNote({}), /missing rows/);
});

test("OPEN_HOUSE_DEFAULTS match the page starting point", () => {
  assert.equal(OPEN_HOUSE_DEFAULTS.openHouseDiscountRate, 20);
  assert.equal(OPEN_HOUSE_DEFAULTS.openHouseCommissionRate, 0);
  assert.equal(OPEN_HOUSE_DEFAULTS.openHouseExtraRetailers, 2);
});

test("compareFairePromoted skip beats a 15% campaign that last-clicks 40% of organic", () => {
  const comparison = compareFairePromoted(naReorder);
  assert.equal(comparison.organicProfit, 75.9);
  assert.equal(comparison.merchandise, 200);
  assert.equal(comparison.organicOrders, 4);
  assert.equal(comparison.campaignRate, 15);
  assert.equal(comparison.extraOrders, 1);
  assert.equal(comparison.attributedOrganicPct, 40);
  assert.equal(comparison.skip.cash, 303.6);
  assert.ok(Math.abs(comparison.campaign.cash - 301.5) < 1e-9);
  assert.ok(Math.abs(comparison.extraCampaignVsSkip - (-2.1)) < 1e-9);
  assert.ok(Math.abs(comparison.higher.cash - 270.6) < 1e-9);
  assert.equal(comparison.winner, "skip");
  assert.ok(comparison.breakEvenCampaignRate > 14.5 && comparison.breakEvenCampaignRate < 14.7);
  assert.ok(comparison.breakEvenExtraOrders > 1.04 && comparison.breakEvenExtraOrders < 1.05);
  assert.ok(comparison.breakEvenAttributedOrganicPct > 38 && comparison.breakEvenAttributedOrganicPct < 38.5);
  assert.equal(comparison.rows[0].id, "skip");
  assert.equal(comparison.rows[1].id, "campaign");
  assert.equal(comparison.rows[2].id, "higher");
});

test("two extra first orders flip the default 15% campaign ahead of skip", () => {
  const comparison = compareFairePromoted({ ...naReorder, extraPromotedOrders: 2 });
  assert.equal(comparison.winner, "campaign");
  assert.ok(Math.abs(comparison.campaign.cash - 347.4) < 1e-9);
  assert.ok(comparison.extraCampaignVsSkip > 40);
});

test("a 10% campaign on the default extra order beats skip", () => {
  const comparison = compareFairePromoted({ ...naReorder, campaignPromotedRate: 10 });
  assert.equal(comparison.winner, "campaign");
  assert.ok(Math.abs(comparison.campaign.cash - 327.5) < 1e-9);
});

test("promotedNote names the default leak, rate ceiling, and extra-order floor", () => {
  const comparison = compareFairePromoted(naReorder);
  const text = promotedNote(comparison);
  assert.equal(text, comparison.summary);
  assert.match(text, /\$303\.60/);
  assert.match(text, /\$301\.50/);
  assert.match(text, /14\.6%/);
  assert.match(text, /about 1\.0/);
  assert.match(text, /38\.3%/);
});

test("compareFairePromoted ignores the listing promotedRate so the campaign table cannot double-count", () => {
  const billed = compareFairePromoted({ ...naReorder, promotedRate: 15 });
  const clean = compareFairePromoted(naReorder);
  assert.equal(billed.skip.cash, clean.skip.cash);
  assert.equal(billed.campaign.cash, clean.campaign.cash);
});

test("compareFairePromoted rejects impossible rates and fractional extra orders", () => {
  assert.throws(() => compareFairePromoted({ ...naReorder, campaignPromotedRate: 100 }), /below 100/);
  assert.throws(() => compareFairePromoted({ ...naReorder, attributedOrganicPct: 140 }), /at most 100/);
  assert.throws(() => compareFairePromoted({ ...naReorder, extraPromotedOrders: 1.5 }), /whole number/);
  assert.throws(() => compareFairePromoted({ ...naReorder, organicFirstOrders: 0 }), /at least 1/);
  assert.throws(() => promotedNote({}), /missing rows/);
});

test("compareFairePromoted's breakEvenCampaignRate uses the discounted subtotal, not raw merchandise", () => {
  // With a brand-funded opening discount, the promoted-listings fee is a
  // percent of orderSubtotal (post-discount), not of merchandise
  // (pre-discount) -- the rate ceiling must be solved against the same base
  // the fee is actually charged on, or it understates how much rate the
  // campaign can tolerate before skipping wins.
  const comparison = compareFairePromoted({ ...naReorder, openingDiscountRate: 30 });
  assert.equal(comparison.merchandise, 200);
  // Brute-force cross-check: the rate where campaign cash meets skip cash.
  let lo = 0;
  let hi = 99;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    const at = compareFairePromoted({ ...naReorder, openingDiscountRate: 30, campaignPromotedRate: mid });
    if (at.campaign.cash > at.skip.cash) lo = mid;
    else hi = mid;
  }
  assert.ok(Math.abs(comparison.breakEvenCampaignRate - lo) < 1e-6, `${comparison.breakEvenCampaignRate} vs brute-force ${lo}`);
  // Regression pin: the old (merchandise-based) formula reported ~5.0077%.
  assert.ok(comparison.breakEvenCampaignRate > 7, `expected > 7, got ${comparison.breakEvenCampaignRate}`);
  assert.ok(Math.abs(comparison.breakEvenCampaignRate - 7.153846153846152) < 1e-9);
});

test("PROMOTED_DEFAULTS match the page starting point", () => {
  assert.equal(PROMOTED_DEFAULTS.organicFirstOrders, 4);
  assert.equal(PROMOTED_DEFAULTS.extraPromotedOrders, 1);
  assert.equal(PROMOTED_DEFAULTS.campaignPromotedRate, 15);
  assert.equal(PROMOTED_DEFAULTS.attributedOrganicPct, 40);
  assert.equal(PROMOTED_DEFAULTS.highPromotedRate, 22);
  assert.equal(PROMOTED_DEFAULTS.highExtraPromotedOrders, 2);
  assert.equal(PROMOTED_DEFAULTS.highAttributedOrganicPct, 55);
});

test("compareFairePayNow skip beats a 2% offer when remittance stays 60 days", () => {
  const comparison = compareFairePayNow(naReorder);
  assert.equal(comparison.winner, "skip");
  assert.ok(Math.abs(comparison.skip.cash - 69.15764383561644) < 1e-9);
  assert.ok(Math.abs(comparison.offer.cash - 67.88049928767123) < 1e-9);
  assert.ok(Math.abs(comparison.take.cash - 65.96478246575342) < 1e-9);
  assert.ok(Math.abs(comparison.offerVsSkip + 1.2771445479452126) < 1e-9);
  assert.ok(comparison.breakEvenPayNowRate < 0.05);
  assert.ok(Math.abs(comparison.breakEvenPayNowWaitDays - 31.023237217739936) < 1e-9);
  assert.ok(Math.abs(comparison.breakEvenExtraOrders - 0.01936100598237038) < 1e-9);
});

test("one extra first order flips offering Pay Now ahead of skip", () => {
  const comparison = compareFairePayNow({ ...naReorder, extraPayNowOrders: 1 });
  assert.equal(comparison.winner, "offer");
  assert.ok(Math.abs(comparison.offer.cash - 133.84528175342464) < 1e-9);
  assert.ok(Math.abs(comparison.offerVsSkip - 64.6876379178082) < 1e-9);
});

test("a 1-day Pay Now remittance flips everyone-takes ahead of skip", () => {
  const comparison = compareFairePayNow({ ...naReorder, payNowWaitDays: 1 });
  assert.equal(comparison.winner, "take");
  assert.ok(Math.abs(comparison.take.cash - 72.46581304109588) < 1e-9);
  assert.ok(Math.abs(comparison.offer.cash - 70.48091151780822) < 1e-9);
  assert.ok(comparison.breakEvenPayNowRate > 3.9 && comparison.breakEvenPayNowRate < 4.1);
});

test("payNowNote names the default leak, remittance ceiling, and extra-order floor", () => {
  const comparison = compareFairePayNow(naReorder);
  const text = payNowNote(comparison);
  assert.equal(text, comparison.summary);
  assert.match(text, /\$69\.16/);
  assert.match(text, /\$67\.88/);
  assert.match(text, /0\.0%/);
  assert.match(text, /31\.0 days/);
  assert.match(text, /about 0\.02/);
  assert.doesNotMatch(text, /you should offer|must skip Pay Now|must turn Pay Now on/i);
});

test("compareFairePayNow stacks Pay Now on top of the opening discount", () => {
  const stacked = compareFairePayNow({ ...naReorder, openingDiscountRate: 10, payNowRate: 2 });
  assert.equal(stacked.skip.discount, 20);
  assert.equal(stacked.take.discount, 24);
});

test("compareFairePayNow rejects impossible rates, waits, and fractional extra orders", () => {
  assert.throws(() => compareFairePayNow({ ...naReorder, payNowRate: 100 }), /below 100/);
  assert.throws(() => compareFairePayNow({ ...naReorder, payNowTakePct: 140 }), /at most 100/);
  assert.throws(() => compareFairePayNow({ ...naReorder, extraPayNowOrders: 1.5 }), /whole number/);
  assert.throws(() => compareFairePayNow({ ...naReorder, payNowWaitDays: 400 }), /365 days or fewer/);
  assert.throws(() => compareFairePayNow({ ...naReorder, netWaitDays: -1 }), /non-negative/);
  assert.throws(() => payNowNote({}), /missing rows/);
});

test("PAY_NOW_DEFAULTS match the page starting point", () => {
  assert.equal(PAY_NOW_DEFAULTS.payNowRate, 2);
  assert.equal(PAY_NOW_DEFAULTS.payNowTakePct, 40);
  assert.equal(PAY_NOW_DEFAULTS.extraPayNowOrders, 0);
  assert.equal(PAY_NOW_DEFAULTS.netWaitDays, 60);
  assert.equal(PAY_NOW_DEFAULTS.payNowWaitDays, 60);
});

test("a 20% keep-it credit still beats denying at 50% and taking the full return", () => {
  const comparison = compareFaireReturn(naReorder);
  assert.equal(comparison.completed.profit, 75.9);
  assert.equal(comparison.clawback, 170.9);
  assert.equal(comparison.restockValue, 64);
  assert.equal(comparison.credit, 40);
  assert.equal(comparison.commissionGiveback, 6);
  assert.equal(comparison.takeAfter, -49);
  assert.ok(Math.abs(comparison.keepAfter - 41.9) < 1e-12);
  assert.equal(comparison.denyAfter, 37.95);
  assert.equal(comparison.winner, "keep");
  assert.ok(comparison.denyFloorVsKeep > 55.2);
  assert.ok(comparison.denyFloorVsKeep < 55.3);
  assert.ok(comparison.keepCeilingVsDeny > 22.3);
  assert.ok(comparison.keepCeilingVsDeny < 22.4);
});

test("returning two units with an $8 label flips taking the return ahead", () => {
  const comparison = compareFaireReturn({ ...naReorder, returnUnits: 2, returnLabel: 8 });
  assert.equal(comparison.winner, "take");
  assert.ok(comparison.takeAfter > 46.5);
  assert.ok(comparison.takeAfter < 46.6);
  assert.ok(comparison.takeAfter > comparison.keepAfter);
});

test("70% they'll-drop-it flips denying ahead of the 20% keep-it credit", () => {
  const comparison = compareFaireReturn({ ...naReorder, denyKeepPct: 70 });
  assert.equal(comparison.winner, "deny");
  assert.ok(comparison.denyAfter > 53.1);
  assert.ok(comparison.denyAfter < 53.2);
});

test("faireReturnNote does not tell them to take, credit, or fight the return", () => {
  const note = faireReturnNote(compareFaireReturn(naReorder));
  assert.match(note, /\$41\.90/);
  assert.match(note, /\$37\.95/);
  assert.match(note, /−\$49\.00/);
  assert.match(note, /55\.2%/);
  assert.doesNotMatch(note, /should take|must take|should deny|must offer/i);
});

test("compareFaireReturn rejects impossible units, credits, and rates", () => {
  assert.throws(() => compareFaireReturn({ ...naReorder, returnUnits: 11 }), /cannot exceed/);
  assert.throws(() => compareFaireReturn({ ...naReorder, returnUnits: 0 }), /at least 1/);
  assert.throws(() => compareFaireReturn({ ...naReorder, keepDiscountPct: 100 }), /below 100/);
  assert.throws(() => compareFaireReturn({ ...naReorder, restockablePct: 101 }), /between 0 and 100/);
  assert.throws(() => compareFaireReturn({ ...naReorder, denyKeepPct: 101 }), /between 0 and 100/);
  assert.throws(() => faireReturnNote({}), /missing rows/);
});

test("FAIRE_RETURN_DEFAULTS match the page starting point", () => {
  assert.equal(FAIRE_RETURN_DEFAULTS.returnUnits, 10);
  assert.equal(FAIRE_RETURN_DEFAULTS.returnLabel, 18);
  assert.equal(FAIRE_RETURN_DEFAULTS.restockablePct, 80);
  assert.equal(FAIRE_RETURN_DEFAULTS.keepDiscountPct, 20);
  assert.equal(FAIRE_RETURN_DEFAULTS.denyKeepPct, 50);
});

test("rejects selling more units than the retailer bought", () => {
  assert.throws(
    () => calculateRetailerOrder({ unitWholesale: 20, quantity: 4, unitsSold: 5, unitRetail: 40 }),
    /cannot exceed/,
  );
});

// --- ceiling helpers must distinguish "no value qualifies" from a real zero ---
// Both helpers below used to clamp an unreachable result to 0, which is also a
// legitimate answer (the paths tie at zero and anything above loses). The note
// text then quoted 0.0% as real headroom.

test("open-house discount ceiling is null when the event trails everyday at no markdown", () => {
  const behind = {
    unitWholesale: 20, quantity: 10, unitCogs: 8, shippingReimbursement: 15,
    shippingCost: 15, region: "north_america", payout: "day_60",
    openHouseCommissionRate: 15, openHouseFirstOrderExtraRate: 25,
  };
  const comparison = compareOpenHouse(behind);
  // Premise from the comparison rows themselves, not from the ceiling helper.
  const everyday = comparison.rows.find((row) => row.id === "everyday");
  const sameList = comparison.rows.find((row) => row.id === "open_house_same_list");
  assert.ok(
    sameList.profit < everyday.profit,
    "premise: the event trails everyday even at the everyday discount",
  );

  assert.equal(comparison.discountCeiling, null);
  const text = openHouseNote(comparison);
  assert.doesNotMatch(text, /funds about 0\.0% off/);
  assert.match(text, /does not fund any extra discount/);
});

test("a real open-house discount ceiling is still reported", () => {
  const comparison = compareOpenHouse({
    unitWholesale: 20, quantity: 10, unitCogs: 8, shippingReimbursement: 15,
    shippingCost: 15, region: "north_america", payout: "day_60",
  });
  assert.notEqual(comparison.discountCeiling, null);
  assert.ok(comparison.discountCeiling > 0, "a funded discount is a positive ceiling");
  assert.match(openHouseNote(comparison), /funds about \d+\.\d% off/);
});

test("pay-now rate ceiling is null when offering trails skipping at a 0% rate", () => {
  const behind = {
    unitWholesale: 20, quantity: 10, unitCogs: 8, shippingReimbursement: 15,
    shippingCost: 15, region: "north_america", payout: "day_60",
    payNowWaitDays: 120, annualCarryRate: 60,
  };
  const comparison = compareFairePayNow(behind);
  // Premise: at an explicit 0% rate, offering is genuinely behind skipping.
  const atZero = compareFairePayNow({ ...behind, payNowRate: 0 });
  assert.ok(
    atZero.offer.cash < comparison.skip.cash - 1e-9,
    "premise: offering at 0% already trails skipping",
  );

  assert.equal(comparison.breakEvenPayNowRate, null);
  // The rate lever must drop out of the sentence entirely rather than be
  // quoted as 0.0% or spliced in as a noun ("falls to about an unreachable
  // Pay Now rate"). The other two levers still have real numbers here.
  const text = payNowNote(comparison);
  assert.doesNotMatch(text, /the rate falls to about/);
  assert.doesNotMatch(text, /unreachable Pay Now rate/);
  assert.match(text, /remittance on Pay Now falls to about/);
});

test("pay-now summary says so plainly when no lever closes the gap", () => {
  // All three levers unreachable at once: the sentence must not end up as a
  // dangling "The discount matches if ." with nothing in it.
  const comparison = {
    winner: "skip",
    skip: { cash: 100 }, offer: { cash: 80 }, take: { cash: 70 },
    offerVsSkip: -20, takeVsSkip: -30,
    breakEvenPayNowRate: null,
    breakEvenPayNowWaitDays: null,
    breakEvenExtraOrders: Infinity,
  };
  const text = payNowNote(comparison);
  assert.match(text, /Nothing on these numbers brings offering level with skipping\./);
  assert.doesNotMatch(text, /matches if \./);
});

test("a pay-now rate ceiling of exactly zero stays 0, not null", () => {
  // No remittance wait and no carry cost: offering at 0% ties skipping exactly,
  // and any positive rate loses. That is a real 0% ceiling, not "unreachable".
  const tie = {
    unitWholesale: 20, quantity: 10, unitCogs: 8, shippingReimbursement: 15,
    shippingCost: 15, region: "north_america", payout: "day_60",
    payNowWaitDays: 0, annualCarryRate: 0,
  };
  const comparison = compareFairePayNow(tie);
  const atZero = compareFairePayNow({ ...tie, payNowRate: 0 });
  assert.ok(
    Math.abs(atZero.offer.cash - comparison.skip.cash) < 1e-6,
    "premise: offering at 0% ties skipping",
  );

  assert.notEqual(comparison.breakEvenPayNowRate, null, "a genuine 0% ceiling is not unreachable");
  assert.equal(comparison.breakEvenPayNowRate, 0);
});
