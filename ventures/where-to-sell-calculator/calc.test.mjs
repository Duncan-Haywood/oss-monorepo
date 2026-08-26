import assert from "node:assert/strict";
import { test } from "node:test";
import { CHANNEL_PRESETS, calculateChannel, compareChannels } from "./calc.mjs";

const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 0.005, `${message}: expected ~${expected}, got ${actual}`);

const shared = {
  price: 48,
  shippingCharged: 6,
  shippingCost: 5,
  itemCost: 14,
  packagingCost: 1,
  otherCost: 0,
  monthlyOrders: 100,
};

const preset = (id) => CHANNEL_PRESETS.find((channel) => channel.id === id);

test("eBay: final value fee applies to item plus shipping", () => {
  const result = calculateChannel(preset("ebay"), shared);
  close(result.revenue, 54, "revenue");
  close(result.fees.commission, 54 * 0.1325, "final value fee");
  close(result.fees.payment, 0.3, "fixed fee only, processing is bundled");
  close(result.feeTotal, 54 * 0.1325 + 0.3, "fee total");
  close(result.cashInvested, 20, "cash invested");
  close(result.profit, 54 - (54 * 0.1325 + 0.3) - 20, "profit");
  close(result.margin, (result.profit / 54) * 100, "margin");
  close(result.roi, (result.profit / 20) * 100, "roi");
});

test("Etsy: listing fee and separate payment processing both land on the order", () => {
  const result = calculateChannel(preset("etsy"), shared);
  close(result.fees.commission, 54 * 0.065, "transaction fee");
  close(result.fees.payment, 54 * 0.03 + 0.25, "Etsy Payments");
  close(result.fees.listing, 0.2, "listing fee");
  close(result.feeTotal, 54 * 0.095 + 0.45, "fee total");
});

test("a monthly plan is spread over the orders it carries", () => {
  const result = calculateChannel(preset("own-store"), shared);
  close(result.fees.subscription, 0.39, "39/month over 100 orders");

  const thin = calculateChannel(preset("own-store"), { ...shared, monthlyOrders: 10 });
  close(thin.fees.subscription, 3.9, "39/month over 10 orders");
  assert.ok(thin.profit < result.profit, "fewer orders must carry more of the plan");
});

test("subscription can be excluded, and is zero for channels without one", () => {
  const excluded = calculateChannel(preset("own-store"), { ...shared, includeSubscription: false });
  close(excluded.fees.subscription, 0, "excluded subscription");
  const ebay = calculateChannel(preset("ebay"), { ...shared, monthlyOrders: 0 });
  close(ebay.fees.subscription, 0, "eBay has no monthly fee");
});

test("a monthly fee with no order volume is an error, not a divide by zero", () => {
  assert.throws(
    () => calculateChannel(preset("own-store"), { ...shared, monthlyOrders: 0 }),
    /orders a month/i,
  );
});

test("local sale keeps the whole price when no shipping is involved", () => {
  const result = calculateChannel(
    { ...preset("local"), shippingCharged: 0, shippingCost: 0 },
    shared,
  );
  close(result.feeTotal, 0, "no platform fee");
  close(result.profit, 48 - 15, "price less item and packaging");
});

test("per-channel overrides beat the shared defaults", () => {
  const result = calculateChannel({ ...preset("etsy"), price: 62 }, shared);
  close(result.price, 62, "overridden price");
  close(result.revenue, 68, "overridden revenue");
});

test("break-even price is the price at which profit reaches zero", () => {
  const result = calculateChannel(preset("ebay"), shared);
  const atBreakEven = calculateChannel({ ...preset("ebay"), price: result.breakEvenPrice }, shared);
  close(atBreakEven.profit, 0, "profit at break-even");
});

test("priceForProfit solves for a target, and round-trips", () => {
  const result = calculateChannel(preset("etsy"), shared);
  const needed = result.priceForProfit(20);
  const atTarget = calculateChannel({ ...preset("etsy"), price: needed }, shared);
  close(atTarget.profit, 20, "profit at the solved price");
});

