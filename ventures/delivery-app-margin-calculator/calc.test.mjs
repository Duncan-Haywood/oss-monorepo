import assert from "node:assert/strict";
import { test } from "node:test";
import { CHANNEL_PRESETS, calculateChannel, compareChannels } from "./calc.mjs";

const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 0.005, `${message}: expected ~${expected}, got ${actual}`);

const shared = {
  ticketPrice: 32,
  foodCost: 9.6,
  hourlyWage: 18,
  monthlyOrders: 400,
};

const preset = (id) => CHANNEL_PRESETS.find((channel) => channel.id === id);

test("dine-in: only card processing comes out of the ticket", () => {
  const result = calculateChannel(preset("dine-in"), shared);
  close(result.revenue, 32, "revenue");
  close(result.fees.commission, 0, "no marketplace commission");
  close(result.fees.payment, 32 * 0.029 + 0.3, "card processing");
  close(result.cashCosts, 9.6, "food only");
  close(result.profit, 32 - (32 * 0.029 + 0.3) - 9.6, "profit");
  close(result.laborCost, 0, "no extra labor");
  close(result.packagingCost, 0, "no packaging");
});

test("DoorDash: commission applies to the listed price and extra cash is counted", () => {
  const result = calculateChannel(preset("doordash"), shared);
  close(result.fees.commission, 32 * 0.27, "27% commission");
  close(result.fees.payment, 0, "processing bundled into commission");
  close(result.laborCost, (8 / 60) * 18, "8 minutes at $18/hr");
  close(result.packagingCost, 1.25, "packaging");
  close(result.cashCosts, 9.6 + 1.25 + 2.4, "food + pack + labor");
  close(result.profit, 32 - 8.64 - 13.25, "profit");
  close(result.monthlyFees, 8.64 * 400, "monthly fees");
  close(result.monthlyProfit, result.profit * 400, "monthly profit");
});

test("Uber Eats default commission is higher than DoorDash on the same ticket", () => {
  const dash = calculateChannel(preset("doordash"), shared);
  const uber = calculateChannel(preset("ubereats"), shared);
  close(uber.fees.commission, 32 * 0.3, "30% commission");
  assert.ok(uber.profit < dash.profit, "higher commission must leave less");
});

test("own-driver path swaps commission for a per-ticket delivery cost", () => {
  const result = calculateChannel(preset("first-party"), shared);
  close(result.fees.commission, 0, "no marketplace cut");
  close(result.deliveryCost, 4.5, "driver cost");
  close(result.fees.payment, 32 * 0.029 + 0.3, "card processing still applies");
  assert.ok(result.profit > calculateChannel(preset("doordash"), shared).profit, "own driver beats 27% on this ticket");
});

test("a marked-up delivery menu is an override, not a change to food cost", () => {
  const result = calculateChannel({ ...preset("doordash"), listedPrice: 42 }, shared);
  close(result.listedPrice, 42, "overridden price");
  close(result.fees.commission, 42 * 0.27, "commission on the listed price");
  close(result.foodCost, 9.6, "food cost unchanged");
});

test("break-even price is the listed price at which profit reaches zero", () => {
  const result = calculateChannel(preset("doordash"), shared);
  const atBreakEven = calculateChannel({ ...preset("doordash"), listedPrice: result.breakEvenPrice }, shared);
  close(atBreakEven.profit, 0, "profit at break-even");
});

test("priceForProfit round-trips through the calculator", () => {
  const result = calculateChannel(preset("doordash"), shared);
  const target = 21.172;
  const priced = calculateChannel({ ...preset("doordash"), listedPrice: result.priceForProfit(target) }, shared);
  close(priced.profit, target, "solved price leaves the target profit");
});

test("commissionToMatch is the rate that leaves a target profit at the current price", () => {
  const dash = calculateChannel(preset("doordash"), shared);
  // Dine-in profit is unreachable at the same $32 listed price even at 0%
  // commission, because packaging and bagging are extra cash. Aim at a
  // profit the current ticket can still clear by lowering the rate.
  const target = dash.profit + 2;
  const rate = dash.commissionToMatch(target);
  assert.ok(rate > 0 && rate < dash.percentRate, "required rate is lower, still positive");
  const matched = calculateChannel({ ...preset("doordash"), commissionRate: rate }, shared);
  close(matched.profit, target, "solved commission leaves the target profit");
});

test("commissionToMatch is negative when extra cash alone exceeds the target gap", () => {
  const dineIn = calculateChannel(preset("dine-in"), shared);
  const dash = calculateChannel(preset("doordash"), shared);
  const rate = dash.commissionToMatch(dineIn.profit);
  assert.ok(rate < 0, "same-price dine-in match is impossible on this ticket");
});

