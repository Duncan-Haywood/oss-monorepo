import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyFeePreset,
  breakEvenPrice,
  calculateOrder,
  compareFeeSchedules,
  compareOrganicVsAffiliate,
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