test("comparison ranks channels and reports the gap against the best", () => {
  const comparison = compareChannels(CHANNEL_PRESETS, shared);
  assert.equal(comparison.results.length, CHANNEL_PRESETS.filter((c) => c.enabled !== false).length);

  const best = comparison.results.find((result) => result.isBest);
  assert.equal(best.rank, 1, "the best channel ranks first");
  assert.equal(best.gapVsBest, 0, "the best channel gives up nothing");
  assert.equal(best.priceToMatchBest, null, "matching yourself is not a question");

  for (const result of comparison.results) {
    assert.ok(result.gapVsBest >= 0, `${result.label} gap must not be negative`);
    if (!result.isBest) assert.ok(result.rank > 1, `${result.label} must rank below the best`);
  }
  const score = (result) => result.expectedProfit;
  close(comparison.spread, score(best) - Math.min(...comparison.results.map(score)), "spread");
});

test("price to match the best channel actually matches it", () => {
  const comparison = compareChannels([preset("ebay"), preset("etsy")], { ...shared, includeReturns: false });
  const loser = comparison.results.find((result) => !result.isBest);
  const repriced = calculateChannel({ ...preset(loser.id), price: loser.priceToMatchBest }, shared);
  close(repriced.profit, comparison.best.profit, "repriced profit matches the winner");
});

test("price to match the best after returns matches expected keep", () => {
  const comparison = compareChannels([preset("ebay"), preset("etsy")], shared);
  const loser = comparison.results.find((result) => !result.isBest);
  const repriced = calculateChannel({ ...preset(loser.id), price: loser.priceToMatchBest }, shared);
  close(repriced.expectedProfit, comparison.best.expectedProfit, "repriced expected profit matches the winner");
});

test("a fee-free direct sale beats the marketplaces at the same price", () => {
  const comparison = compareChannels(CHANNEL_PRESETS, { ...shared, shippingCharged: 0, shippingCost: 0 });
  assert.equal(comparison.best.id, "local", "no fees and no shipping wins on the same price");
});

test("a switched-off channel is left out of the ranking", () => {
  const all = compareChannels(CHANNEL_PRESETS, shared);
  assert.ok(
    !all.results.some((result) => result.id === "other"),
    "the blank 'Other channel' must not win the default comparison by charging nothing",
  );

  const on = compareChannels(
    CHANNEL_PRESETS.map((channel) => (channel.id === "other" ? { ...channel, enabled: true } : channel)),
    shared,
  );
  assert.ok(on.results.some((result) => result.id === "other"), "switching it on includes it");

  assert.throws(
    () => compareChannels(CHANNEL_PRESETS.map((channel) => ({ ...channel, enabled: false })), shared),
    /at least one channel/i,
  );
});

test("negative and non-numeric inputs are rejected with the field name", () => {
  assert.throws(() => calculateChannel(preset("ebay"), { ...shared, itemCost: -1 }), /paid for the item/i);
  assert.throws(() => calculateChannel({ ...preset("ebay"), price: "abc" }, shared), /eBay price/i);
  assert.throws(() => calculateChannel(preset("ebay"), { ...shared, monthlyOrders: 1.5 }), /whole number/i);
  assert.throws(() => calculateChannel(null, shared), /channel is required/i);
  assert.throws(() => compareChannels([], shared), /at least one channel/i);
});

test("rates that consume the whole order are refused rather than reported", () => {
  assert.throws(
    () => calculateChannel({ ...preset("other"), label: "Ruinous", commissionRate: 101 }, shared),
    /100%/,
  );
});

test("an unsold-item cost still shows up when the price is zero", () => {
  const result = calculateChannel({ ...preset("etsy"), price: 0, shippingCharged: 0 }, shared);
  close(result.fees.listing, 0.2, "listing fee is charged regardless");
  assert.ok(result.profit < 0, "a zero-price order cannot be profitable");
  assert.equal(result.margin, 0, "margin is defined as zero when there is no revenue");
});

test("a zero return rate leaves expected profit equal to the sold sale", () => {
  const result = calculateChannel({ ...preset("ebay"), returnRate: 0 }, shared);
  close(result.expectedProfit, result.profit, "expected equals sold");
  close(result.returnDrag, 0, "no drag");
  close(result.expectedBreakEvenPrice, result.breakEvenPrice, "expected break-even collapses to sold");
  close(result.priceForExpectedProfit(20), result.priceForProfit(20), "target solver collapses");
});

