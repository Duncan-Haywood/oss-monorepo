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
  close(result.fees.commission, 54 * 0.136, "final value fee");
  close(result.fees.payment, 0.4, "fixed fee only, processing is bundled");
  close(result.feeTotal, 54 * 0.136 + 0.4, "fee total");
  close(result.cashInvested, 20, "cash invested");
  close(result.profit, 54 - (54 * 0.136 + 0.4) - 20, "profit");
  close(result.margin, (result.profit / 54) * 100, "margin");
  close(result.roi, (result.profit / 20) * 100, "roi");
});

test("Reverb: selling fee applies to the item price only, not shipping charged", () => {
  // Matches reverb-fee-calculator. Charging 5% on the $54 order total would
  // overstate fees by shippingCharged × 5% and make the handoff disagree.
  const result = calculateChannel(preset("reverb"), shared);
  close(result.fees.commission, 48 * 0.05, "selling fee on item price");
  close(result.fees.payment, 54 * 0.0319 + 0.49, "processing on the order");
  const atBreakEven = calculateChannel({ ...preset("reverb"), price: result.breakEvenPrice }, shared);
  close(atBreakEven.profit, 0, "item-base break-even still round-trips");
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

test("subscription channels show orders needed to recover their monthly plan", () => {
  const result = calculateChannel(preset("own-store"), shared);
  assert.equal(result.ordersToCoverPlan, 2);

  const impossible = calculateChannel(
    { ...preset("own-store"), commissionRate: 99, paymentRate: 0 },
    shared,
  );
  assert.equal(impossible.ordersToCoverPlan, null);
  assert.equal(calculateChannel(preset("ebay"), shared).ordersToCoverPlan, 0);
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

test("price for target profit solves the same fee equation on every channel", () => {
  const comparison = compareChannels([preset("ebay"), preset("etsy")], { ...shared, targetProfit: 20 });
  for (const result of comparison.results) {
    assert.ok(result.priceForTargetProfit > 0, `${result.label} should need a positive price`);
    const repriced = calculateChannel({ ...preset(result.id), price: result.priceForTargetProfit }, shared);
    close(repriced.profit, 20, `${result.label} target profit`);
  }
});

test("target profit is not solved when the seller has not entered one", () => {
  const comparison = compareChannels([preset("ebay"), preset("etsy")], shared);
  for (const result of comparison.results) {
    assert.equal(result.priceForTargetProfit, null, "no target means no answer, not a guessed one");
  }
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

test("profit per day is profit divided by days to sell", () => {
  const result = calculateChannel({ ...preset("ebay"), daysToSell: 10 }, shared);
  close(result.daysToSell, 10, "days");
  close(result.profitPerDay, result.profit / 10, "profit per day");
  close(result.monthlyProfitAtVelocity, result.profit * 3, "30-day month at that pace");
});

test("missing or zero days leaves profit per day unset instead of inventing a pace", () => {
  const unset = calculateChannel({ ...preset("ebay"), daysToSell: "" }, { ...shared, daysToSell: "" });
  assert.equal(unset.daysToSell, null);
  assert.equal(unset.profitPerDay, null);
  assert.equal(unset.monthlyProfitAtVelocity, null);

  const zero = calculateChannel({ ...preset("ebay"), daysToSell: 0 }, shared);
  assert.equal(zero.profitPerDay, null);
});

test("a channel override beats the shared days-to-sell fallback", () => {
  const result = calculateChannel(
    { ...preset("etsy"), daysToSell: 5 },
    { ...shared, daysToSell: 20 },
  );
  close(result.daysToSell, 5, "channel days win");
});

test("shared days-to-sell apply when a channel has none", () => {
  const result = calculateChannel(
    { id: "blank", label: "Blank", commissionRate: 0, paymentRate: 0 },
    { ...shared, daysToSell: 8 },
  );
  close(result.daysToSell, 8, "shared fallback");
  close(result.profitPerDay, result.profit / 8, "profit per day from shared days");
});

test("negative days to sell are refused", () => {
  assert.throws(
    () => calculateChannel({ ...preset("ebay"), daysToSell: -3 }, shared),
    /days to sell/i,
  );
});

test("the fastest channel can differ from the highest-fee-profit channel", () => {
  // Main's shipped days have local both cheapest and fastest (14 days). The
  // cash-per-day column only earns its keep when a slower no-fee channel
  // loses to a faster marketplace, so recreate that split explicitly.
  const comparison = compareChannels(
    CHANNEL_PRESETS.map((channel) => ({
      ...channel,
      daysToSell: channel.id === "amazon" ? 7 : channel.id === "local" ? 45 : channel.daysToSell,
    })),
    shared,
  );
  const feeBest = comparison.results.find((result) => result.isBest);
  const velocityBest = comparison.results.find((result) => result.isBestOnVelocity);

  assert.equal(comparison.best.id, feeBest.id);
  assert.equal(comparison.bestOnVelocity.id, velocityBest.id);
  assert.ok(velocityBest.profitPerDay !== null, "illustrative days produce a pace");
  assert.ok(
    comparison.results.every((result) => result.gapVsBestPerDay === null || result.gapVsBestPerDay >= -0.0001),
    "no channel can beat the velocity winner on profit per day",
  );

  // Local keeps the most per sale (no fees) but Amazon in a week keeps more
  // per day. That split is the reason this column exists: fee-best is not
  // always the listing a seller should wait on.
  assert.equal(feeBest.id, "local");
  assert.ok(velocityBest.id !== feeBest.id, "velocity ranking must be able to disagree with fee ranking");
  assert.ok(
    velocityBest.profitPerDay > feeBest.profitPerDay,
    "the velocity winner must actually keep more per day",
  );
});

test("velocity ranking is omitted when no channel has a pace", () => {
  const channels = [
    { id: "a", label: "A", commissionRate: 10, daysToSell: "" },
    { id: "b", label: "B", commissionRate: 5, daysToSell: "" },
  ];
  const comparison = compareChannels(channels, { ...shared, daysToSell: "" });
  assert.equal(comparison.bestOnVelocity, null);
  assert.ok(comparison.results.every((result) => result.profitPerDay === null));
  assert.ok(comparison.results.every((result) => result.isBestOnVelocity === false));
});

test("an unsold-item cost still shows up when the price is zero", () => {
  const result = calculateChannel({ ...preset("etsy"), price: 0, shippingCharged: 0 }, shared);
  close(result.fees.listing, 0.2, "listing fee is charged regardless");
  assert.ok(result.profit < 0, "a zero-price order cannot be profitable");
  assert.equal(result.margin, 0, "margin is defined as zero when there is no revenue");
});

test("shipped days-to-sell already vary by channel, so the two rankings need not match out of the box", () => {
  // An earlier draft of this feature shipped every channel with the same
  // placeholder days-to-sell, so the two rankings agreed until a seller
  // edited something. The shelf-time work replaced that with illustrative
  // per-channel paces (eBay 21, Etsy 45, Amazon 28, own-store 40, local 14),
  // so the full order can already differ in the shipped defaults. Local is
  // both cheapest and fastest here, so it still wins either way — the winner
  // agreeing is not evidence the two rankings are the same list.
  const byProfit = compareChannels(CHANNEL_PRESETS, shared);
  const byDay = compareChannels(CHANNEL_PRESETS, { ...shared, rankBy: "profitPerDay" });
  assert.equal(byDay.ranked[0], byProfit.ranked[0], "local wins on fees and on speed at these shipped defaults");
  assert.notDeepEqual(byDay.ranked, byProfit.ranked, "the rest of the order still reflects each channel's own pace");
  assert.equal(byProfit.speedChangesTheAnswer, false, "the winner does not change, so there is nothing to call out");
});

test("profit per day and cash turnover divide by the holding period", () => {
  const result = calculateChannel({ ...preset("ebay"), daysToSell: 10 }, shared);
  close(result.profitPerDay, result.profit / 10, "profit per day");
  close(result.cashTurnsPerYear, 36.5, "cash turns per year");
});

test("no holding period is unknown, not instant", () => {
  const result = calculateChannel({ ...preset("ebay"), daysToSell: 0 }, shared);
  assert.equal(result.profitPerDay, null);
  assert.equal(result.cashTurnsPerYear, null);
});

test("turnover is a count of loops, not an annualised percentage", () => {
  // A three-day flip annualises to four figures; stating it as a rate would
  // read as a promise the tool cannot make. The count says the same thing.
  const result = calculateChannel({ ...preset("ebay"), daysToSell: 3 }, shared);
  close(result.cashTurnsPerYear, 365 / 3, "cash turns per year");
  assert.equal(result.annualisedReturn, undefined, "no annualised rate is published");
});

test("a faster channel can beat a more profitable one on what the cash earns", () => {
  // eBay nets less per sale than a local sale but is given a two-day turnaround
  // against the local sale's ninety, which is the case the column exists for.
  const channels = CHANNEL_PRESETS.map((channel) => {
    if (channel.id === "ebay") return { ...channel, daysToSell: 2 };
    if (channel.id === "local") return { ...channel, daysToSell: 90 };
    return { ...channel, enabled: false };
  });
  const byProfit = compareChannels(channels, shared);
  assert.equal(byProfit.best.id, "local", "the local sale still nets more per sale");
  assert.equal(byProfit.fastestReturn.id, "ebay", "but eBay earns more per day of waiting");
  assert.equal(byProfit.speedChangesTheAnswer, true);

  const byDay = compareChannels(channels, { ...shared, rankBy: "profitPerDay" });
  assert.equal(byDay.ranked[0], "eBay");
  assert.equal(byDay.rankBy, "profitPerDay");
});

test("a channel with no holding period sorts last on speed rather than winning on an unknown", () => {
  const channels = CHANNEL_PRESETS.map((channel) => {
    if (channel.id === "ebay") return { ...channel, daysToSell: 5 };
    if (channel.id === "local") return { ...channel, daysToSell: 0 };
    return { ...channel, enabled: false };
  });
  const byDay = compareChannels(channels, { ...shared, rankBy: "profitPerDay" });
  assert.equal(byDay.ranked[0], "eBay");
  assert.equal(byDay.ranked[byDay.ranked.length - 1], "Local / direct");
});

test("with no holding period anywhere there is no speed winner to report", () => {
  const channels = CHANNEL_PRESETS.map((channel) => ({ ...channel, daysToSell: 0 }));
  const comparison = compareChannels(channels, shared);
  assert.equal(comparison.fastestReturn, null);
  assert.equal(comparison.speedChangesTheAnswer, false);
});

test("a negative holding period is rejected with the field named", () => {
  assert.throws(
    () => calculateChannel({ ...preset("ebay"), daysToSell: -3 }, shared),
    /days to sell/,
  );
});

test("ranking by profit stays the default for an unrecognised or absent mode", () => {
  assert.equal(compareChannels(CHANNEL_PRESETS, shared).rankBy, "profit");
  assert.equal(compareChannels(CHANNEL_PRESETS, { ...shared, rankBy: "nonsense" }).rankBy, "profit");
});

test("no speed upset is claimed when the profit winner was never timed", () => {
  // Regression: the callout compared the two winners' per-day figures, and the
  // profit winner's was null whenever its holding period was left blank.
  const channels = CHANNEL_PRESETS.map((channel) => {
    if (channel.id === "local") return { ...channel, daysToSell: 0 };
    if (channel.id === "ebay") return { ...channel, daysToSell: 3 };
    return { ...channel, enabled: false };
  });
  const comparison = compareChannels(channels, shared);
  assert.equal(comparison.best.id, "local", "the untimed channel still nets more per sale");
  assert.equal(comparison.fastestReturn.id, "ebay");
  assert.equal(comparison.speedChangesTheAnswer, false, "nothing to compare it against");
});

test("monthly keep is per-sale profit times the shared order volume", () => {
  const result = calculateChannel(preset("ebay"), shared);
  close(result.expectedMonthlySales, 100, "defaults to shared monthly orders");
  close(result.monthlyProfit, result.profit * 100, "100 sales of the same item");
});

test("a channel volume override is what a monthly plan is spread over", () => {
  const thin = calculateChannel({ ...preset("own-store"), expectedMonthlySales: 10 }, shared);
  close(thin.expectedMonthlySales, 10, "override wins over the shared 100");
  close(thin.fees.subscription, 3.9, "39/month over 10 own-store sales, not 100");
  close(thin.monthlyProfit, thin.profit * 10, "monthly keep uses the same 10");

  const defaulted = calculateChannel(preset("own-store"), shared);
  assert.ok(thin.profit < defaulted.profit, "thinner volume must carry more of the plan per sale");
});

test("explicit zero volume on a plan still charges the plan that month", () => {
  const idle = calculateChannel({ ...preset("own-store"), expectedMonthlySales: 0 }, shared);
  close(idle.fees.subscription, 0, "nothing to amortize onto a sale that will not happen");
  close(idle.monthlyProfit, -39, "you still pay the $39 plan");
});

test("higher volume can beat a cheaper-per-sale channel", () => {
  const comparison = compareChannels(
    [
      { ...preset("local"), shippingCharged: 0, shippingCost: 0, expectedMonthlySales: 4 },
      { ...preset("ebay"), expectedMonthlySales: 40 },
    ],
    { ...shared, shippingCharged: 0, shippingCost: 0 },
  );
  const local = comparison.results.find((result) => result.id === "local");
  const ebay = comparison.results.find((result) => result.id === "ebay");

  assert.equal(comparison.best.id, "local", "no fees still wins a single sale");
  assert.ok(local.profit > ebay.profit, "local keeps more per sale");
  assert.equal(comparison.bestMonthly.id, "ebay", "eBay keeps more in a month at 10× the volume");
  assert.equal(comparison.rankingsDiverge, true, "the two rankings must disagree");
  assert.equal(comparison.volumesDiffer, true);
  assert.ok(ebay.monthlyProfit > local.monthlyProfit, "40 eBay sales beat 4 local ones");
  assert.equal(local.isBestMonthly, false);
  assert.equal(ebay.isBestMonthly, true);
  close(ebay.monthlyGapVsBest, 0, "monthly winner gives up nothing");
  assert.ok(local.monthlyGapVsBest > 0, "local gives up monthly cash against eBay volume");
});

test("equal volumes keep the per-sale ranking as the monthly ranking", () => {
  const comparison = compareChannels(CHANNEL_PRESETS, { ...shared, includeReturns: false });
  assert.equal(comparison.rankingsDiverge, false);
  assert.equal(comparison.volumesDiffer, false);
  assert.equal(comparison.best.id, comparison.bestMonthly.id);
  const best = comparison.results.find((result) => result.isBest);
  assert.equal(best.isBestMonthly, true);
  close(comparison.monthlySpread, best.monthlyProfit - Math.min(...comparison.results.map((r) => r.monthlyProfit)), "monthly spread");
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
  close(result.profit, 26.256, "sold keep");
  // Completed sale $26.256; a return costs outbound $5 + pack $1 + return $6
  // + 10% of the $14 item that cannot be listed again = −$13.40. At 8%:
  // 0.92 × 26.256 + 0.08 × (−13.40) = 23.0835.
  close(result.returnedProfit, -13.4, "cash on a returned order");
  close(result.expectedProfit, 23.0835, "expected keep after returns");
  close(result.returnDrag, 3.1725, "returns cost $3.17 versus a perfect sale");
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
  //   sold  = $23.0835 expected keep − 12%/yr on $14 for 21 days = $22.9869
  //   unsold = −12%/yr on $14 for 90 days = −$0.4142 (no listing fee on eBay)
  //   listed = .65 × 22.9869 + .35 × (−0.4142) = $14.80
  //   shelf days = .65 × 21 + .35 × 90 = 45.15 → $9.83 per 30 days
  close(ebay.velocity.listedValue, 14.7965, "eBay listing value");
  close(ebay.velocity.valuePer30Days, 9.8315, "eBay per 30 days of shelf");
  close(etsy.expectedProfit, 26.7112, "Etsy keeps more per completed sale");
  close(etsy.velocity.valuePer30Days, 3.5867, "Etsy earns far less per month of shelf");
  close(etsy.sellThroughToMatchBest, 71.9179, "Etsy needs 71.9% sell-through to match eBay");
});

test("Discogs: 9% commission on item plus shipping, processing on the same total, off by default", () => {
  const discogs = preset("discogs");
  assert.equal(discogs.enabled, false);
  const result = calculateChannel(discogs, shared);
  close(result.fees.commission, 54 * 0.09, "commission includes buyer-paid shipping");
  close(result.fees.payment, 54 * 0.029 + 0.3, "processing on item plus shipping");
});
