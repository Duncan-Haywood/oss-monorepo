import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCategoryPreset,
  applyStoragePreset,
  calculateListing,
  CATEGORY_PRESETS,
  classifySizeTier,
  compareCoupons,
  couponDiscount,
  couponedListing,
  couponSummary,
  cubicFeet,
  DEFAULT_COUPON_FEE,
  defaultFulfillmentFee,
  STORAGE_PRESETS,
} from "./calc.mjs";

const near = (actual, expected, msg) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${msg}: ${actual} vs ${expected}`);

const base = {
  salePrice: 29.99,
  referralRate: 15,
  length: 8,
  width: 6,
  height: 2,
  weightLb: 0.75,
  costOfGoods: 8,
  inboundPerUnit: 1.2,
  monthsInStorage: 1,
  storageRate: 0.87,
  fbmShippingCost: 4.75,
  packagingCost: 0.6,
  otherCost: 0,
  adsPerUnit: 0,
  monthlySellerFee: 39.99,
  monthlyUnits: 80,
  targetMargin: 30,
  fulfillmentMethod: "fba",
};

test("classifies Amazon size tiers from dimensions and weight", () => {
  assert.equal(
    classifySizeTier({ length: 8, width: 6, height: 0.5, weightLb: 0.4 }),
    "small_standard",
  );
  assert.equal(
    classifySizeTier({ length: 12, width: 10, height: 6, weightLb: 2 }),
    "large_standard",
  );
  assert.equal(
    classifySizeTier({ length: 24, width: 16, height: 10, weightLb: 12 }),
    "large_bulky",
  );
  assert.equal(
    classifySizeTier({ length: 60, width: 20, height: 20, weightLb: 30 }),
    "extra_large",
  );
});

test("computes cubic feet from inches", () => {
  near(cubicFeet({ length: 12, width: 12, height: 12 }), 1, "1 cubic foot");
});

test("uses illustrative fulfillment bands for small and large standard", () => {
  near(defaultFulfillmentFee("small_standard", 0.2), 3.06, "4 oz");
  near(defaultFulfillmentFee("small_standard", 0.9), 3.47, "14.4 oz");
  near(defaultFulfillmentFee("large_standard", 1), 4.4, "16 oz");
  near(defaultFulfillmentFee("large_standard", 6), 6.44 + 4 * 0.16, "6 lb");
  near(defaultFulfillmentFee("large_bulky", 2), 9.61, "bulky base");
  near(defaultFulfillmentFee("extra_large", 5), 26.33, "XL base");
});

test("computes FBA fees, storage, profit, margin and ROI", () => {
  const r = calculateListing(base);
  const cuFt = (8 * 6 * 2) / 1728;
  const storage = cuFt * 0.87;
  const allocated = 39.99 / 80;
  const fulfillment = defaultFulfillmentFee("large_standard", 0.75);
  const referral = 29.99 * 0.15;
  const cash = 8 + 0.6 + 0 + 0 + allocated + 1.2 + storage;

  assert.equal(r.sizeTier, "large_standard");
  near(r.cubicFeet, cuFt, "cu ft");
  near(r.storagePerUnit, storage, "storage");
  near(r.fba.fees.referral, referral, "referral");
  near(r.fba.fees.fulfillment, fulfillment, "fulfillment");
  near(r.fba.cashInvested, cash, "FBA cash");
  near(r.fba.profit, 29.99 - referral - fulfillment - cash, "FBA profit");
  near(r.fba.margin, ((29.99 - referral - fulfillment - cash) / 29.99) * 100, "margin");
  near(r.fba.roi, ((29.99 - referral - fulfillment - cash) / cash) * 100, "ROI");
  assert.equal(r.selected.profit, r.fba.profit);
});

test("FBM drops fulfillment and storage/inbound, and uses the seller's own label", () => {
  const r = calculateListing({ ...base, fulfillmentMethod: "fbm" });
  const allocated = 39.99 / 80;
  const referral = 29.99 * 0.15;
  const cash = 8 + 0.6 + allocated + 4.75;
  near(r.fbm.fees.fulfillment, 0, "no FBA fulfillment");
  near(r.fbm.fees.referral, referral, "same referral");
  near(r.fbm.cashInvested, cash, "FBM cash");
  near(r.fbm.profit, 29.99 - referral - cash, "FBM profit");
  assert.equal(r.selected.profit, r.fbm.profit);
});

test("reports which path leaves more on the same listing", () => {
  const r = calculateListing(base);
  near(r.fbaAdvantage, r.fba.profit - r.fbm.profit, "advantage");
  assert.ok(["fba", "fbm", "tie"].includes(r.cheaperPath));
  assert.equal(r.cheaperPath, r.fbaAdvantage > 0 ? "fba" : r.fbaAdvantage < 0 ? "fbm" : "tie");
});

test("break-even sale price makes profit exactly zero on the selected path", () => {
  const r = calculateListing(base);
  const atBreakEven = calculateListing({ ...base, salePrice: r.selected.breakEvenPrice });
  near(atBreakEven.selected.profit, 0, "profit at break-even price");
});

test("break-even buy cost makes profit exactly zero when used as cost of goods", () => {
  const r = calculateListing(base);
  const atBuy = calculateListing({ ...base, costOfGoods: r.selected.breakEvenBuyCost });
  near(atBuy.selected.profit, 0, "profit at max buy cost");
});

test("calculates the sale price required for a target net margin", () => {
  const r = calculateListing({ ...base, monthlySellerFee: 0, targetMargin: 30 });
  const atTarget = calculateListing({
    ...base,
    monthlySellerFee: 0,
    targetMargin: 30,
    salePrice: r.selected.targetMarginPrice,
  });
  near(atTarget.selected.margin, 30, "margin at target price");
});

test("reports an unreachable target margin when referral leaves no room", () => {
  const r = calculateListing({ ...base, referralRate: 80, targetMargin: 30 });
  assert.equal(r.selected.targetMarginPrice, Infinity);
});

test("ROI is null when no cash was invested", () => {
  const r = calculateListing({
    salePrice: 20,
    costOfGoods: 0,
    inboundPerUnit: 0,
    monthsInStorage: 0,
    fbmShippingCost: 0,
    packagingCost: 0,
    otherCost: 0,
    adsPerUnit: 0,
    monthlySellerFee: 0,
    fulfillmentFee: 0,
    sizeTier: "small_standard",
    fulfillmentMethod: "fbm",
  });
  assert.equal(r.selected.roi, null);
});

test("margin is zero rather than NaN when the sale price is zero", () => {
  const r = calculateListing({ ...base, salePrice: 0, monthlySellerFee: 0 });
  assert.equal(r.selected.margin, 0);
});

test("honors an explicit fulfillment-fee override", () => {
  const r = calculateListing({ ...base, fulfillmentFee: 4.25 });
  near(r.fulfillmentFee, 4.25, "override");
  near(r.fba.fees.fulfillment, 4.25, "used in FBA");
  assert.ok(r.suggestedFulfillment !== 4.25);
});

test("applyCategoryPreset and applyStoragePreset fill illustrative rates", () => {
  const clothing = applyCategoryPreset({ salePrice: 40 }, "clothing");
  assert.equal(clothing.referralRate, CATEGORY_PRESETS.clothing.referralRate);
  const peak = applyStoragePreset({}, "peak");
  assert.equal(peak.storageRate, STORAGE_PRESETS.peak.perCuFt);
});

test("coupon discount stacks percent and a fixed amount, and never exceeds the list price", () => {
  near(couponDiscount({ salePrice: 29.99, couponPercent: 15 }), 4.4985, "15%");
  near(couponDiscount({ salePrice: 29.99, couponPercent: 0, couponFixed: 5 }), 5, "fixed");
  near(couponDiscount({ salePrice: 29.99, couponPercent: 10, couponFixed: 2 }), 4.999, "stack");
  near(couponDiscount({ salePrice: 8, couponPercent: 50, couponFixed: 10 }), 8, "capped");
});

test("couponed listing cuts referral on the buyer price and subtracts the redemption fee from profit", () => {
  const list = calculateListing(base);
  const couponed = couponedListing(base, { couponPercent: 15, couponFee: 0.6 });
  const buyerPays = 29.99 - 4.4985;
  near(couponed.buyerPays, buyerPays, "buyer pays");
  near(couponed.referral, buyerPays * 0.15, "referral on discounted price");
  near(couponed.fulfillment, list.fba.fees.fulfillment, "fulfillment unchanged");
  near(couponed.cashInvested, list.fba.cashInvested, "cash unchanged");
  near(couponed.profit, list.fba.profit - 4.4985 + (4.4985 - buyerPays * 0.15) - 0.6, "profit after discount, lower referral, fee");
  near(couponed.profit, buyerPays - buyerPays * 0.15 - list.fba.fees.fulfillment - 0.6 - list.fba.cashInvested, "recomputed");
});

test("compareCoupons shows standard percents and the typed offer against list", () => {
  const comparison = compareCoupons({
    ...base,
    couponPercent: 15,
    couponFixed: 0,
    couponFee: DEFAULT_COUPON_FEE,
  });
  assert.deepEqual(
    comparison.rows.map((row) => row.label),
    ["No coupon", "5% coupon", "10% coupon", "15% coupon", "20% coupon"],
  );
  assert.equal(comparison.typed.isCurrent, true);
  assert.equal(comparison.typed.couponPercent, 15);
  assert.equal(comparison.cheaper, "list");
  near(comparison.none.profit, calculateListing(base).fba.profit, "list row");
  near(comparison.typed.profitDelta, comparison.typed.profit - comparison.none.profit, "delta");

  // Worked example locked for the SEO page: $29.99 home listing, 15% referral,
  // large-standard FBA, $0.60 redemption fee. A 15% coupon leaves about $4.42
  // less per unit; matching the 80-unit list month needs a ~67% volume lift.
  near(comparison.none.profit, 10.993291666666668, "list profit");
  near(comparison.typed.buyerPays, 25.4915, "15% buyer pays");
  near(comparison.typed.profit, 6.569566666666667, "15% profit");
  near(comparison.typed.profitDelta, -4.423725, "15% vs list");
  near(
    comparison.breakEvenUnits,
    (comparison.none.profit * 80) / comparison.typed.profit,
    "units to match list month",
  );
  assert.ok(comparison.breakEvenUnits > 133.8 && comparison.breakEvenUnits < 134);
  assert.ok(comparison.liftPctNeeded > 67 && comparison.liftPctNeeded < 68);
  assert.equal(comparison.typed.hitsTarget, false);
  assert.equal(comparison.none.hitsTarget, true);
});

test("a custom fixed-off coupon is appended instead of replacing a standard row", () => {
  const comparison = compareCoupons({ ...base, couponPercent: 0, couponFixed: 5, couponFee: 0.6 });
  assert.equal(comparison.rows.length, 6);
  assert.equal(comparison.typed.label, "$5.00 off coupon");
  assert.equal(comparison.typed.isCustom, true);
  near(comparison.typed.buyerPays, 24.99, "buyer pays");
});

test("zero coupon fee on the list row; a 0% coupon with no $ off charges nothing", () => {
  const comparison = compareCoupons({ ...base, couponPercent: 0, couponFixed: 0, couponFee: 0.6 });
  near(comparison.none.couponFee, 0, "list fee");
  near(comparison.typed.profit, comparison.none.profit, "typed is list");
  assert.equal(comparison.cheaper, "tie");
});

test("an unprofitable coupon cannot recover the month with more volume", () => {
  const comparison = compareCoupons({
    ...base,
    couponPercent: 80,
    couponFee: 0.6,
  });
  assert.ok(comparison.none.profit > 0, "list still pays");
  assert.ok(comparison.typed.profit < 0, "80% coupon does not");
  assert.equal(comparison.breakEvenUnits, Infinity);
  assert.match(couponSummary(comparison), /cannot recover/i);
});

test("expected lift is compared to the list-price month, not to itself", () => {
  const comparison = compareCoupons({
    ...base,
    couponPercent: 15,
    couponFee: 0.6,
    couponLiftPct: 80,
  });
  near(comparison.liftedUnits, 144, "80% lift");
  near(comparison.liftedMonthlyProfit, comparison.typed.profit * 144, "lifted month");
  assert.equal(comparison.liftBeatsList, comparison.liftedMonthlyProfit > comparison.listMonthlyProfit);
  assert.match(couponSummary(comparison), /80%/);
});

test("couponSummary names the buyer price, the fee, and the lift needed", () => {
  const text = couponSummary(compareCoupons({ ...base, couponPercent: 15, couponFee: 0.6 }));
  assert.match(text, /\$25\.49/);
  assert.match(text, /\$0\.60/);
  assert.match(text, /133\.9 couponed sales/);
  assert.match(text, /67% lift/);
});

test("rejects a coupon percent above 100", () => {
  assert.throws(() => couponDiscount({ salePrice: 10, couponPercent: 101 }), /at most 100/);
});

test("rejects unknown presets and invalid inputs", () => {
  assert.throws(() => applyCategoryPreset({}, "widgets"), /Unknown Amazon category/);
  assert.throws(() => applyStoragePreset({}, "summer"), /Unknown storage season/);
  assert.throws(() => calculateListing({ salePrice: -1 }), /Sale price/);
  assert.throws(() => calculateListing({ salePrice: "abc" }), /Sale price/);
  assert.throws(() => calculateListing({ salePrice: 10, targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateListing({ salePrice: 10, fulfillmentMethod: "sfp" }), /fba or fbm/);
  assert.throws(
    () => calculateListing({ salePrice: 10, monthlySellerFee: 39.99, monthlyUnits: 0 }),
    /Monthly units/,
  );
  assert.throws(() => defaultFulfillmentFee("envelope", 1), /Unknown size tier/);
});