test("eBay worked example: 8% returns with refunded FVF and $6 return postage", () => {
  const result = calculateChannel(preset("ebay"), shared);
  close(result.profit, 26.545, "sold keep");
  // Completed sale $26.545; a return costs outbound $5 + pack $1 + return $6
  // + 10% of the $14 item that cannot be listed again = −$13.40. At 8%:
  // 0.92 × 26.545 + 0.08 × (−13.40) = 23.3494.
  close(result.returnedProfit, -13.4, "cash on a returned order");
  close(result.expectedProfit, 23.3494, "expected keep after returns");
  close(result.returnDrag, 3.1956, "returns cost $3.20 versus a perfect sale");
});

test("Amazon's higher return rate can flip a sold-sale win against eBay", () => {
  // Sellers often list higher on Amazon. At $54 vs eBay's $48 the completed
  // sale favours Amazon; 18% returns vs 8% does not.
  const amazon = { ...preset("amazon"), price: 54 };
  const soldOnly = compareChannels([preset("ebay"), amazon], { ...shared, includeReturns: false });
  const afterReturns = compareChannels([preset("ebay"), amazon], shared);

  assert.equal(soldOnly.best.id, "amazon", "the higher Amazon price wins on a completed sale");
  assert.equal(afterReturns.best.id, "ebay", "eBay wins once Amazon's 18% returns are counted");
  assert.equal(soldOnly.includeReturns, false);
  assert.equal(afterReturns.includeReturns, true);

  const amazonAfter = afterReturns.results.find((result) => result.id === "amazon");
  const ebayAfter = afterReturns.results.find((result) => result.id === "ebay");
  assert.ok(amazonAfter.returnDrag > ebayAfter.returnDrag, "Amazon's return drag is the larger hole");
  close(amazonAfter.profit, 30.6001, "Amazon sold keep at $54 + $6 shipping");
  close(amazonAfter.expectedProfit, 22.1761, "Amazon expected keep after 18% returns");
});

test("own-store processing fees that are not refunded stay in the return loss", () => {
  const refunded = calculateChannel({ ...preset("own-store"), feeRefundRate: 100 }, shared);
  const kept = calculateChannel(preset("own-store"), shared);
  assert.ok(kept.returnedProfit < refunded.returnedProfit, "keeping the processor fee makes a return worse");
  close(kept.fees.payment, 54 * 0.029 + 0.3, "2.9% + $0.30 on the $54 order");
});

test("return-rate inputs outside 0–100 are refused", () => {
  assert.throws(() => calculateChannel({ ...preset("ebay"), returnRate: 101 }, shared), /return rate/);
  assert.throws(() => calculateChannel({ ...preset("ebay"), resellableRate: -1 }, shared), /still-sellable/);
  assert.throws(() => calculateChannel({ ...preset("ebay"), feeRefundRate: 140 }, shared), /fee refund/);
});

test("expected profit at the expected break-even is zero", () => {
  const result = calculateChannel(preset("amazon"), shared);
  const atBreakEven = calculateChannel({ ...preset("amazon"), price: result.expectedBreakEvenPrice }, shared);
  close(atBreakEven.expectedProfit, 0, "expected profit at expected break-even");
});

// --- shelf time: what a listing is worth, not what a sale is worth ---------

const shelfShared = { ...shared, horizonDays: 90, capitalCostPct: 12 };

test("a listing that always sells fast and free is worth exactly the sale", () => {
  // With 100% sell-through, no cost of capital and no listing renewals there
  // is nothing for the shelf-time layer to subtract, so it must collapse onto
  // the keep the fee table already reports.
  const result = calculateChannel(
    { ...preset("amazon"), sellThroughPct: 100, daysToSell: 10 },
    { ...shelfShared, capitalCostPct: 0 },
  );
  close(result.velocity.listedValue, result.expectedProfit, "listed value collapses to expected keep");
  close(result.velocity.shelfDrag, 0, "no drag when it always sells");
  close(result.velocity.shelfDays, 10, "shelf days is the time to sale");
  close(result.velocity.valuePer30Days, (result.expectedProfit / 10) * 30, "rate over ten days");
});