test("pickup is cheaper than delivery apps but not free versus dine-in", () => {
  const dineIn = calculateChannel(preset("dine-in"), shared);
  const pickup = calculateChannel(preset("pickup"), shared);
  const dash = calculateChannel(preset("doordash"), shared);
  assert.ok(pickup.profit < dineIn.profit, "packaging and bagging cost something");
  assert.ok(pickup.profit > dash.profit, "pickup still beats marketplace commission");
});

test("compareChannels ranks by profit and reports the dine-in gap", () => {
  const comparison = compareChannels(CHANNEL_PRESETS, shared);
  assert.equal(comparison.best.id, "dine-in");
  assert.equal(comparison.ranked[0], "Dine-in");
  const dash = comparison.results.find((result) => result.id === "doordash");
  assert.ok(dash);
  assert.equal(dash.isBest, false);
  close(dash.gapVsDineIn, comparison.dineIn.profit - dash.profit, "per-ticket gap vs dine-in");
  close(dash.monthlyGapVsDineIn, dash.gapVsDineIn * 400, "monthly gap vs dine-in");
  close(dash.priceToMatchDineIn, dash.priceForProfit(comparison.dineIn.profit), "price to match dine-in");
  assert.ok(dash.markupVsDineIn > 0, "DoorDash needs a higher listed price to match dine-in");
  assert.ok(comparison.spread > 0, "paths do not all leave the same");
});

test("compareChannels reports the commission rate that would match dine-in, at the current price", () => {
  const comparison = compareChannels(CHANNEL_PRESETS, shared);
  const dineIn = comparison.results.find((result) => result.id === "dine-in");
  const dash = comparison.results.find((result) => result.id === "doordash");
  assert.equal(dineIn.commissionToMatchDineIn, null, "dine-in has nothing to solve against itself");
  assert.ok(Number.isFinite(dash.commissionToMatchDineIn), "DoorDash gets a solved commission rate");
  // On the default ticket DoorDash's own packaging and bagging minutes alone
  // already give up more than the dine-in gap, so no commission cut reaches
  // it (matches the negative-rate case covered directly on calculateChannel
  // above) -- this is the field the results table and copy summary render.
  assert.ok(dash.commissionToMatchDineIn < 0, "packaging and labor already exceed the dine-in gap at 0% commission");
});

test("compareChannels' solved commission rate round-trips when it is reachable", () => {
  // Zero out DoorDash's extra cash costs so the only gap versus dine-in is
  // the commission itself, making a positive, reachable rate exist to solve
  // for and round-trip -- the case the negative test above cannot cover.
  const leanDash = { ...preset("doordash"), packagingCost: 0, extraLaborMinutes: 0 };
  const comparison = compareChannels([preset("dine-in"), leanDash], shared);
  const dineIn = comparison.results.find((result) => result.id === "dine-in");
  const dash = comparison.results.find((result) => result.id === "doordash");
  assert.ok(dash.commissionToMatchDineIn > 0 && dash.commissionToMatchDineIn < dash.percentRate * 100);
  const matched = calculateChannel({ ...leanDash, commissionRate: dash.commissionToMatchDineIn }, shared);
  close(matched.profit, dineIn.profit, "solved commission reproduces the dine-in profit at DoorDash's own listed price");
});

test("a switched-off channel is omitted from the ranking", () => {
  const comparison = compareChannels(CHANNEL_PRESETS, shared);
  assert.ok(!comparison.results.some((result) => result.id === "other"));
});

test("switching every channel off is an error, not an empty table", () => {
  assert.throws(
    () => compareChannels(CHANNEL_PRESETS.map((channel) => ({ ...channel, enabled: false })), shared),
    /switch on at least one/i,
  );
});

test("rates that consume the whole ticket are rejected", () => {
  assert.throws(
    () => calculateChannel({ ...preset("doordash"), commissionRate: 80, paymentRate: 25 }, shared),
    /100% or more/,
  );
});

test("negative inputs are rejected", () => {
  assert.throws(() => calculateChannel(preset("dine-in"), { ...shared, foodCost: -1 }), /food cost/i);
  assert.throws(() => calculateChannel({ ...preset("doordash"), commissionRate: -2 }, shared), /commission/i);
});

test("monthly orders must be a whole number", () => {
  assert.throws(() => calculateChannel(preset("dine-in"), { ...shared, monthlyOrders: 12.5 }), /whole number/);
});

test("missing channel or empty list is rejected", () => {
  assert.throws(() => calculateChannel(null, shared), /channel is required/);
  assert.throws(() => compareChannels([], shared), /at least one channel/i);
});
