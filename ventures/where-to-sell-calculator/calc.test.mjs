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
  close(comparison.spread, best.profit - Math.min(...comparison.results.map((r) => r.profit)), "spread");
});

test("price to match the best channel actually matches it", () => {
  const comparison = compareChannels([preset("ebay"), preset("etsy")], shared);
  const loser = comparison.results.find((result) => !result.isBest);
  const repriced = calculateChannel({ ...preset(loser.id), price: loser.priceToMatchBest }, shared);
  close(repriced.profit, comparison.best.profit, "repriced profit matches the winner");
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
  const comparison = compareChannels(CHANNEL_PRESETS, shared);
  const feeBest = comparison.results.find((result) => result.isBest);
  const velocityBest = comparison.results.find((result) => result.isBestOnVelocity);

  assert.equal(comparison.best.id, feeBest.id);
  assert.equal(comparison.bestOnVelocity.id, velocityBest.id);
  assert.ok(velocityBest.profitPerDay !== null, "illustrative days produce a pace");
  assert.ok(
    comparison.results.every((result) => result.gapVsBestPerDay === null || result.gapVsBestPerDay >= -0.0001),
    "no channel can beat the velocity winner on profit per day",
  );

  // Local keeps the most per sale (no fees) but the illustrative Amazon
  // sell-through is fast enough that cash per day ranks a marketplace first.
  // That split is the reason this column exists: fee-best is not always
  // the listing a seller should wait on.
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