test("a listing that never sells costs fees and tied-up cash, and nothing else", () => {
  const result = calculateChannel({ ...preset("etsy"), sellThroughPct: 0 }, shelfShared);
  // One $0.20 listing cycle covers a 90-day horizon (Etsy renews at 120 days),
  // plus 12%/year on the $14 item for 90 days.
  const holding = (14 * 0.12 * 90) / 365;
  close(result.velocity.unsoldListingFees, 0.2, "one listing cycle inside the horizon");
  close(result.velocity.listedValue, -0.2 - holding, "unsold listing loses fees and carry only");
  close(result.velocity.shelfDays, 90, "an unsold listing occupies the whole horizon");
  assert.ok(result.velocity.listedValue < 0, "a listing that never sells cannot be worth money");
});

test("a long horizon renews the listing fee for as long as it sits", () => {
  const short = calculateChannel(preset("etsy"), shelfShared);
  const long = calculateChannel(preset("etsy"), { ...shelfShared, horizonDays: 365 });
  close(short.velocity.unsoldListingFees, 0.2, "one cycle over 90 days");
  // 365 days over Etsy's 120-day listing is four charged cycles.
  close(long.velocity.unsoldListingFees, 0.8, "four cycles over a year");
  assert.ok(long.velocity.listedValue < short.velocity.listedValue, "sitting longer is worth less");
});

test("cost of capital only charges for the days the item is actually held", () => {
  const free = calculateChannel(preset("amazon"), { ...shelfShared, capitalCostPct: 0 });
  const costly = calculateChannel(preset("amazon"), { ...shelfShared, capitalCostPct: 24 });
  assert.ok(costly.velocity.listedValue < free.velocity.listedValue, "carrying cash costs money");
  close(costly.velocity.holdingCostIfUnsold, (14 * 0.24 * 90) / 365, "90 days of carry on the item cost");
});

test("shelf time can rank a channel below one that pays less per sale", () => {
  const comparison = compareChannels(CHANNEL_PRESETS, shelfShared);
  const etsy = comparison.results.find((result) => result.id === "etsy");
  const ebay = comparison.results.find((result) => result.id === "ebay");

  assert.ok(etsy.expectedProfit > ebay.expectedProfit, "Etsy keeps more on a sale at these rates");
  assert.ok(
    etsy.velocity.valuePer30Days < ebay.velocity.valuePer30Days,
    "eBay earns more per month of shelf despite keeping less per sale",
  );
  assert.equal(comparison.shelf.id, "ebay", "the shelf ranking is led by the faster channel");
  assert.equal(comparison.shelf.agrees, false, "the two rankings disagree on these defaults");
  assert.equal(ebay.isShelfBest, true);
  assert.equal(ebay.shelfRank, 1);
  assert.equal(ebay.shelfGapVsBest, 0, "the shelf leader gives up nothing");
  assert.equal(ebay.sellThroughToMatchBest, null, "matching yourself is not a question");
  assert.ok(comparison.shelf.spread > 0, "the shelf ranking has a spread");
});

test("the keep ranking is unchanged by the shelf overlay", () => {
  // The shelf figures are reported alongside the keep ranking, never folded
  // into it: a seller who wants the best-paying channel must still get it.
  const comparison = compareChannels(CHANNEL_PRESETS, shelfShared);
  const slowLeader = compareChannels(
    CHANNEL_PRESETS.map((channel) => ({ ...channel, sellThroughPct: 5, daysToSell: 85 })),
    shelfShared,
  );
  assert.equal(comparison.best.id, slowLeader.best.id, "sell-through must not move the keep winner");
});

test("the sell-through needed to match the shelf leader actually matches it", () => {
  const comparison = compareChannels(CHANNEL_PRESETS, shelfShared);
  for (const result of comparison.results) {
    if (result.isShelfBest) continue;
    assert.ok(result.shelfGapVsBest > 0, `${result.label} must trail the shelf leader`);
    if (result.sellThroughToMatchBest === null) continue;
    const repriced = calculateChannel(
      { ...preset(result.id), sellThroughPct: result.sellThroughToMatchBest },
      shelfShared,
    );
    close(
      repriced.velocity.valuePer30Days,
      comparison.shelf.valuePer30Days,
      `${result.label} at ${result.sellThroughToMatchBest}% sell-through matches the leader`,
    );
  }
});

