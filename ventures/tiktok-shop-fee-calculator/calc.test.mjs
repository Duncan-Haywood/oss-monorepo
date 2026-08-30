import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyFeePreset,
  breakEvenPrice,
  bundleDiscountNote,
  calculateOrder,
  compareBundleDiscount,
  compareFeeSchedules,
  compareFreeShipping,
  compareOrganicVsAffiliate,
  extraOrdersToMatch,
  feeChangeImpact,
  feeChangeNote,
  freeShippingNote,
  DAYS_PER_MONTH,
  FEE_SCHEDULE_PRESETS,
  maxBuyCost,
  priceForTargetMargin,
} from "./calc.mjs";

const near = (actual, expected, msg) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${msg}: ${actual} vs ${expected}`);

const sample = () => ({
  itemPrice: 19.99,
  shippingCharged: 0,
  platformDiscount: 0,
  tax: 0,
  quantity: 1,
  cogs: 5.5,
  fulfillmentCost: 4.28,
  otherPerOrder: 0.4,
  adSpend: 1.5,
  referralRate: 6,
  paymentRate: 0,
  paymentFixed: 0,
  facilitationRate: 0,
  affiliateRate: 15,
  affiliateOnItemOnly: true,
  affiliateRefundedOnReturn: false,
  returnRate: 12,
  unsellableRate: 80,
  returnShipping: 0,
  refundAdminRate: 20,
  refundAdminCap: 5,
  targetMargin: 25,
  unitsPerDay: 8,
});

test("US standard preset is a unified 6% referral with no separate processing", () => {
  const preset = FEE_SCHEDULE_PRESETS.us_standard;
  assert.equal(preset.referralRate, 6);
  assert.equal(preset.paymentRate, 0);
  assert.equal(preset.facilitationRate, 0);
});

test("October 2026 preset raises referral and adds affiliate facilitation", () => {
  const preset = FEE_SCHEDULE_PRESETS.oct_2026;
  assert.equal(preset.referralRate, 8);
  assert.equal(preset.facilitationRate, 1.5);
});

test("applyFeePreset overwrites only the published-rate fields", () => {
  const applied = applyFeePreset(sample(), "oct_2026");
  assert.equal(applied.referralRate, 8);
  assert.equal(applied.facilitationRate, 1.5);
  assert.equal(applied.affiliateRate, 15);
  assert.equal(applied.cogs, 5.5);
});

test("a kept organic order is revenue minus referral, goods, fulfill, pack and ads", () => {
  const result = calculateOrder({ ...sample(), affiliateRate: 0, returnRate: 0 });
  const referral = 19.99 * 0.06;
  const kept = 19.99 - referral - 5.5 - 4.28 - 0.4 - 1.5;
  near(result.referralFee, referral, "referral");
  near(result.affiliateFee, 0, "no affiliate");
  near(result.facilitationFee, 0, "no facilitation on organic");
  near(result.keptProfit, kept, "kept profit");
  near(result.expectedProfit, kept, "no returns");
  near(result.expectedMargin, (kept / 19.99) * 100, "margin on kept revenue");
});

test("affiliate commission is taken on item price, not shipping, by default", () => {
  const withShip = calculateOrder({
    ...sample(),
    shippingCharged: 4.99,
    returnRate: 0,
  });
  near(withShip.affiliateFee, 19.99 * 0.15, "15% of item only");
  near(withShip.revenue, 19.99 + 4.99, "buyer paid item plus postage");
  near(withShip.feeBase, 19.99 + 4.99, "fee base includes shipping charged");
  near(withShip.referralFee, (19.99 + 4.99) * 0.06, "referral on fee base");
});

test("affiliate can be applied to the full customer payment when asked", () => {
  const result = calculateOrder({
    ...sample(),
    shippingCharged: 4.99,
    affiliateOnItemOnly: false,
    returnRate: 0,
  });
  near(result.affiliateFee, (19.99 + 4.99) * 0.15, "15% of item plus postage");
});

test("creator facilitation only applies to affiliate-sourced orders", () => {
  const organic = calculateOrder({
    ...sample(),
    affiliateRate: 0,
    facilitationRate: 1.5,
    returnRate: 0,
  });
  const affiliate = calculateOrder({
    ...sample(),
    facilitationRate: 1.5,
    returnRate: 0,
  });
  near(organic.facilitationFee, 0, "organic pays no facilitation");
  near(affiliate.facilitationFee, 19.99 * 0.015, "affiliate pays 1.5%");
});

test("forceAffiliate charges facilitation even at a 0% creator rate", () => {
  const result = calculateOrder({
    ...sample(),
    affiliateRate: 0,
    forceAffiliate: true,
    facilitationRate: 1.5,
    returnRate: 0,
  });
  assert.equal(result.isAffiliate, true);
  near(result.facilitationFee, 19.99 * 0.015, "facilitation on forced affiliate");
  near(result.affiliateFee, 0, "no creator cut");
});

test("expected profit mixes kept and returned paths at the return rate", () => {
  const result = calculateOrder(sample());
  const referral = 19.99 * 0.06;
  const affiliate = 19.99 * 0.15;
  const kept =
    19.99 - referral - affiliate - 5.5 - 4.28 - 0.4 - 1.5;
  const admin = Math.min(5, referral * 0.2);
  const returned = 0 - admin - affiliate - 5.5 * 0.8 - 4.28 - 0.4 - 1.5;
  near(result.keptProfit, kept, "kept");
  near(result.returnedProfit, returned, "returned");
  near(result.adminOnReturn, admin, "refund admin");
  near(result.expectedProfit, 0.88 * kept + 0.12 * returned, "expected");
});

test("affiliate commission kept on a return is the default, and it is the trap", () => {
  const keptByCreator = calculateOrder(sample());
  const clawedBack = calculateOrder({ ...sample(), affiliateRefundedOnReturn: true });
  assert.ok(
    keptByCreator.returnedProfit < clawedBack.returnedProfit,
    "leaving the creator commission on a return costs the seller more",
  );
  near(keptByCreator.affiliateOnReturn, 19.99 * 0.15, "creator keeps 15%");
  near(clawedBack.affiliateOnReturn, 0, "clawed back");
});

test("refund admin fee is 20% of referral, capped per unit", () => {
  const cheap = calculateOrder({ ...sample(), itemPrice: 5, returnRate: 100 });
  const expensive = calculateOrder({ ...sample(), itemPrice: 500, returnRate: 100 });
  near(cheap.adminOnReturn, 5 * 0.06 * 0.2, "under the $5 cap");
  near(expensive.adminOnReturn, 5, "hits the $5 cap");
});

test("organic vs affiliate comparison holds every other assumption still", () => {
  const { organic, affiliate, affiliateCostsExtra } = compareOrganicVsAffiliate(sample());
  assert.equal(organic.affiliateFee, 0);
  assert.ok(affiliate.affiliateFee > 0);
  near(affiliateCostsExtra, organic.expectedProfit - affiliate.expectedProfit, "delta");
  assert.ok(affiliateCostsExtra > 0, "affiliate costs extra on this SKU");
});

test("October 2026 announced rates cost more on an affiliate order than mid-2026", () => {
  const { current, upcoming, extraCost } = compareFeeSchedules(sample());
  near(current.referralFee, 19.99 * 0.06, "current referral");
  near(upcoming.referralFee, 19.99 * 0.08, "upcoming referral");
  near(upcoming.facilitationFee, 19.99 * 0.015, "upcoming facilitation");
  assert.ok(extraCost > 0, "the announced schedule leaves less");
});

test("monthly roll-up uses 365/12 days, not a flat 30", () => {
  const result = calculateOrder(sample());
  near(result.monthlyOrders, 8 * DAYS_PER_MONTH, "orders");
  near(result.monthlyProfit, result.expectedProfit * 8 * DAYS_PER_MONTH, "profit");
});

test("break-even price drives expected profit to zero", () => {
  const price = breakEvenPrice(sample());
  assert.ok(price !== null);
  const at = calculateOrder({ ...sample(), itemPrice: price });
  near(at.expectedProfit, 0, "break-even");
});

test("target-margin price produces at least that margin on expected kept revenue", () => {
  const price = priceForTargetMargin(sample());
  assert.ok(price !== null);
  const at = calculateOrder({ ...sample(), itemPrice: price });
  assert.ok(at.expectedMargin + 1e-6 >= 25, `margin was ${at.expectedMargin}`);
});

test("max buy cost is the COGS that drives expected profit to zero", () => {
  const buy = maxBuyCost(sample());
  const at = calculateOrder({ ...sample(), cogs: buy });
  near(at.expectedProfit, 0, "max buy");
  const over = calculateOrder({ ...sample(), cogs: buy + 0.05 });
  assert.ok(over.expectedProfit < 0, "a penny more loses money");
});

test("max buy cost is null when even free goods lose money", () => {
  // Fulfilment plus ads exceed what the item can ever keep, so no COGS clears.
  const neverClears = {
    ...sample(),
    itemPrice: 8,
    cogs: 2,
    fulfillmentCost: 6.5,
    adSpend: 3,
  };

  // Establish the premise from calculateOrder directly, not from the function
  // under test: a free unit is still a loss here.
  const free = calculateOrder({ ...neverClears, cogs: 0 });
  assert.ok(free.expectedProfit < 0, "premise: free goods already lose money");

  assert.equal(maxBuyCost(neverClears), null);

  // The pre-fix value was 0, which read as "pay up to $0.00 and you break
  // even". Guard the actual falsehood, not just the sentinel.
  assert.ok(
    calculateOrder({ ...neverClears, cogs: 0 }).expectedProfit < 0,
    "0 would have been a false ceiling",
  );
});

test("max buy cost of exactly zero stays 0, not null", () => {
  // A SKU that breaks even precisely at free goods has a real $0.00 ceiling.
  // It must stay distinguishable from "no cost clears this".
  const atZero = { ...sample(), cogs: 0 };
  const tuned = {
    ...atZero,
    fulfillmentCost: atZero.fulfillmentCost + calculateOrder(atZero).expectedProfit,
  };
  near(calculateOrder(tuned).expectedProfit, 0, "premise: breaks even at zero COGS");

  const buy = maxBuyCost(tuned);
  assert.notEqual(buy, null, "a genuine zero ceiling is not 'unreachable'");
  near(buy, 0, "ceiling is $0.00");
});

test("a 100% return rate with unsellable goods and kept affiliate is a loss", () => {
  const result = calculateOrder({ ...sample(), returnRate: 100 });
  assert.equal(result.belowBreakEven, true);
  assert.ok(result.expectedProfit < 0);
  near(result.expectedRevenue, 0, "everything came back");
  assert.equal(result.expectedMargin, null);
});

test("rejects a target margin of 100% and a negative fee base", () => {
  assert.throws(() => calculateOrder({ ...sample(), targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateOrder({ ...sample(), tax: 50 }), /Fee base cannot be negative/);
  assert.throws(() => calculateOrder({ ...sample(), quantity: 0 }), /greater than zero/);
  assert.throws(() => applyFeePreset(sample(), "not-a-schedule"), /Unknown fee schedule/);
});

test("the worked-example page uses the same SKU the calculator ships", () => {
  const page = readFileSync(new URL("./affiliate-commission-on-returns.html", import.meta.url), "utf8");
  const result = calculateOrder(sample());
  const organic = calculateOrder({ ...sample(), affiliateRate: 0 });
  assert.match(page, /\$19\.99/);
  assert.match(page, /15%/);
  assert.match(page, /12%/);
  assert.match(page, /\$4\.11/);
  assert.match(page, /\$13\.82/);
  assert.match(page, /\$1\.96/);
  const cents = (actual, expected, msg) =>
    assert.ok(Math.abs(actual - expected) < 0.005, `${msg}: ${actual} vs ${expected}`);
  cents(result.keptProfit, 4.11, "kept, rounded");
  cents(result.returnedProfit, -13.82, "returned, rounded");
  cents(result.expectedProfit, 1.96, "expected, rounded");
  cents(organic.expectedProfit, 4.96, "organic expected is the '~$5.00' on the page");
});

test("empty optional fields default instead of throwing", () => {
  const result = calculateOrder({
    itemPrice: 10,
    cogs: 2,
    referralRate: 6,
  });
  near(result.revenue, 10, "defaults");
  near(result.affiliateFee, 0, "no affiliate");
  near(result.expectedProfit, 10 - 0.6 - 2, "just referral and COGS");
});

const shipped = () => ({ ...sample(), shippingCharged: 4.99 });

test("same customer total is a referral tie but not an affiliate tie", () => {
  const comparison = compareFreeShipping(shipped());
  near(comparison.charged.result.feeBase, comparison.absorb.result.feeBase, "fee base");
  near(comparison.absorbRaisesAffiliate, 4.99 * 0.15, "commission on the moved label");
  assert.equal(comparison.referralTie, true);
  assert.ok(
    comparison.absorb.result.expectedProfit < comparison.charged.result.expectedProfit,
    "baking the label into the item pays the creator more, so leftover falls",
  );
  assert.match(freeShippingNote(comparison), /item price only/);
});

test("commission on the full customer total makes absorb a leftover tie", () => {
  const comparison = compareFreeShipping({ ...shipped(), affiliateOnItemOnly: false });
  near(comparison.absorbRaisesAffiliate, 0, "same affiliate base");
  near(
    comparison.absorb.result.expectedProfit,
    comparison.charged.result.expectedProfit,
    "same leftover when commission already sat on shipping",
  );
});

test("eating the label drops the fee base and needs extra orders to match", () => {
  const comparison = compareFreeShipping(shipped());
  assert.ok(comparison.eatLabel.result.feeBase < comparison.charged.result.feeBase);
  assert.ok(comparison.eatLabel.result.expectedProfit < comparison.charged.result.expectedProfit);
  assert.ok(comparison.extraOrdersForEat > 0);
  const extra = extraOrdersToMatch(comparison.charged.result, comparison.eatLabel.result);
  near(extra, comparison.extraOrdersForEat, "same lift helper");
});

test("a high enough free-shipping price already wins and needs no extra volume", () => {
  const comparison = compareFreeShipping({ ...shipped(), freeShipPrice: 32 });
  assert.ok(comparison.raised.result.expectedProfit > comparison.charged.result.expectedProfit);
  assert.equal(comparison.extraOrdersForRaised, 0);
  assert.equal(comparison.winner, "raised");
  assert.match(freeShippingNote(comparison), /more per order/);
});

test("a losing free-shipping path cannot catch up at a non-positive leftover", () => {
  const comparison = compareFreeShipping({
    ...shipped(),
    freeShipPrice: 1,
    returnRate: 0,
  });
  assert.ok(comparison.charged.result.expectedProfit > 0);
  assert.ok(comparison.raised.result.expectedProfit < 0);
  assert.equal(comparison.extraOrdersForRaised, null);
  assert.match(freeShippingNote(comparison), /cannot catch up/);
});

// --- the 1 Oct 2026 fee change -------------------------------------------

const feeChangeSample = () => ({
  itemPrice: 19.99,
  shippingCharged: 4.99,
  affiliateRate: 15,
  affiliateOnItemOnly: true,
  returnRate: 12,
  cogs: 5.5,
  fulfillmentCost: 4.28,
  otherPerOrder: 0.4,
  adSpend: 1.5,
  unsellableRate: 80,
  unitsPerDay: 8,
});

test("the announced schedule costs more per order and per month", () => {
  const impact = feeChangeImpact(feeChangeSample());
  assert.ok(impact.extraCostPerOrder > 0, "8% should cost more than 6%");
  assert.ok(impact.marginAfter < impact.marginBefore);
  near(
    impact.extraCostPerMonth,
    impact.extraCostPerOrder * impact.before.monthlyOrders,
    "monthly cost is the per-order cost at the stated volume",
  );
});

test("it agrees with compareFeeSchedules on the headline cost", () => {
  const input = feeChangeSample();
  near(
    feeChangeImpact(input).extraCostPerOrder,
    compareFeeSchedules(input).extraCost,
    "same arithmetic as the pairwise comparison",
  );
});

test("facilitation lands only on affiliate orders, so the two splits differ", () => {
  const impact = feeChangeImpact(feeChangeSample());
  assert.ok(
    impact.affiliate.extraCostPerOrder > impact.organic.extraCostPerOrder,
    "the 1.5% facilitation should make affiliate orders the worse hit",
  );
  assert.equal(impact.organic.after.facilitationFee, 0);
  assert.ok(impact.affiliate.after.facilitationFee > 0);
});

test("the price it names really does restore the old margin", () => {
  const input = feeChangeSample();
  const impact = feeChangeImpact(input);
  assert.ok(impact.priceToHoldMargin > impact.itemPrice, "holding margin needs a rise");
  near(impact.priceRise, impact.priceToHoldMargin - impact.itemPrice, "rise is the gap");
  const held = calculateOrder(
    applyFeePreset({ ...input, itemPrice: impact.priceToHoldMargin }, "oct_2026"),
  );
  assert.ok(
    Math.abs(held.expectedMargin - impact.heldMargin) < 1e-6,
    `relisting at the named price should land back on ${impact.heldMargin}, got ${held.expectedMargin}`,
  );
});

test("the buy-cost ceiling drops under the new schedule", () => {
  const impact = feeChangeImpact(feeChangeSample());
  assert.ok(impact.maxBuyCostAfter < impact.maxBuyCostBefore);
  near(impact.maxBuyCostBefore, maxBuyCost(applyFeePreset(feeChangeSample(), "us_standard")), "same ceiling helper");
});

test("a SKU already under water is told to clear, not to hold a margin", () => {
  const impact = feeChangeImpact({ ...feeChangeSample(), cogs: 18 });
  assert.ok(impact.marginBefore < 0, "this SKU loses money today");
  assert.equal(impact.heldMargin, null, "there is no margin worth restoring");
  assert.equal(impact.priceToHoldMargin, null);
  assert.equal(impact.stillClears, false);
  assert.equal(impact.clearedBefore, false);
  // The change must not be blamed for a loss the old schedule was already making.
  const note = feeChangeNote(impact);
  assert.match(note, /already loses money at today's rates/);
  assert.doesNotMatch(note, /stops clearing|tip this SKU/);
});

test("a SKU the change actually tips into a loss says so", () => {
  // Chosen to clear under 6% and not under 8% + 1.5%.
  const input = { ...feeChangeSample(), cogs: 11.4 };
  const impact = feeChangeImpact(input);
  assert.equal(impact.clearedBefore, true, "it cleared before the change");
  assert.equal(impact.stillClears, false, "and does not after");
  assert.match(feeChangeNote(impact), /tip this SKU from clearing to a loss/);
});

test("a seller the change does not touch is told so plainly", () => {
  // Same schedule on both sides: nothing moves, and the note must not invent
  // a price rise to sell.
  const impact = feeChangeImpact(feeChangeSample(), "us_standard", "us_standard");
  near(impact.extraCostPerOrder, 0, "no change means no cost");
  assert.match(feeChangeNote(impact), /costs nothing extra/);
  assert.match(feeChangeNote(impact), /nothing here to price against/);
});

test("the note names the cost, the month, and the price to relist at", () => {
  const note = feeChangeNote(feeChangeImpact(feeChangeSample()));
  assert.match(note, /more per order/);
  assert.match(note, /a month/);
  assert.match(note, /holds your/);
});

test("an unknown schedule id is rejected on both sides", () => {
  assert.throws(() => feeChangeImpact(feeChangeSample(), "nope"), /Unknown fee schedule/);
  assert.throws(() => feeChangeImpact(feeChangeSample(), "us_standard", "nope"), /Unknown fee schedule/);
});

test("every preset carries a short label for the comparison table", () => {
  for (const [id, preset] of Object.entries(FEE_SCHEDULE_PRESETS)) {
    assert.equal(typeof preset.short, "string", `${id} has no short label`);
    assert.ok(preset.short.length > 0 && preset.short.length <= 32, `${id}: ${preset.short}`);
  }
});

// --- bundling N units into one discounted order -------------------------

test("at zero discount, bundling saves exactly the per-order costs paid once instead of twice", () => {
  // With no returns, every fee that scales with quantity (referral, payment
  // percentage, facilitation, affiliate, COGS, fulfillment, ads) cancels out
  // of the bundle-vs-separate difference exactly, leaving only the two costs
  // `calculateOrder` charges once per order regardless of quantity:
  // `paymentFixed` and `otherPerOrder`.
  const input = { ...sample(), returnRate: 0, paymentRate: 2, paymentFixed: 0.3 };
  const comparison = compareBundleDiscount({ ...input, bundleQuantity: 2, bundleDiscountPct: 0 });
  near(comparison.bundleGain, input.paymentFixed + input.otherPerOrder, "saved fixed costs");
  assert.equal(comparison.winner, "bundle");
});

test("a steep discount can flip the bundle behind separate orders", () => {
  const comparison = compareBundleDiscount({
    ...sample(),
    bundleQuantity: 2,
    bundleDiscountPct: 40,
  });
  assert.equal(comparison.winner, "separate");
  assert.ok(comparison.bundleGain < 0);
  assert.ok(comparison.breakEvenDiscountPct !== null);
  assert.ok(
    comparison.breakEvenDiscountPct < 40,
    "the discount that matches separate orders must be shallower than a losing one",
  );
  assert.match(bundleDiscountNote(comparison), /Dropping the discount to about/);
});

test("bundle-discount note names the winner in both directions", () => {
  const winning = compareBundleDiscount({ ...sample(), bundleQuantity: 2, bundleDiscountPct: 1 });
  assert.equal(winning.winner, "bundle");
  assert.match(bundleDiscountNote(winning), /keeps .* more than 2 separate full-price orders/);

  const losing = compareBundleDiscount({ ...sample(), bundleQuantity: 2, bundleDiscountPct: 40 });
  assert.match(bundleDiscountNote(losing), /keeps .* less than 2 separate full-price orders/);
});

test("bundle quantity below 2 is rejected", () => {
  assert.throws(
    () => compareBundleDiscount({ ...sample(), bundleQuantity: 1 }),
    /Bundle quantity must be at least 2/,
  );
});

test("a discount of 100% or more is rejected", () => {
  assert.throws(
    () => compareBundleDiscount({ ...sample(), bundleDiscountPct: 100 }),
    /Bundle discount must be less than 100%/,
  );
});

test("break-even discount matches the point where bundling stops winning", () => {
  const comparison = compareBundleDiscount({ ...sample(), bundleQuantity: 2, bundleDiscountPct: 40 });
  const atBreakEven = compareBundleDiscount({
    ...sample(),
    bundleQuantity: 2,
    bundleDiscountPct: comparison.breakEvenDiscountPct,
  });
  near(atBreakEven.bundle.expectedProfit, atBreakEven.separateTotal, "break-even ties the two paths");
});