test("a channel that cannot catch the leader reports no sell-through rather than a fake one", () => {
  // A channel whose listing is worth less than the leader's rate even when it
  // sells every time has no answer, and must say so instead of returning a
  // share above 100% that reads like a target.
  const hopeless = { ...preset("other"), id: "hopeless", label: "Hopeless", enabled: true, commissionRate: 60, daysToSell: 80, sellThroughPct: 30 };
  const comparison = compareChannels([preset("ebay"), hopeless], shelfShared);
  const trailing = comparison.results.find((result) => result.id === "hopeless");
  assert.equal(trailing.isShelfBest, false);
  assert.equal(trailing.sellThroughToMatchBest, null, "no reachable sell-through catches the leader");
});

test("an item that sells later than you would keep it listed sells on the last day", () => {
  const result = calculateChannel({ ...preset("etsy"), daysToSell: 200 }, shelfShared);
  close(result.velocity.soldDays, 90, "capped at the horizon");
});

test("turning the returns overlay off moves shelf time onto sold profit", () => {
  const withReturns = calculateChannel(preset("ebay"), shelfShared);
  const soldOnly = calculateChannel(preset("ebay"), { ...shelfShared, includeReturns: false });
  assert.ok(soldOnly.velocity.soldValue > withReturns.velocity.soldValue, "the sold-only base is higher");
  close(
    soldOnly.velocity.soldValue - withReturns.velocity.soldValue,
    withReturns.returnDrag,
    "the difference is exactly the return drag",
  );
});

test("shelf-time inputs outside their range are refused with the field name", () => {
  assert.throws(() => calculateChannel(preset("ebay"), { ...shelfShared, horizonDays: 0 }), /leave it listed/i);
  assert.throws(() => calculateChannel(preset("ebay"), { ...shelfShared, horizonDays: -5 }), /leave it listed/i);
  assert.throws(() => calculateChannel({ ...preset("ebay"), sellThroughPct: 140 }, shelfShared), /sell-through/i);
  assert.throws(() => calculateChannel(preset("ebay"), { ...shelfShared, unsoldRecoveryPct: 101 }), /does not sell/i);
  assert.throws(() => calculateChannel({ ...preset("ebay"), daysToSell: -1 }, shelfShared), /days to sell/i);
  assert.throws(() => calculateChannel(preset("ebay"), { ...shelfShared, capitalCostPct: "abc" }), /cash tied up/i);
});

test("an item you cannot re-list at full value if it does not sell costs the write-down", () => {
  const whole = calculateChannel(preset("amazon"), shelfShared);
  const halved = calculateChannel(preset("amazon"), { ...shelfShared, unsoldRecoveryPct: 50 });
  close(whole.velocity.unsoldValue - halved.velocity.unsoldValue, 7, "half of the $14 item cost");
  assert.ok(halved.velocity.listedValue < whole.velocity.listedValue, "a write-down lowers the listing");
});

test("shelf-time worked example: eBay leads on turnover at the shipped defaults", () => {
  const comparison = compareChannels(CHANNEL_PRESETS, shelfShared);
  const ebay = comparison.results.find((result) => result.id === "ebay");
  const etsy = comparison.results.find((result) => result.id === "etsy");

  // eBay: 65% sell-through in 21 days, 35% still listed at day 90.
  //   sold  = $23.3494 expected keep − 12%/yr on $14 for 21 days = $23.2528
  //   unsold = −12%/yr on $14 for 90 days = −$0.4142 (no listing fee on eBay)
  //   listed = .65 × 23.2528 + .35 × (−0.4142) = $14.97
  //   shelf days = .65 × 21 + .35 × 90 = 45.15 → $9.95 per 30 days
  close(ebay.velocity.listedValue, 14.9694, "eBay listing value");
  close(ebay.velocity.valuePer30Days, 9.9464, "eBay per 30 days of shelf");
  close(etsy.expectedProfit, 26.7085, "Etsy keeps more per completed sale");
  close(etsy.velocity.valuePer30Days, 3.5859, "Etsy earns far less per month of shelf");
  close(etsy.sellThroughToMatchBest, 72.4427, "Etsy needs 72.4% sell-through to match eBay");
});
