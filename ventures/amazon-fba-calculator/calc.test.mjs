import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCategoryPreset,
  applyPlacementPreset,
  applyStoragePreset,
  buyCostCheck,
  calculateListing,
  PLACEMENT_PRESETS,
  CATEGORY_PRESETS,
  classifySizeTier,
  bulkBuySummary,
  compareBulkBuy,
  compareCoupons,
  compareLowPriceFba,
  compareMcf,
  comparePrep,
  compareSellerPlans,
  compareSellerPlanVolumes,
  compareSubscribeSave,
  compareVine,
  compareAgedInventory,
  agedSurchargeMonths,
  compareHoldVsRemove,
  compareLiquidation,
  liquidationNote,
  DEFAULT_LIQUIDATION_RECOVERY_PCT,
  DEFAULT_LIQUIDATION_FEE,
  DEFAULT_ELSEWHERE_NET,
  compareInboundPlacement,
  compareReturns,
  compareStorageSeasons,
  compareSizeTierPackaging,
  compareSfp,
  sfpNote,
  compareLowInventory,
  daysOfSupply,
  defaultLowInventoryFee,
  lowInventoryNote,
  LOW_INVENTORY_THRESHOLD_DAYS,
  compareAwd,
  awdNote,
  compareRemoteFulfillment,
  remoteFulfillmentNote,
  DEFAULT_NARF_FEE,
  DEFAULT_CA_INBOUND,
  DEFAULT_NARF_TAKE_PCT,
  DEFAULT_CA_TAKE_PCT,
  DEFAULT_CA_SESSIONS,
  DEFAULT_AWD_LOT_UNITS,
  DEFAULT_AWD_HORIZON_MONTHS,
  DEFAULT_AWD_INBOUND,
  DEFAULT_AWD_STORAGE_PER_CU_FT,
  DEFAULT_AWD_TO_FBA,
  DEFAULT_YOU_HOLD_STORAGE_PER_UNIT,
  clampBoxToTier,
  nextCheaperWeightLb,
  nextLowerSizeTier,
  sizeTierPackagingNote,
  blendedStorageRate,
  storageSeasonNote,
  placementSummary,
  vineUnitCost,
  DEFAULT_VINE_UNITS,
  DEFAULT_AGED_UNITS,
  DEFAULT_AGED_SELL_THROUGH_PCT,
  DEFAULT_AGED_HORIZON_MONTHS,
  DEFAULT_AGED_AIS_PER_UNIT,
  DEFAULT_AGED_REMOVAL_FEE,
  DEFAULT_AGED_DISPOSAL_FEE,
  DEFAULT_VINE_REFERRAL_RATE,
  DEFAULT_CONVERSION_LIFT_PCT,
  DEFAULT_VINE_MONTHS,
  SELLER_PLAN_DEFAULTS,
  SELLER_PLAN_VOLUME_STEPS,
  DEFAULT_AMAZON_BAG_FEE,
  DEFAULT_AMAZON_BUBBLE_FEE,
  DEFAULT_AMAZON_LABEL_FEE,
  prepSummary,
  couponDiscount,
  couponedListing,
  couponSummary,
  subscribeSaveListing,
  subscribeSaveSummary,
  cubicFeet,
  DEFAULT_COUPON_FEE,
  defaultFulfillmentFee,
  defaultLowPriceFulfillmentFee,
  defaultMcfFee,
  lowPriceBreakEvenRaise,
  RETURN_RATE_PRESETS,
  returnsSummary,
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
  fbmHandlingCost: 0,
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

test("turns max buy cost into a sourcing checkpoint", () => {
  const result = calculateListing(base);
  const below = buyCostCheck(result, result.selected.breakEvenBuyCost - 1);
  assert.equal(below.status, "below_ceiling");
  assert.equal(below.headroom, 1);
  const above = buyCostCheck(result, result.selected.breakEvenBuyCost + 1);
  assert.equal(above.status, "above_ceiling");
  assert.equal(above.headroom, -1);
  const at = buyCostCheck(result, result.selected.breakEvenBuyCost);
  assert.equal(at.status, "at_ceiling");
});

test("a listing that already loses money at $0 cost reports above the ceiling, not at it", () => {
  // Fees and non-COGS cash costs alone exceed a $3 sale price, so no sourcing
  // cost -- not even free -- reaches break-even. The clamped display value
  // (breakEvenBuyCost) floors at $0.00, which used to make a typed cost of $0
  // read as "at the zero-profit ceiling": the same status a listing that
  // genuinely breaks even on a free unit gets. That is the wrong message --
  // this listing loses money before a unit is ever bought.
  const losing = calculateListing({ ...base, salePrice: 3, costOfGoods: 0 });
  assert.equal(losing.selected.breakEvenBuyCost, 0, "display value floors at $0");
  assert.ok(losing.selected.breakEvenBuyCostRaw < 0, "the true ceiling is negative");

  const atZeroCost = buyCostCheck(losing, 0);
  assert.equal(atZeroCost.status, "above_ceiling");
  assert.ok(atZeroCost.headroom < 0, "headroom reflects the real deficit, not 0");
  assert.equal(atZeroCost.headroom, losing.selected.breakEvenBuyCostRaw);
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

test("FBM can include optional handling labor in path cash and comparison", () => {
  const withoutLabor = calculateListing(base);
  const withLabor = calculateListing({ ...base, fbmHandlingCost: 2.5 });
  near(withLabor.fbm.cashInvested, withoutLabor.fbm.cashInvested + 2.5, "FBM cash includes labor");
  near(withLabor.fbm.profit, withoutLabor.fbm.profit - 2.5, "FBM profit includes labor");
  near(withLabor.fbm.breakEvenBuyCost, withoutLabor.fbm.breakEvenBuyCost - 2.5, "FBM max buy includes labor");
  assert.equal(withoutLabor.fbm.profit, calculateListing({ ...base, fbmHandlingCost: 0 }).fbm.profit);
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

test("break-even ACOS is the ad spend that drives profit to zero", () => {
  const r = calculateListing({ ...base, adsPerUnit: 0 });
  near(r.fba.breakEvenAds, r.fba.profit, "FBA ads headroom equals profit before ads");
  near(r.fba.breakEvenAcos, (r.fba.profit / 29.99) * 100, "FBA break-even ACOS");
  near(r.fbm.breakEvenAds, r.fbm.profit, "FBM ads headroom equals profit before ads");
  const atCap = calculateListing({ ...base, adsPerUnit: r.fba.breakEvenAds });
  near(atCap.fba.profit, 0, "FBA profit at break-even ACOS spend");
  assert.equal(atCap.fba.adsStillPay, true);
});

test("current ACOS and whether the spend still pays sit next to the cap", () => {
  const r = calculateListing({ ...base, adsPerUnit: 1.5 });
  near(r.fba.currentAcos, (1.5 / 29.99) * 100, "current ACOS");
  near(r.fba.profitBeforeAds, r.fba.profit + 1.5, "profit before ads");
  assert.equal(r.fba.adsStillPay, r.fba.profit >= 0);
  const overspend = calculateListing({ ...base, adsPerUnit: r.fba.breakEvenAds + 2 });
  assert.equal(overspend.fba.adsStillPay, false);
  assert.ok(overspend.fba.profit < 0);
});

test("target-margin ACOS leaves the requested net margin after ads", () => {
  const r = calculateListing({ ...base, adsPerUnit: 0, targetMargin: 20 });
  assert.equal(r.fba.targetMarginReachableWithAds, true);
  const atTarget = calculateListing({
    ...base,
    adsPerUnit: r.fba.targetMarginAds,
    targetMargin: 20,
  });
  near(atTarget.fba.margin, 20, "margin at target-margin ACOS");
});

test("target-margin ACOS is zero when the unit cannot hit the margin even with no ads", () => {
  const r = calculateListing({ ...base, costOfGoods: 28, adsPerUnit: 0, targetMargin: 40 });
  assert.equal(r.fba.targetMarginReachableWithAds, false);
  near(r.fba.targetMarginAcos, 0, "zero ACOS when unreachable");
});

test("ACOS is null when the sale price is zero", () => {
  const r = calculateListing({ ...base, salePrice: 0, adsPerUnit: 0 });
  assert.equal(r.fba.breakEvenAcos, null);
  assert.equal(r.fba.currentAcos, null);
});

test("target-margin buy cost preserves the selected margin", () => {
  const r = calculateListing(base);
  const atTargetBuy = calculateListing({ ...base, costOfGoods: r.selected.targetMarginBuyCost });
  near(atTargetBuy.selected.margin, base.targetMargin, "margin at target buy cost");
  assert.ok(r.selected.targetMarginBuyCost < r.selected.breakEvenBuyCost);
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

test("zero returns leave the successful-sale numbers unchanged", () => {
  const r = calculateListing({ ...base, returnRate: 0, returnHandlingFee: 3, unsellableReturnRate: 25 });
  near(r.selected.profit, r.selected.profitBeforeReturns, "expected equals kept");
  near(r.selected.returnDrag, 0, "no drag");
  near(r.fba.fees.returnHandling, 0, "no allocated handling");
});

test("expected returns reduce profit by the mix of lost sales and leftover costs", () => {
  const clean = calculateListing({ ...base, monthlySellerFee: 0, returnRate: 0 });
  const withReturns = calculateListing({
    ...base,
    monthlySellerFee: 0,
    returnRate: 10,
    returnHandlingFee: 4,
    unsellableReturnRate: 20,
  });
  const keep = clean.fba.profit;
  const cashExCogs = clean.fba.cashInvested - 8;
  const fulfillment = clean.fulfillmentFee;
  const returnProfit = 0 - fulfillment - 4 - cashExCogs - 0.2 * 8;
  const expected = 0.9 * keep + 0.1 * returnProfit;
  near(withReturns.fba.profitBeforeReturns, keep, "kept sale");
  near(withReturns.fba.profit, expected, "expected after returns");
  assert.ok(withReturns.fba.profit < keep);
  near(withReturns.fba.returnDrag, keep - expected, "drag");
  near(withReturns.fba.fees.returnHandling, 0.4, "allocated handling");
});

test("break-even return rate drives expected profit to zero", () => {
  const r = calculateListing({ ...base, monthlySellerFee: 0, returnHandlingFee: 3, unsellableReturnRate: 25 });
  assert.ok(r.selected.breakEvenReturnRate > 0);
  assert.ok(r.selected.breakEvenReturnRate < 1);
  const atEdge = calculateListing({
    ...base,
    monthlySellerFee: 0,
    returnHandlingFee: 3,
    unsellableReturnRate: 25,
    returnRate: r.selected.breakEvenReturnRate * 100,
  });
  near(atEdge.selected.profit, 0, "profit at break-even return rate");
});

test("after-returns break-even sale price and max buy still zero expected profit", () => {
  const assumptions = {
    ...base,
    monthlySellerFee: 0,
    returnRate: 12,
    returnHandlingFee: 3.5,
    unsellableReturnRate: 30,
  };
  const r = calculateListing(assumptions);
  const atPrice = calculateListing({ ...assumptions, salePrice: r.selected.breakEvenPrice });
  near(atPrice.selected.profit, 0, "profit at after-returns break-even price");
  const atBuy = calculateListing({ ...assumptions, costOfGoods: r.selected.breakEvenBuyCost });
  near(atBuy.selected.profit, 0, "profit at after-returns max buy");
});

test("after-returns target price still hits the requested margin on kept revenue", () => {
  const assumptions = {
    ...base,
    monthlySellerFee: 0,
    returnRate: 8,
    returnHandlingFee: 2,
    unsellableReturnRate: 0,
    targetMargin: 30,
  };
  const r = calculateListing(assumptions);
  const atTarget = calculateListing({ ...assumptions, salePrice: r.selected.targetMarginPrice });
  near(atTarget.selected.margin, 30, "expected margin at target price");
});

test("a fully returned resellable unit recovers cost of goods and still loses fulfillment", () => {
  const r = calculateListing({
    ...base,
    monthlySellerFee: 0,
    returnRate: 100,
    returnHandlingFee: 5,
    unsellableReturnRate: 0,
  });
  const cashExCogs = r.fba.cashInvested - 8;
  near(r.fba.profit, -r.fulfillmentFee - 5 - cashExCogs, "all returns, goods recovered");
  assert.equal(r.selected.breakEvenPrice, Infinity);
});

test("already-unprofitable listings have a zero break-even return rate", () => {
  const r = calculateListing({
    ...base,
    salePrice: 1,
    costOfGoods: 20,
    monthlySellerFee: 0,
  });
  assert.ok(r.selected.profitBeforeReturns < 0);
  assert.equal(r.selected.breakEvenReturnRate, 0);
});

test("rejects return rates above 100%", () => {
  assert.throws(() => calculateListing({ salePrice: 10, returnRate: 101 }), /cannot exceed 100/);
  assert.throws(() => calculateListing({ salePrice: 10, unsellableReturnRate: 150 }), /cannot exceed 100/);
  assert.throws(() => compareReturns({ ...base, returnRate: 101 }), /cannot exceed 100/);
});

test("return-rate sweep includes zero and the typed rate", () => {
  assert.deepEqual(RETURN_RATE_PRESETS, [0, 8, 15, 22]);
  const comparison = compareReturns({
    ...base,
    monthlySellerFee: 0,
    returnRate: 10,
    returnHandlingFee: 2.5,
    unsellableReturnRate: 20,
  });
  assert.deepEqual(comparison.rows.map((row) => row.returnRate), [0, 8, 10, 15, 22]);
  const typed = comparison.rows.find((row) => row.isCurrent);
  assert.equal(typed.returnRate, 10);
  near(typed.profit, comparison.typed.selected.profit, "typed row matches listing");
  assert.ok(comparison.rows[0].profit > typed.profit);
  assert.match(comparison.summary, /10%/);
  assert.match(returnsSummary({
    typedRate: 0,
    handling: 2.5,
    unsellable: 20,
    typed: calculateListing({ ...base, returnRate: 0 }),
  }), /completed sale/);
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

test("a coupon cannot be recovered when list price is already unprofitable too", () => {
  // Same reasoning error compareSubscribeSave's offsetUnits was fixed for:
  // a $12 listing with $8 COGS already loses money at list price, and a
  // coupon can only lose more per unit (typed.profit < none.profit < 0).
  // breakEvenUnits used to fall through to `null` ("not defined") here
  // because its gate required none.profit > 0 before ever reporting
  // Infinity -- silently hiding that no volume of couponed sales helps.
  const lowMarginBase = { ...base, salePrice: 12 };
  const comparison = compareCoupons({ ...lowMarginBase, couponPercent: 15, couponFee: 0.6 });
  assert.ok(comparison.none.profit < 0, "list price already loses money");
  assert.ok(comparison.typed.profit < comparison.none.profit, "coupon loses even more per unit");
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

const cheapSku = {
  salePrice: 9.99,
  referralRate: 15,
  length: 8,
  width: 6,
  height: 0.5,
  weightLb: 0.4,
  costOfGoods: 4,
  inboundPerUnit: 0.8,
  monthsInStorage: 1,
  storageRate: 0.87,
  fbmShippingCost: 4.75,
  packagingCost: 0.4,
  otherCost: 0,
  adsPerUnit: 0,
  monthlySellerFee: 0,
  monthlyUnits: 80,
  targetMargin: 20,
  fulfillmentMethod: "fba",
  sizeTier: "small_standard",
  fulfillmentFee: 3.47,
  lowPriceFulfillmentFee: 2.57,
  lowPriceThreshold: 10,
};

test("illustrative Low-Price FBA fees discount standard tiers only", () => {
  near(defaultLowPriceFulfillmentFee("small_standard", 0.2), 3.06 - 0.9, "4 oz cheap");
  near(defaultLowPriceFulfillmentFee("small_standard", 0.9), 3.47 - 0.9, "14.4 oz cheap");
  near(defaultLowPriceFulfillmentFee("large_standard", 1), 4.4 - 0.7, "16 oz cheap");
  near(defaultLowPriceFulfillmentFee("extra_large", 5), 26.33, "XL stays regular");
});

test("break-even raise is stay price plus the fulfillment jump after referral", () => {
  near(lowPriceBreakEvenRaise({
    stayPrice: 9.99,
    referralRate: 15,
    lowPriceFee: 2.57,
    regularFee: 3.47,
  }), 9.99 + 0.9 / 0.85, "penny-plus is not enough");
  assert.equal(
    lowPriceBreakEvenRaise({ stayPrice: 9.99, referralRate: 100, lowPriceFee: 2, regularFee: 3 }),
    Infinity,
  );
});

test("a one-cent raise above $10 loses to Low-Price FBA", () => {
  const r = compareLowPriceFba({ ...cheapSku, raisePrice: 10.01 });
  assert.equal(r.winner, "stay");
  assert.equal(r.stayPrice, 9.99);
  assert.ok(r.extraProfit < 0);
  near(r.stay.fba.fees.fulfillment, 2.57, "cheap pick fee");
  near(r.raise.fba.fees.fulfillment, 3.47, "regular pick fee");
  near(r.breakEvenRaise, 9.99 + 0.9 / 0.85, "locked break-even");
  assert.equal(r.raiseBeatsBreakEven, false);
  assert.match(r.summary, /Staying at \$9\.99/);
});

test("raising to $12 beats staying under the $10 Low-Price band", () => {
  const r = compareLowPriceFba({ ...cheapSku, raisePrice: 12 });
  assert.equal(r.winner, "raise");
  assert.ok(r.extraProfit > 0);
  assert.equal(r.raiseBeatsBreakEven, true);
  near(r.justOver.salePrice, 10.01, "penny-over row is still computed");
  assert.ok(r.justOver.fba.profit < r.stay.fba.profit, "penny-over still loses");
  assert.match(r.summary, /Listing at \$12\.00/);
});

test("dropping a $29.99 listing to $10 for cheaper fulfillment loses cash", () => {
  const r = compareLowPriceFba({
    ...base,
    fulfillmentFee: 3.47,
    lowPriceFulfillmentFee: 2.57,
    lowPriceThreshold: 10,
  });
  assert.equal(r.stayPrice, 10);
  assert.equal(r.raisePrice, 29.99);
  assert.equal(r.winner, "raise");
  assert.ok(r.extraProfit > 10, "the lost revenue dwarfs the $0.90 pick-fee save");
});

test("ineligible listings only use the regular fulfillment fee", () => {
  const r = compareLowPriceFba({
    ...cheapSku,
    raisePrice: 10.01,
    lowPriceEligible: false,
  });
  assert.equal(r.eligible, false);
  assert.equal(r.winner, "raise");
  near(r.stay.fba.fees.fulfillment, 3.47, "stay loses the cheap fee");
  assert.match(r.summary, /outside Low-Price FBA/);
});

test("rejects a stay price above the threshold or a raise that stays under it", () => {
  assert.throws(
    () => compareLowPriceFba({ ...cheapSku, lowPriceSalePrice: 10.5 }),
    /at or below the threshold/,
  );
  assert.throws(
    () => compareLowPriceFba({ ...cheapSku, raisePrice: 9.5 }),
    /greater than the low-price threshold/,
  );
  assert.throws(
    () => compareLowPriceFba({ ...cheapSku, lowPriceThreshold: 0 }),
    /greater than zero/,
  );
});

test("profit at the break-even raise matches Low-Price stay profit", () => {
  const r = compareLowPriceFba({ ...cheapSku, raisePrice: 12 });
  const atBreak = compareLowPriceFba({ ...cheapSku, raisePrice: r.breakEvenRaise });
  near(atBreak.raise.fba.profit, r.stay.fba.profit, "equal profit at break-even raise");
  assert.equal(atBreak.winner, "tie");
});

test("illustrative MCF fees add a size-tier premium to the FBA band", () => {
  near(defaultMcfFee("small_standard", 0.2), 3.06 + 2.1, "4 oz MCF");
  near(defaultMcfFee("large_standard", 0.75), 4.15 + 2.4, "12 oz MCF");
  near(defaultMcfFee("large_bulky", 2), 9.61 + 4.8, "bulky MCF");
  near(defaultMcfFee("extra_large", 5), 26.33 + 8, "XL MCF");
});

test("website + MCF skips referral, pays MCF plus card, and keeps inbound and storage", () => {
  const amazon = calculateListing(base);
  const r = compareMcf(base);
  const processor = 29.99 * 0.029 + 0.3;
  near(r.suggestedMcfFee, 6.55, "default MCF");
  near(r.mcfFee, 6.55, "used fee");
  near(r.processorFee, processor, "card");
  near(r.amazon.profit, amazon.fba.profit, "Amazon row is FBA");
  near(r.mcf.fees.referral, 0, "no Amazon referral on the website order");
  near(r.mcf.fees.fulfillment, 6.55, "MCF pick fee");
  near(r.mcf.fees.processor, processor, "card on website price");
  near(r.mcf.cashInvested, amazon.fba.cashInvested, "same warehouse cash");
  near(r.mcf.profit, 29.99 - 6.55 - processor - amazon.fba.cashInvested, "MCF profit");
});

test("website + you ship skips Amazon warehouse costs and uses the seller label", () => {
  const amazon = calculateListing(base);
  const r = compareMcf(base);
  const processor = 29.99 * 0.029 + 0.3;
  near(r.selfShip.fees.referral, 0, "no referral");
  near(r.selfShip.fees.fulfillment, 0, "no MCF");
  near(r.selfShip.cashInvested, amazon.fbm.cashInvested, "FBM-like cash");
  near(r.selfShip.profit, 29.99 - processor - amazon.fbm.cashInvested, "self-ship profit");
});

test("worked example: local stock wins, MCF still beats Amazon by skipping referral", () => {
  const r = compareMcf(base);
  assert.equal(r.winner, "self");
  assert.equal(r.mcfBeatsAmazon, true);
  near(r.amazon.profit, 10.993291666666668, "Amazon FBA");
  near(r.mcf.profit, 11.922081666666667, "MCF");
  near(r.selfShip.profit, 14.970415, "you ship");
  near(r.mcf.profitDelta, r.mcf.profit - r.amazon.profit, "MCF vs Amazon");
  near(r.breakEvenMcfFee, 7.47879, "MCF fee that matches Amazon");
  assert.match(r.summary, /you ship keeps \$14\.97/i);
  assert.match(r.summary, /\$11\.92/);
  assert.match(r.summary, /\$10\.99/);
});

test("MCF profit matches Amazon at the break-even MCF fee", () => {
  const r = compareMcf(base);
  const atBreak = compareMcf({ ...base, mcfFulfillmentFee: r.breakEvenMcfFee });
  near(atBreak.mcf.profit, r.amazon.profit, "equal at break-even MCF fee");
  assert.equal(atBreak.mcfBeatsAmazon, true);
});

test("Amazon ads stay on the Amazon row and do not tax the website paths", () => {
  const r = compareMcf({ ...base, adsPerUnit: 2 });
  const none = compareMcf(base);
  near(r.amazon.cashInvested - none.amazon.cashInvested, 2, "ads on Amazon");
  near(r.mcf.cashInvested, none.mcf.cashInvested, "MCF ignores Amazon ads");
  near(r.selfShip.cashInvested, none.selfShip.cashInvested, "you-ship ignores Amazon ads");
});

test("a removal fee is cash on the you-ship path only", () => {
  const r = compareMcf({ ...base, removalFee: 1.04 });
  const none = compareMcf(base);
  near(r.selfShip.cashInvested - none.selfShip.cashInvested, 1.04, "removal");
  near(r.mcf.profit, none.mcf.profit, "MCF unchanged");
  near(r.amazon.profit, none.amazon.profit, "Amazon unchanged");
});

test("MCF wins the table when the seller label is expensive", () => {
  const r = compareMcf({ ...base, fbmShippingCost: 12 });
  assert.equal(r.winner, "mcf");
  assert.ok(r.mcf.profit > r.selfShip.profit);
  assert.ok(r.mcf.profit > r.amazon.profit);
  assert.match(r.summary, /Website \+ MCF keeps/);
});

test("Amazon wins when MCF is expensive and you-ship has no cheap local stock", () => {
  const r = compareMcf({ ...base, mcfFulfillmentFee: 12, fbmShippingCost: 20 });
  assert.equal(r.winner, "amazon");
  assert.match(r.summary, /Amazon FBA keeps/);
});

test("website price can differ from the Amazon list price", () => {
  const r = compareMcf({ ...base, dtcSalePrice: 34.99 });
  near(r.dtcSalePrice, 34.99, "website price");
  near(r.amazon.salePrice, 29.99, "Amazon stays at list");
  near(r.mcf.salePrice, 34.99, "MCF uses website price");
  assert.ok(r.mcf.profit > compareMcf(base).mcf.profit);
});

test("rejects an impossible website card rate and unknown MCF tiers", () => {
  assert.throws(() => compareMcf({ ...base, dtcProcessorRate: 100 }), /less than 100/);
  assert.throws(() => defaultMcfFee("envelope", 1), /Unknown size tier/);
});

test("Subscribe & Save cuts referral on the buyer price and does not add a coupon fee", () => {
  const list = calculateListing(base);
  const sns = subscribeSaveListing(base, { snsPercent: 15 });
  const buyerPays = 29.99 * 0.85;
  near(sns.buyerPays, buyerPays, "buyer pays");
  near(sns.referral, buyerPays * 0.15, "referral on discounted price");
  near(sns.fulfillment, list.fba.fees.fulfillment, "fulfillment unchanged");
  near(sns.cashInvested, list.fba.cashInvested, "cash unchanged");
  near(
    sns.profit,
    buyerPays - buyerPays * 0.15 - list.fba.fees.fulfillment - list.fba.cashInvested,
    "recomputed",
  );
  const couponed = couponedListing(base, { couponPercent: 15, couponFee: 0.6 });
  near(sns.profit - couponed.profit, 0.6, "S&S is the coupon without the redemption fee");
});

test("compareSubscribeSave shows 0/5/10/15 and the mixed month at the enroll share", () => {
  const comparison = compareSubscribeSave({
    ...base,
    snsPercent: 5,
    snsEnrollPct: 40,
  });
  assert.deepEqual(
    comparison.rows.map((row) => row.label),
    ["List price", "5% S&S (1 item)", "10% S&S (5+ items)", "15% S&S (promo)"],
  );
  assert.equal(comparison.typed.isCurrent, true);
  assert.equal(comparison.typed.snsPercent, 5);
  assert.equal(comparison.cheaper, "list");
  near(comparison.none.profit, calculateListing(base).fba.profit, "list row");
  near(comparison.enrolledUnits, 32, "40% of 80");
  near(comparison.listUnits, 48, "remaining list units");
  near(
    comparison.mixedMonthlyProfit,
    48 * comparison.none.profit + 32 * comparison.typed.profit,
    "mixed month",
  );
  near(
    comparison.mixedDelta,
    32 * (comparison.typed.profit - comparison.none.profit),
    "enroll delta",
  );
  near(
    comparison.offsetUnits,
    (32 * (comparison.none.profit - comparison.typed.profit)) / comparison.typed.profit,
    "new units to offset converts",
  );

  // Worked example locked for the SEO page: $29.99 home listing, 15%
  // referral, large-standard FBA. 5% S&S leaves about $1.27 less per unit
  // than list — $0.60 more than the same 5% coupon — and 40% enroll needs
  // a handful of new S&S-only sales to hold the month.
  near(comparison.none.profit, 10.993291666666668, "list profit");
  near(comparison.typed.buyerPays, 28.4905, "5% buyer pays");
  near(comparison.typed.profit, 9.718716666666668, "5% profit");
  near(comparison.typed.profitDelta, -1.274575, "5% vs list");
  assert.equal(comparison.typed.hitsTarget, true);
  assert.ok(comparison.offsetUnits > 4.1 && comparison.offsetUnits < 4.3);
});

test("a custom Subscribe & Save percent is appended instead of replacing a standard row", () => {
  const comparison = compareSubscribeSave({ ...base, snsPercent: 8, snsEnrollPct: 40 });
  assert.equal(comparison.rows.length, 5);
  assert.equal(comparison.typed.label, "8% S&S");
  assert.equal(comparison.typed.isCustom, true);
  near(comparison.typed.buyerPays, 29.99 * 0.92, "buyer pays");
});

test("zero Subscribe & Save discount ties list and needs no offset units", () => {
  const comparison = compareSubscribeSave({ ...base, snsPercent: 0, snsEnrollPct: 40 });
  near(comparison.typed.profit, comparison.none.profit, "typed is list");
  assert.equal(comparison.cheaper, "tie");
  near(comparison.offsetUnits, 0, "no offset");
  assert.match(subscribeSaveSummary(comparison), /No Subscribe & Save discount/);
});

test("an unprofitable Subscribe & Save discount cannot be offset with more volume", () => {
  const comparison = compareSubscribeSave({
    ...base,
    snsPercent: 80,
    snsEnrollPct: 40,
  });
  assert.ok(comparison.none.profit > 0, "list still pays");
  assert.ok(comparison.typed.profit < 0, "80% S&S does not");
  assert.equal(comparison.offsetUnits, Infinity);
  assert.equal(comparison.breakEvenUnits, Infinity);
  assert.match(subscribeSaveSummary(comparison), /cannot recover/i);
});

test("Subscribe & Save cannot be offset when list price is already unprofitable too", () => {
  // A $12 listing with $8 COGS and this fee structure loses money at list
  // price already, and S&S loses more per unit (typed.profit < none.profit
  // < 0) -- confirmed by both being negative below, reconstructed straight
  // from calculateListing/subscribeSaveListing, not by calling
  // compareSubscribeSave's own offsetUnits. No amount of additional
  // S&S-only volume can close that gap, since each such sale itself loses
  // money; offsetUnits must be Infinity regardless of the list row's sign.
  const lowMarginBase = { ...base, salePrice: 12 };
  const comparison = compareSubscribeSave({ ...lowMarginBase, snsPercent: 5, snsEnrollPct: 40 });
  const listProfit = calculateListing(lowMarginBase).fba.profit;
  const snsProfit = subscribeSaveListing(lowMarginBase, { snsPercent: 5 }).profit;
  assert.ok(listProfit < 0, "list price already loses money");
  assert.ok(snsProfit < listProfit, "S&S loses even more per unit");
  near(comparison.none.profit, listProfit, "list row matches primary calc");
  near(comparison.typed.profit, snsProfit, "S&S row matches primary calc");
  assert.equal(comparison.offsetUnits, Infinity);
  // breakEvenUnits shares the same gate as offsetUnits (both flag "the
  // discounted unit itself does not pay") and used to fall through to
  // `null` ("not defined") whenever the list row was unprofitable, exactly
  // the reasoning error the comment above describes for offsetUnits.
  assert.equal(comparison.breakEvenUnits, Infinity);
  assert.match(subscribeSaveSummary(comparison), /cannot recover/i);
});

test("subscribeSaveSummary names the buyer price, the mixed month, and the offset units", () => {
  const text = subscribeSaveSummary(compareSubscribeSave({
    ...base,
    snsPercent: 5,
    snsEnrollPct: 40,
  }));
  assert.match(text, /\$28\.49/);
  assert.match(text, /40%/);
  assert.match(text, /32\.0/);
  assert.match(text, /4\.2 new S&S-only sales/);
  assert.match(text, /no coupon redemption fee/i);
});

test("rejects a Subscribe & Save percent or enroll share above 100", () => {
  assert.throws(() => subscribeSaveListing(base, { snsPercent: 101 }), /at most 100/);
  assert.throws(() => compareSubscribeSave({ ...base, snsEnrollPct: 101 }), /at most 100/);
});

test("compareBulkBuy scales MOQ storage by qty and shows leftover vs extra cash", () => {
  const comparison = compareBulkBuy({
    ...base,
    smallOrderQty: 100,
    largeOrderQty: 500,
    largeCogs: 6.5,
    largeInboundPerUnit: 0.9,
  });
  near(comparison.small.profit, 10.993291666666668, "usual PO matches listing");
  near(comparison.small.monthsInStorage, 1, "usual stay");
  near(comparison.large.monthsInStorage, 5, "5× qty sits 5× as long");
  near(comparison.large.profit, 12.59995833333333, "MOQ unit after extra storage");
  near(comparison.extraProfit, 1.606666666666662, "per-unit gain");
  near(comparison.pileDelta, 803.333333333331, "gain on the MOQ qty");
  near(comparison.extraCapital, 3335.95, "extra cash tied up");
  near(comparison.breakEvenLargeCogs, 8.106666666666662, "MOQ COGS that ties");
  near(comparison.paybackMonths, 25.953967842323724, "cash payback");
  assert.equal(comparison.winner, "large");
  assert.equal(comparison.small.hitsTarget, true);
  assert.equal(comparison.large.hitsTarget, true);
});

test("compareBulkBuy defaults the usual PO to listing COGS, inbound, and months", () => {
  const comparison = compareBulkBuy({ ...base, largeOrderQty: 500 });
  near(comparison.small.qty, 100, "default usual qty");
  near(comparison.small.costOfGoods, 8, "listing COGS");
  near(comparison.small.inboundPerUnit, 1.2, "listing inbound");
  near(comparison.large.costOfGoods, 8, "same COGS when MOQ cost is blank");
  near(comparison.large.monthsInStorage, 5, "scaled stay");
  assert.equal(comparison.winner, "small");
  near(comparison.extraProfit, -0.19333333333333513, "extra storage only");
});

test("compareBulkBuy ties when MOQ COGS is the break-even", () => {
  const priced = compareBulkBuy({
    ...base,
    smallOrderQty: 100,
    largeOrderQty: 500,
    largeCogs: 6.5,
    largeInboundPerUnit: 0.9,
  });
  const atBreak = compareBulkBuy({
    ...base,
    smallOrderQty: 100,
    largeOrderQty: 500,
    largeCogs: priced.breakEvenLargeCogs,
    largeInboundPerUnit: 0.9,
  });
  near(atBreak.extraProfit, 0, "break-even COGS ties unit profit");
  assert.equal(atBreak.winner, "tie");
});

test("compareBulkBuy honors a typed MOQ stay instead of scaling", () => {
  const comparison = compareBulkBuy({
    ...base,
    smallOrderQty: 100,
    largeOrderQty: 500,
    largeCogs: 6.5,
    largeMonthsInStorage: 1,
  });
  near(comparison.large.monthsInStorage, 1, "typed stay");
  near(comparison.extraProfit, 1.5, "COGS save only, same storage");
  assert.equal(comparison.winner, "large");
});

test("bulkBuySummary names the extra cash and the COGS that still ties", () => {
  const text = bulkBuySummary(compareBulkBuy({
    ...base,
    smallOrderQty: 100,
    largeOrderQty: 500,
    largeCogs: 6.5,
    largeInboundPerUnit: 0.9,
  }));
  assert.match(text, /\$1\.61/);
  assert.match(text, /\$803\.33/);
  assert.match(text, /\$3335\.95/);
  assert.match(text, /\$8\.11/);
  assert.match(text, /26\.0 months/);
});

test("compareBulkBuy rejects empty piles", () => {
  assert.throws(() => compareBulkBuy({ ...base, smallOrderQty: 0 }), /greater than zero/);
  assert.throws(() => compareBulkBuy({ ...base, largeOrderQty: 0 }), /greater than zero/);
});

test("comparePrep ranks you-prep against Amazon inbound prep bundles", () => {
  const comparison = comparePrep(base);
  near(comparison.diy.prepCost, 0.6, "typed you-prep");
  near(comparison.label.prepCost, DEFAULT_AMAZON_LABEL_FEE, "label default");
  near(comparison.labelBag.prepCost, DEFAULT_AMAZON_LABEL_FEE + DEFAULT_AMAZON_BAG_FEE, "label+bag");
  near(
    comparison.full.prepCost,
    DEFAULT_AMAZON_LABEL_FEE + DEFAULT_AMAZON_BAG_FEE + DEFAULT_AMAZON_BUBBLE_FEE,
    "full bundle",
  );
  near(comparison.diy.profit, 10.993291666666668, "you-prep matches listing");
  near(comparison.label.profit, 11.293291666666668, "cheaper Amazon label");
  near(comparison.labelBag.profit, 10.743291666666668, "label+bag costs more");
  near(comparison.full.profit, 9.943291666666668, "full prep costs more");
  near(comparison.label.profitDelta, 0.3, "label vs you-prep");
  near(comparison.label.monthlyDelta, 24, "80 units");
  near(comparison.labelBag.profitDelta, -0.25, "bag bundle vs you-prep");
  near(comparison.labelBag.monthlyDelta, -20, "80 units");
  near(comparison.full.profitDelta, -1.05, "full vs you-prep");
  near(comparison.full.monthlyDelta, -84, "80 units");
  near(comparison.breakEvenAmazonFee, 0.6, "Amazon can charge up to you-prep");
  assert.equal(comparison.winner, "label");
  assert.equal(comparison.quote, null);
  assert.equal(comparison.diy.hitsTarget, true);
  assert.equal(comparison.label.hitsTarget, true);
  assert.equal(comparison.labelBag.hitsTarget, true);
  assert.equal(comparison.full.hitsTarget, true);
});

test("comparePrep adds a typed Amazon shipment-preview quote", () => {
  const comparison = comparePrep({ ...base, amazonPrepFee: 0.45 });
  assert.equal(comparison.quote.label, "Your Amazon prep quote");
  near(comparison.quote.prepCost, 0.45, "typed quote");
  near(comparison.quote.profitDelta, 0.15, "quote vs you-prep");
  assert.equal(comparison.rows.length, 5);
});

test("comparePrep names you-prep the winner when Amazon bundles cost more", () => {
  const comparison = comparePrep({
    ...base,
    packagingCost: 0.2,
    amazonLabelFee: 0.4,
    amazonBagFee: 0.7,
    amazonBubbleFee: 0.9,
  });
  assert.equal(comparison.winner, "diy");
  near(comparison.label.profitDelta, -0.2, "label more than cheap DIY");
  near(comparison.labelBag.prepCost, 1.1, "typed label+bag");
});

test("comparePrep ties when Amazon prep equals you-prep", () => {
  const comparison = comparePrep({
    ...base,
    packagingCost: 0.3,
    amazonLabelFee: 0.3,
    amazonBagFee: 0.4,
    amazonBubbleFee: 0.5,
  });
  assert.equal(comparison.winner, "tie");
  near(comparison.label.profitDelta, 0, "same prep cost");
});

test("prepSummary names the label win and the bag loss on the defaults", () => {
  const text = prepSummary(comparePrep(base));
  assert.match(text, /\$0\.30/);
  assert.match(text, /\$0\.60/);
  assert.match(text, /\$24\.00/);
  assert.match(text, /\$0\.85/);
  assert.match(text, /\$0\.25/);
  assert.match(text, /80 units/);
});

test("comparePrep rejects a negative Amazon prep fee", () => {
  assert.throws(() => comparePrep({ ...base, amazonLabelFee: -0.1 }), /Amazon labeling fee/);
  assert.throws(() => comparePrep({ ...base, amazonPrepFee: -1 }), /Amazon prep quote/);
});

test("Individual vs Professional break-even is monthly fee divided by per-item fee", () => {
  const compared = compareSellerPlans(base);
  near(
    compared.breakEvenUnits,
    SELLER_PLAN_DEFAULTS.professionalMonthly / SELLER_PLAN_DEFAULTS.individualPerUnit,
    "break-even units",
  );
  near(compared.individualPerUnit, 0.99, "Individual default");
  near(compared.professionalMonthly, 39.99, "Professional default");
  near(compared.individual.allocatedSellerFee, 0.99, "Individual allocated");
  near(compared.professional.allocatedSellerFee, 39.99 / 80, "Professional allocated");
});

test("Individual keeps more per unit below the plan break-even volume", () => {
  const compared = compareSellerPlans({ ...base, monthlyUnits: 10 });
  assert.equal(compared.cheaperPlan, "individual");
  assert.ok(compared.profitDelta < 0);
  near(compared.monthlyProfitDelta, compared.profitDelta * 10, "monthly delta");
});

test("Professional keeps more per unit above the plan break-even volume", () => {
  const compared = compareSellerPlans({ ...base, monthlyUnits: 200 });
  assert.equal(compared.cheaperPlan, "professional");
  assert.ok(compared.profitDelta > 0);
  near(compared.professionalAllocatedFee, 39.99 / 200, "allocated Professional");
  near(compared.individualMonthlyFee, 0.99 * 200, "monthly Individual total");
});

test("plans tie when the account fee per unit is the same", () => {
  const compared = compareSellerPlans(
    { ...base, monthlyUnits: 40, monthlySellerFee: 39.6 },
    { individualPerUnit: 0.99, professionalMonthly: 39.6 },
  );
  assert.equal(compared.cheaperPlan, "tie");
  near(compared.profitDelta, 0, "same allocated fee");
  near(compared.maxBuyDelta, 0, "same max buy");
  near(compared.breakEvenUnits, 40, "exact 40 units");
});

test("seller-plan comparison reuses FBA and FBM paths on the same listing", () => {
  const compared = compareSellerPlans({ ...base, fulfillmentMethod: "fbm" });
  assert.equal(compared.individual.fulfillmentMethod, "fbm");
  assert.equal(compared.professional.selected.profit, compared.professional.fbm.profit);
  near(
    compared.profitDelta,
    compared.professional.fbm.profit - compared.individual.fbm.profit,
    "FBM-selected delta",
  );
  assert.ok(compared.individual.fba.profit !== compared.individual.fbm.profit);
});

test("editable Individual and Professional rates change the winner", () => {
  const cheapPro = compareSellerPlans(base, {
    individualPerUnit: 1.99,
    professionalMonthly: 1,
  });
  assert.equal(cheapPro.cheaperPlan, "professional");
  const cheapInd = compareSellerPlans({ ...base, monthlyUnits: 80 }, {
    individualPerUnit: 0.01,
    professionalMonthly: 399,
  });
  assert.equal(cheapInd.cheaperPlan, "individual");
});

test("seller-plan comparison rejects zero units and negative rates", () => {
  assert.throws(
    () => compareSellerPlans({ ...base, monthlyUnits: 0 }),
    /greater than zero to compare seller plans/,
  );
  assert.throws(() => compareSellerPlans(base, { individualPerUnit: -1 }), /Individual per-unit fee/);
  assert.throws(() => compareSellerPlans(base, { professionalMonthly: -1 }), /Professional monthly fee/);
});

test("volume ladder shows Individual winning low volume and Professional winning high volume", () => {
  const ladder = compareSellerPlanVolumes(base);
  assert.deepEqual(
    ladder.rows.map((row) => row.monthlyUnits),
    SELLER_PLAN_VOLUME_STEPS,
  );
  near(
    ladder.breakEvenUnits,
    SELLER_PLAN_DEFAULTS.professionalMonthly / SELLER_PLAN_DEFAULTS.individualPerUnit,
    "ladder break-even",
  );
  assert.equal(ladder.rows[0].cheaperPlan, "individual");
  assert.equal(ladder.rows[1].cheaperPlan, "individual");
  assert.equal(ladder.rows[2].cheaperPlan, "individual");
  assert.equal(ladder.rows[3].cheaperPlan, "professional");
  assert.equal(ladder.rows[4].cheaperPlan, "professional");
  assert.equal(ladder.rows[0].individualProfit.toFixed(2), "10.50");
  assert.equal(ladder.rows[0].professionalProfit.toFixed(2), "7.49");
  assert.equal(ladder.rows[3].professionalProfit.toFixed(2), "10.99");
  assert.equal(ladder.rows[4].professionalProfit.toFixed(2), "11.29");
  near(ladder.rows[4].professionalAllocatedFee, 39.99 / 200, "Professional allocated at 200");
});

test("volume ladder accepts custom steps and rejects an empty list", () => {
  const ladder = compareSellerPlanVolumes(base, {}, [40, 40.4]);
  assert.equal(ladder.rows.length, 2);
  assert.equal(ladder.rows[0].cheaperPlan, "individual");
  assert.equal(ladder.rows[1].cheaperPlan, "professional");
  assert.throws(() => compareSellerPlanVolumes(base, {}, []), /non-empty list/);
});

test("defaults match the published Vine enrollment", () => {
  assert.equal(DEFAULT_VINE_UNITS, 30);
  assert.equal(DEFAULT_VINE_REFERRAL_RATE, 0);
  assert.equal(DEFAULT_CONVERSION_LIFT_PCT, 12);
  assert.equal(DEFAULT_VINE_MONTHS, 6);
});

test("leftover Vine pays on the default $29.99 listing; Vine on sellable units does not", () => {
  // List leftover $10.993. Gifted unit: $8 + $0.60 + $1.20 + $0.048 storage + $4.15 pick.
  // 30 leftover units cost $419.95. 12% of $879.46/month over 6 months is $633.21.
  const r = compareVine(base);
  near(r.profitPerUnit, 10.993291666666668, "list leftover");
  near(r.vineUnitCost, 13.998333333333333, "gifted unit");
  near(r.vineUpfront, 419.95, "30-unit enrollment");
  near(r.monthlyProfit, 879.4633333333334, "80-unit month");
  near(r.skip.horizonProfit, 5276.78, "skip six months");
  near(r.leftover.horizonProfit, 5490.0436, "leftover Vine");
  near(r.sellable.horizonProfit, 5160.24485, "sellable Vine");
  near(r.extraKeptOnLeftover, 213.2636, "leftover vs skip");
  near(r.extraKeptOnSellable, -116.53515, "sellable vs skip");
  near(r.breakEvenLiftPct, 7.958451934702601, "lift floor");
  near(r.breakEvenMonths, 3.9792259673513013, "months at 12%");
  assert.equal(r.winner, "leftover");
  assert.ok(r.leftover.horizonProfit > r.skip.horizonProfit, "leftover beats skip");
  assert.ok(r.skip.horizonProfit > r.sellable.horizonProfit, "skip beats Vine on a hero SKU");
});

test("zero conversion lift makes leftover Vine just the gift cost", () => {
  const r = compareVine({ ...base, conversionLiftPct: 0 });
  near(r.extraMonthly, 0, "no extra sales");
  near(r.extraKeptOnLeftover, -419.95, "ate the enrollment");
  assert.equal(r.winner, "skip");
});

test("empty Vine fields use the published defaults", () => {
  const r = compareVine(base);
  near(r.vineUnits, DEFAULT_VINE_UNITS, "default units");
  near(r.conversionLiftPct, DEFAULT_CONVERSION_LIFT_PCT, "default lift");
  near(r.vineMonths, DEFAULT_VINE_MONTHS, "default months");
  near(vineUnitCost(base), r.vineUnitCost, "helper matches");
});

test("compareVine rejects a zero enrollment or horizon", () => {
  assert.throws(() => compareVine({ ...base, vineUnits: 0 }), /Vine units/);
  assert.throws(() => compareVine({ ...base, vineMonths: 0 }), /Vine months/);
  assert.throws(() => compareVine({ ...base, vineUnits: -1 }), /Vine units/);
});

test("summary names leftover Vine and the lift floor", () => {
  const text = compareVine(base).summary;
  assert.match(text, /\$213\.26 more/);
  assert.match(text, /\$419\.95/);
  assert.match(text, /8\.0%/);
  assert.match(text, /\$116\.54 less/);
  assert.doesNotMatch(text, /should enroll|must join|turn on Vine/i);
});

test("defaults match the published aged-inventory pile", () => {
  assert.equal(DEFAULT_AGED_UNITS, 80);
  assert.equal(DEFAULT_AGED_SELL_THROUGH_PCT, 5);
  assert.equal(DEFAULT_AGED_HORIZON_MONTHS, 3);
  assert.equal(DEFAULT_AGED_AIS_PER_UNIT, 1.5);
  assert.equal(DEFAULT_AGED_REMOVAL_FEE, 1.04);
  assert.equal(DEFAULT_AGED_DISPOSAL_FEE, 0.32);
});

test("disposing the default leftover pile loses less than keeping", () => {
  // Contribution is list minus referral and pick — COGS and inbound are sunk.
  // 80 units × 5% sell-through over 3 months: 11.41 sold, 68.59 leftover.
  // Carrying is storage + $1.50 AIS on what is still there each month.
  const r = compareAgedInventory(base);
  near(r.contribution, 21.3415, "sunk-COGS contribution");
  near(r.storagePerUnitMonth, 0.04833333333333333, "cu ft × $0.87");
  near(r.keep.cash, -109.82315166666672, "keep");
  near(r.remove.cash, -83.2, "return removal");
  near(r.dispose.cash, -25.6, "dispose");
  near(r.keep.soldUnits, 11.41, "expected sold");
  near(r.keep.leftoverUnits, 68.59, "still sitting");
  near(r.keep.carryingFees, 353.3296666666667, "storage + AIS");
  near(r.extraKeepVsDispose, -84.22315166666672, "keep vs dispose");
  near(r.breakEvenSellThroughVsDispose, 6.720082528357096, "sell-through floor");
  near(r.breakEvenSellThroughVsRemove, 5.537296348009946, "vs return");
  near(r.breakEvenAisVsDispose, 1.1309239628980379, "AIS ceiling");
  assert.equal(r.winner, "dispose");
  assert.ok(r.dispose.cash > r.remove.cash, "dispose beats a return");
  assert.ok(r.remove.cash > r.keep.cash, "a return beats keeping");
});

test("a faster leftover pile flips keep ahead of dispose", () => {
  const r = compareAgedInventory({ ...base, monthlySellThroughPct: 20 });
  assert.equal(r.winner, "keep");
  assert.ok(r.keep.cash > 0, "sales cover carrying");
  assert.ok(r.extraKeepVsDispose > 0, "keep beats dispose");
});

test("zero sell-through is just three months of carrying", () => {
  const r = compareAgedInventory({ ...base, monthlySellThroughPct: 0 });
  near(r.keep.soldUnits, 0, "nothing sold");
  near(r.keep.leftoverUnits, 80, "whole pile remains");
  near(r.keep.cash, -371.6, "80 × ($0.04833 + $1.50) × 3");
  assert.equal(r.winner, "dispose");
});

test("empty aged-inventory fields use the published defaults", () => {
  const r = compareAgedInventory(base);
  near(r.agedUnits, DEFAULT_AGED_UNITS, "default units");
  near(r.monthlySellThroughPct, DEFAULT_AGED_SELL_THROUGH_PCT, "default sell-through");
  near(r.horizonMonths, DEFAULT_AGED_HORIZON_MONTHS, "default horizon");
  near(r.aisPerUnit, DEFAULT_AGED_AIS_PER_UNIT, "default AIS");
});

test("compareAgedInventory rejects a zero pile or horizon", () => {
  assert.throws(() => compareAgedInventory({ ...base, agedUnits: 0 }), /Aged units/);
  assert.throws(() => compareAgedInventory({ ...base, horizonMonths: 0 }), /Horizon months/);
  assert.throws(() => compareAgedInventory({ ...base, monthlySellThroughPct: 101 }), /at most 100/);
  assert.throws(() => compareAgedInventory({ ...base, aisPerUnit: -1 }), /Aged inventory surcharge/);
});

test("summary names dispose and the sell-through floor", () => {
  const text = compareAgedInventory(base).summary;
  assert.match(text, /\$84\.22 less/);
  assert.match(text, /-\$25\.60/);
  assert.match(text, /-\$109\.82/);
  assert.match(text, /-\$83\.20/);
  assert.match(text, /6\.7%/);
  assert.doesNotMatch(text, /should dispose|must remove|create a removal/i);
});

test("aged surcharge months start after the threshold, not on it", () => {
  assert.equal(
    agedSurchargeMonths({
      monthsAlreadyStored: 5,
      additionalMonths: 3,
      agedStartsAfterMonths: 6,
    }),
    2,
  );
  assert.equal(
    agedSurchargeMonths({
      monthsAlreadyStored: 0,
      additionalMonths: 6,
      agedStartsAfterMonths: 6,
    }),
    0,
  );
  assert.equal(
    agedSurchargeMonths({
      monthsAlreadyStored: 6,
      additionalMonths: 1,
      agedStartsAfterMonths: 6,
    }),
    1,
  );
});

test("hold wins when leftover FBA profit still beats paying to dispose", () => {
  const cuFt = cubicFeet({ length: 8, width: 6, height: 2 });
  const fulfillment = defaultFulfillmentFee("large_standard", 0.75);
  const decision = compareHoldVsRemove({
    remainingUnits: 20,
    expectedMonthsToSell: 3,
    monthsAlreadyStored: 5,
    agedStartsAfterMonths: 6,
    storageRate: 0.87,
    agedSurchargePerCuFt: 1.5,
    removalFeePerUnit: 1.04,
    salvagePerUnit: 0,
    cubicFeet: cuFt,
    salePrice: 29.99,
    referralRate: 15,
    fulfillmentFee: fulfillment,
    adsPerUnit: 0,
  });

  const storage = cuFt * 0.87 * 3;
  const surcharge = cuFt * 1.5 * 2;
  const holdNet = 29.99 - 29.99 * 0.15 - fulfillment - storage - surcharge;
  near(decision.surchargeMonths, 2, "two aged months");
  near(decision.holdNetPerUnit, holdNet, "hold net");
  near(decision.removeNetPerUnit, -1.04, "dispose cost");
  near(decision.holdAdvantage, (holdNet + 1.04) * 20, "advantage");
  assert.equal(decision.betterPath, "hold");
  assert.equal(decision.monthsUntilRemoveWins, null);
});

test("remove wins when future warehouse cost erases the leftover sale", () => {
  const cuFt = cubicFeet({ length: 18, width: 14, height: 8 });
  const fulfillment = defaultFulfillmentFee("large_standard", 10);
  const decision = compareHoldVsRemove({
    remainingUnits: 12,
    expectedMonthsToSell: 6,
    monthsAlreadyStored: 8,
    agedStartsAfterMonths: 6,
    storageRate: 2.4,
    agedSurchargePerCuFt: 6,
    removalFeePerUnit: 1.5,
    salvagePerUnit: 4,
    cubicFeet: cuFt,
    salePrice: 29.99,
    referralRate: 15,
    fulfillmentFee: fulfillment,
    adsPerUnit: 0,
  });

  const warehouse = cuFt * 2.4 * 6 + cuFt * 6 * 6;
  const holdNet = 29.99 - 29.99 * 0.15 - fulfillment - warehouse;
  const removeNet = 4 - 1.5;
  near(decision.surchargeMonths, 6, "already aged");
  near(decision.warehousePerUnit, warehouse, "warehouse");
  near(decision.holdNetPerUnit, holdNet, "hold net");
  near(decision.removeNetPerUnit, removeNet, "remove net");
  assert.ok(holdNet < removeNet);
  assert.equal(decision.betterPath, "remove");
  assert.equal(decision.monthsUntilRemoveWins, 2);
});

test("sunk inbound and cost of goods do not change hold vs remove", () => {
  const shared = {
    remainingUnits: 5,
    expectedMonthsToSell: 2,
    monthsAlreadyStored: 1,
    storageRate: 0.87,
    agedSurchargePerCuFt: 0,
    removalFeePerUnit: 1,
    salvagePerUnit: 0,
    cubicFeet: 0.2,
    salePrice: 20,
    referralRate: 15,
    fulfillmentFee: 4,
    adsPerUnit: 0,
  };
  const a = compareHoldVsRemove(shared);
  const b = compareHoldVsRemove({ ...shared, costOfGoods: 50, inboundPerUnit: 8 });
  near(a.holdAdvantage, b.holdAdvantage, "sunk costs ignored");
});

test("reports when extra months of holding would flip the decision", () => {
  const decision = compareHoldVsRemove({
    remainingUnits: 1,
    expectedMonthsToSell: 1,
    monthsAlreadyStored: 0,
    agedStartsAfterMonths: 6,
    storageRate: 10,
    agedSurchargePerCuFt: 0,
    removalFeePerUnit: 1,
    salvagePerUnit: 0,
    cubicFeet: 1,
    salePrice: 20,
    referralRate: 0,
    fulfillmentFee: 0,
    adsPerUnit: 0,
  });
  assert.equal(decision.betterPath, "hold");
  assert.equal(decision.monthsUntilRemoveWins, 3);
  assert.equal(decision.scenarios.length, 4);
  near(decision.scenarios[0].additionalMonths, 1, "1-month row");
  near(decision.scenarios[3].additionalMonths, 6, "6-month row");
});

test("rejects invalid hold-vs-remove inputs", () => {
  assert.throws(() => compareHoldVsRemove({ remainingUnits: 0, salePrice: 10 }), /at least 1/);
  assert.throws(() => compareHoldVsRemove({ remainingUnits: 1.5, salePrice: 10 }), /whole number/);
  assert.throws(() => compareHoldVsRemove({ remainingUnits: 1, salePrice: -1 }), /Sale price/);
});

test("applyPlacementPreset fills illustrative inbound placement rates", () => {
  const filled = applyPlacementPreset({}, "large_standard");
  assert.equal(filled.placementMinimalPerUnit, PLACEMENT_PRESETS.large_standard.minimalPerUnit);
  assert.equal(filled.placementPartialPerUnit, PLACEMENT_PRESETS.large_standard.partialPerUnit);
});

// 200 large-standard units. One-warehouse freight is cheap; Amazon's placement
// fee on that path still beats paying much more freight to split the shipment.
test("one-warehouse inbound wins when extra freight exceeds the placement fee", () => {
  const r = compareInboundPlacement({
    units: 200,
    freightMinimal: 85,
    freightPartial: 140,
    freightOptimized: 210,
    placementMinimalPerUnit: 0.43,
    placementPartialPerUnit: 0.27,
    placementOptimizedPerUnit: 0,
  });
  near(r.paths.minimal.placementTotal, 86, "200 × $0.43");
  near(r.paths.minimal.total, 171, "85 + 86");
  near(r.paths.partial.total, 194, "140 + 54");
  near(r.paths.optimized.total, 210, "210 + 0");
  assert.equal(r.winner, "minimal");
  near(r.nextBestDelta, 23, "partial is next");
  near(r.extraVsCheapest.optimized, 39, "optimized costs $39 more");
  near(r.paths.minimal.perUnit, 171 / 200, "blended inbound / unit");
  near(r.extraFreightOptimizedCanCarry, 86, "placement avoided by splitting");
});

// Same 200 units, but the split only costs a little more in freight. Paying
// Amazon to accept a single destination is then the expensive path.
test("Amazon-optimized split wins when extra freight is less than placement", () => {
  const r = compareInboundPlacement({
    units: 200,
    freightMinimal: 90,
    freightPartial: 105,
    freightOptimized: 120,
    placementMinimalPerUnit: 0.55,
    placementPartialPerUnit: 0.32,
    placementOptimizedPerUnit: 0,
  });
  near(r.paths.minimal.total, 200, "90 + 110");
  near(r.paths.partial.total, 169, "105 + 64");
  near(r.paths.optimized.total, 120, "120 + 0");
  assert.equal(r.winner, "optimized");
  near(r.nextBestDelta, 49, "partial is next");
  near(r.extraVsCheapest.minimal, 80, "one warehouse costs $80 more");
});

test("reports a tie when every inbound path costs the same", () => {
  const r = compareInboundPlacement({
    units: 100,
    freightMinimal: 50,
    freightPartial: 40,
    freightOptimized: 30,
    placementMinimalPerUnit: 0.2,
    placementPartialPerUnit: 0.3,
    placementOptimizedPerUnit: 0.4,
  });
  near(r.paths.minimal.total, 70, "tie total");
  assert.equal(r.winner, "tie");
  assert.deepEqual(r.cheapestIds, ["minimal", "partial", "optimized"]);
  near(r.nextBestDelta, 0, "no cheaper alternative");
});

test("placement summary names the cheaper split without telling the seller to send it", () => {
  const cheapWarehouse = compareInboundPlacement({
    units: 200,
    freightMinimal: 85,
    freightPartial: 140,
    freightOptimized: 210,
    placementMinimalPerUnit: 0.43,
    placementPartialPerUnit: 0.27,
    placementOptimizedPerUnit: 0,
  });
  const text = placementSummary(cheapWarehouse);
  assert.match(text, /Send to one warehouse totals \$171\.00/);
  assert.match(text, /\$23\.00 less/);
  assert.match(text, /\$86\.00 more in freight/);
  assert.doesNotMatch(text, /should send|must split|create a shipment/i);
});

test("rejects empty or invalid inbound-placement inputs", () => {
  assert.throws(() => compareInboundPlacement({ units: 0, freightMinimal: 10 }), /greater than zero/);
  assert.throws(() => compareInboundPlacement({ units: -2, freightMinimal: 10 }), /Shipment units/);
  assert.throws(() => compareInboundPlacement({ units: 10, freightMinimal: "abc" }), /Single-destination freight/);
  assert.throws(() => applyPlacementPreset({}, "envelope"), /Unknown size tier/);
  assert.throws(() => placementSummary({}), /missing paths/);
});

test("rejects unknown presets and invalid inputs", () => {
  assert.throws(() => applyCategoryPreset({}, "widgets"), /Unknown Amazon category/);
  assert.throws(() => applyStoragePreset({}, "summer"), /Unknown storage season/);
  assert.throws(() => calculateListing({ salePrice: -1 }), /Sale price/);
  assert.throws(() => calculateListing({ salePrice: "abc" }), /Sale price/);
  assert.throws(() => calculateListing({ salePrice: 10, targetMargin: 100 }), /less than 100/);
  assert.throws(() => calculateListing({ salePrice: 10, fulfillmentMethod: "sfp" }), /fba or fbm/);
  assert.throws(() => calculateListing({ salePrice: 10, fbmHandlingCost: -1 }), /FBM handling cost/);
  assert.throws(
    () => calculateListing({ salePrice: 10, monthlySellerFee: 39.99, monthlyUnits: 0 }),
    /Monthly units/,
  );
  assert.throws(() => defaultFulfillmentFee("envelope", 1), /Unknown size tier/);
});

test("blendedStorageRate weights peak and off-peak months", () => {
  near(blendedStorageRate({ offPeakMonths: 0, peakMonths: 0 }), 0, "empty stay");
  near(blendedStorageRate({ offPeakMonths: 3, peakMonths: 0 }), 0.87, "off-peak only");
  near(blendedStorageRate({ offPeakMonths: 0, peakMonths: 3 }), 2.4, "peak only");
  near(blendedStorageRate({ offPeakMonths: 1, peakMonths: 2 }), (0.87 + 4.8) / 3, "1+2 mixed");
});

// 1 cu ft box, three-month stay, two of them in Oct–Dec. Storage is the only
// difference between the rows, so the cash gaps are exact cubic-foot arithmetic.
test("compareStorageSeasons ranks waiting until January against a Q4 stay", () => {
  const r = compareStorageSeasons({
    salePrice: 29.99,
    referralRate: 15,
    length: 12,
    width: 12,
    height: 12,
    weightLb: 2,
    costOfGoods: 8,
    inboundPerUnit: 1.2,
    monthsInStorage: 3,
    peakMonths: 2,
    units: 200,
    fbmShippingCost: 4.75,
    packagingCost: 0.6,
    otherCost: 0,
    adsPerUnit: 0,
    monthlySellerFee: 0,
    monthlyUnits: 80,
    fulfillmentFee: 5,
    sizeTier: "large_standard",
  });

  near(r.cubicFeet, 1, "1 cu ft");
  near(r.scenarios.off_peak.storagePerUnit, 2.61, "3 months off-peak");
  near(r.scenarios.peak.storagePerUnit, 7.2, "3 months peak");
  near(r.scenarios.mixed.storagePerUnit, 5.67, "1 off-peak + 2 peak");
  near(r.waitUntilJanuarySavesPerUnit, 3.06, "mixed minus January");
  near(r.waitUntilJanuarySaves, 612, "200 units");
  near(r.peakCostsExtraPerUnit, 4.59, "all-peak minus January");
  near(r.peakCostsExtra, 918, "200 units all-peak gap");
  assert.equal(r.winner, "off_peak");
  assert.equal(r.ranked[0].id, "off_peak");
  near(r.scenarios.off_peak.fbaProfit - r.scenarios.mixed.fbaProfit, 3.06, "profit gap is storage");

  const profitBeforeStorage = 29.99 - 29.99 * 0.15 - 5 - (8 + 0.6 + 1.2);
  near(r.profitBeforeStorage, profitBeforeStorage, "zero-storage FBA profit");
  near(r.peakMonthsUntilUnprofitable, profitBeforeStorage / 2.4, "months of peak that wipe profit");
});

test("compareStorageSeasons treats a stay with no peak months as a January tie", () => {
  const r = compareStorageSeasons({
    salePrice: 29.99,
    referralRate: 15,
    length: 12,
    width: 12,
    height: 12,
    weightLb: 2,
    costOfGoods: 8,
    inboundPerUnit: 1.2,
    monthsInStorage: 3,
    peakMonths: 0,
    units: 10,
    packagingCost: 0,
    monthlySellerFee: 0,
    fulfillmentFee: 5,
    sizeTier: "large_standard",
  });
  near(r.scenarios.mixed.storagePerUnit, r.scenarios.off_peak.storagePerUnit, "mixed equals January");
  near(r.waitUntilJanuarySaves, 0, "nothing to save");
  assert.ok(r.cheapestIds.includes("off_peak"));
  assert.ok(r.cheapestIds.includes("mixed"));
  assert.equal(r.winner, "tie");
});

test("compareStorageSeasons rejects an impossible peak stay and zero units", () => {
  assert.throws(
    () => compareStorageSeasons({ salePrice: 20, monthsInStorage: 1, peakMonths: 2 }),
    /cannot exceed/,
  );
  assert.throws(
    () => compareStorageSeasons({ salePrice: 20, monthsInStorage: 1, units: 0 }),
    /greater than zero/,
  );
  assert.throws(() => storageSeasonNote({}), /missing rows/);
});

test("storageSeasonNote names the January gap without telling the seller to inbound", () => {
  const r = compareStorageSeasons({
    salePrice: 29.99,
    referralRate: 15,
    length: 12,
    width: 12,
    height: 12,
    weightLb: 2,
    costOfGoods: 8,
    inboundPerUnit: 1.2,
    monthsInStorage: 3,
    peakMonths: 2,
    units: 200,
    packagingCost: 0.6,
    monthlySellerFee: 0,
    fulfillmentFee: 5,
    sizeTier: "large_standard",
  });
  const text = storageSeasonNote(r);
  assert.match(text, /\$3\.06 more per unit/);
  assert.match(text, /\$612\.00 on 200 units/);
  assert.match(text, /about 4\.5 October–December months/);
  assert.doesNotMatch(text, /should send|must wait|inbound now|opt in/i);
});

test("nextLowerSizeTier walks cheapest to dearest", () => {
  assert.equal(nextLowerSizeTier("small_standard"), null);
  assert.equal(nextLowerSizeTier("large_standard"), "small_standard");
  assert.equal(nextLowerSizeTier("large_bulky"), "large_standard");
  assert.equal(nextLowerSizeTier("extra_large"), "large_bulky");
  assert.throws(() => nextLowerSizeTier("envelope"), /Unknown size tier/);
});

test("clampBoxToTier flattens the default 8×6×2 carton into small-standard", () => {
  const pack = clampBoxToTier({ length: 8, width: 6, height: 2, weightLb: 0.75 }, "small_standard");
  assert.equal(pack.length, 8);
  assert.equal(pack.width, 6);
  assert.equal(pack.height, 0.75);
  assert.equal(pack.weightLb, 0.75);
  assert.equal(classifySizeTier(pack), "small_standard");
});

test("clampBoxToTier pulls extra-large down through girth into large bulky", () => {
  const pack = clampBoxToTier({ length: 60, width: 20, height: 20, weightLb: 30 }, "large_bulky");
  assert.equal(classifySizeTier(pack), "large_bulky");
  assert.ok(pack.length <= 59);
  assert.ok(pack.width + pack.height <= 90);
  assert.ok(pack.length + 2 * (pack.width + pack.height) <= 130 + 1e-9);
});

test("nextCheaperWeightLb steps into the previous fulfillment band", () => {
  assert.equal(nextCheaperWeightLb("large_standard", 0.75), 8 / 16);
  assert.equal(nextCheaperWeightLb("small_standard", 0.2), null);
  assert.equal(nextCheaperWeightLb("large_bulky", 12), 2);
  assert.equal(nextCheaperWeightLb("large_bulky", 2), null);
  assert.throws(() => nextCheaperWeightLb("envelope", 1), /Unknown size tier/);
});

test("nextCheaperWeightLb heavier than every listed band still steps only one band down", () => {
  // 10 lb (160 oz) is priced by defaultFulfillmentFee's per-pound formula,
  // above every entry in STANDARD_WEIGHT_BAND_OZ (top entry is 80 oz / 5 lb).
  // The next cheaper stop is 5 lb (the top of that heaviest listed band,
  // where the fee flattens back to $6.44) — not 3 lb, which would silently
  // skip the 5 lb band a shipper could reach with a much smaller trim.
  assert.equal(nextCheaperWeightLb("large_standard", 10), 5);
  assert.equal(nextCheaperWeightLb("large_standard", 20), 5);
  // Exactly at the heaviest listed band still steps down one band, as before.
  assert.equal(nextCheaperWeightLb("large_standard", 5), 3);
});

test("compareSizeTierPackaging: default 8×6×2 box drops a tier by flattening to 0.75 in", () => {
  const comparison = compareSizeTierPackaging({
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
    packagingCost: 0.6,
    monthlySellerFee: 39.99,
    monthlyUnits: 80,
    targetMargin: 30,
    fulfillmentMethod: "fba",
  });
  assert.equal(comparison.current.sizeTier, "large_standard");
  assert.equal(comparison.dropTier.targetTier, "small_standard");
  assert.equal(comparison.dropTier.sizeTier, "small_standard");
  near(comparison.dropTier.pack.height, 0.75, "flattened height");
  near(comparison.dropTier.cuts.shortestIn, 1.25, "inches off the shortest side");
  near(comparison.dropTier.fulfillmentFee, defaultFulfillmentFee("small_standard", 0.75), "small-standard fee");
  near(comparison.current.fulfillmentFee, defaultFulfillmentFee("large_standard", 0.75), "large-standard fee");

  const feeSave = comparison.current.fulfillmentFee - comparison.dropTier.fulfillmentFee;
  const storageSave = comparison.current.storagePerUnit - comparison.dropTier.storagePerUnit;
  near(comparison.dropTier.profitDelta, feeSave + storageSave, "profit delta is fee plus storage");
  assert.ok(comparison.dropTier.profitDelta > 0);
  assert.equal(comparison.dropTierPays, true);
  assert.equal(comparison.winner, "drop_tier");
  near(comparison.dropTier.monthlyDelta, comparison.dropTier.profitDelta * 80, "monthly");
  near(comparison.dropTier.profitDelta, 0.800208, "default $0.80");
  near(comparison.dropTier.monthlyDelta, 64.016667, "default $64.02 / month");
  assert.match(sizeTierPackagingNote(comparison), /0\.75 in|small standard|keeps \$/i);
  assert.doesNotMatch(sizeTierPackagingNote(comparison), /should pack|must flatten|change the box|pack now/i);
});

test("compareSizeTierPackaging: extra prep can make the smaller carton lose", () => {
  const comparison = compareSizeTierPackaging({
    salePrice: 29.99,
    referralRate: 15,
    length: 8,
    width: 6,
    height: 2,
    weightLb: 0.25,
    costOfGoods: 8,
    inboundPerUnit: 1.2,
    packagingCost: 0.6,
    monthlySellerFee: 39.99,
    monthlyUnits: 80,
    repackCostPerUnit: 5,
  });
  assert.equal(comparison.current.sizeTier, "large_standard");
  assert.equal(comparison.dropWeight, null);
  assert.ok(comparison.dropTier.profitDelta < 0);
  assert.equal(comparison.dropTierPays, false);
  assert.equal(comparison.winner, "current");
  assert.match(sizeTierPackagingNote(comparison), /extra prep/i);
});

test("compareSizeTierPackaging: a small-standard 4 oz pack has no cheaper band", () => {
  const comparison = compareSizeTierPackaging({
    salePrice: 29.99,
    length: 8,
    width: 6,
    height: 0.5,
    weightLb: 0.2,
    costOfGoods: 8,
    inboundPerUnit: 1.2,
    packagingCost: 0.6,
    monthlySellerFee: 0,
    monthlyUnits: 80,
  });
  assert.equal(comparison.current.sizeTier, "small_standard");
  assert.equal(comparison.dropTier, null);
  assert.equal(comparison.dropWeight, null);
  assert.equal(comparison.alreadyCheapestStandardBand, true);
  assert.equal(comparison.winner, "current");
  assert.match(sizeTierPackagingNote(comparison), /already in the cheapest/i);
});

test("compareSizeTierPackaging: weight-band drop keeps the same size tier", () => {
  const comparison = compareSizeTierPackaging({
    salePrice: 29.99,
    length: 12,
    width: 10,
    height: 6,
    weightLb: 1,
    costOfGoods: 8,
    inboundPerUnit: 1.2,
    packagingCost: 0.6,
    monthlySellerFee: 0,
    monthlyUnits: 80,
  });
  assert.equal(comparison.current.sizeTier, "large_standard");
  assert.ok(comparison.dropWeight);
  near(comparison.dropWeight.pack.weightLb, 12 / 16, "12 oz band");
  assert.equal(comparison.dropWeight.sizeTier, "large_standard");
  assert.ok(comparison.dropWeight.profitDelta > 0);
});

test("compareSizeTierPackaging ignores a typed return mix and rejects a negative repack", () => {
  const withReturns = compareSizeTierPackaging({
    salePrice: 29.99,
    length: 8,
    width: 6,
    height: 2,
    weightLb: 0.75,
    costOfGoods: 8,
    inboundPerUnit: 1.2,
    packagingCost: 0.6,
    monthlySellerFee: 0,
    monthlyUnits: 80,
    returnRate: 15,
    unsellableReturnRate: 20,
    returnHandlingFee: 2.5,
  });
  const completed = compareSizeTierPackaging({
    salePrice: 29.99,
    length: 8,
    width: 6,
    height: 2,
    weightLb: 0.75,
    costOfGoods: 8,
    inboundPerUnit: 1.2,
    packagingCost: 0.6,
    monthlySellerFee: 0,
    monthlyUnits: 80,
  });
  near(withReturns.current.profit, completed.current.profit, "return mix forced to 0");
  assert.throws(() => compareSizeTierPackaging({ salePrice: 20, repackCostPerUnit: -1 }), /Repack cost/);
  assert.throws(() => sizeTierPackagingNote({}), /missing rows/);
});

const SFP_BASE = {
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
  monthlySellerFee: 39.99,
  monthlyUnits: 80,
};

test("compareSfp: default large-standard unit still prefers FBA over a 2-day label", () => {
  const comparison = compareSfp(SFP_BASE);
  assert.equal(comparison.winner, "fba");
  assert.equal(comparison.sizeTier, "large_standard");
  near(comparison.fulfillmentFee, 4.15, "large-standard 12 oz band");
  near(comparison.laborCost, 1.8, "6 min at $18");
  near(comparison.fba.completedProfit, 10.993291666666664, "FBA leftover");
  near(comparison.sfp.completedProfit, 5.641624999999999, "SFP leftover");
  near(comparison.fbm.completedProfit, 11.641624999999998, "FBM leftover");
  near(comparison.fba.expectedProfit, 7.695304166666665, "70% take");
  near(comparison.sfp.expectedProfit, 3.667056249999999, "65% take");
  near(comparison.fbm.expectedProfit, 4.656649999999999, "40% take");
  near(comparison.extraKeptOnSfp, -4.028247916666666, "FBA vs SFP gap");
  near(comparison.monthlyExtraOnSfp, -460.3711904761904, "80 FBA units");
  near(comparison.breakEvenSfpShipping, 2.752695512820514, "2-day ceiling");
  near(comparison.breakEvenFbmTakePct, 66.10163243247112, "FBM take floor");
  assert.equal(comparison.breakEvenSfpTakePct, Infinity);
  assert.match(comparison.summary, /\$4\.03 more per session/);
  assert.match(comparison.summary, /\$460\.37 on 80 FBA units/);
  assert.match(comparison.summary, /\$2\.75/);
  assert.equal(sfpNote(comparison), comparison.summary);
});

test("compareSfp: a $2.40 2-day label flips Seller Fulfilled Prime ahead of FBA", () => {
  const comparison = compareSfp({ ...SFP_BASE, sfpShippingCost: 2.4 });
  assert.equal(comparison.winner, "sfp");
  near(comparison.extraKeptOnSfp, 0.2292520833333338, "cheap 2-day");
  near(comparison.monthlyExtraOnSfp, 26.20023809523815, "monthly flip");
  assert.match(comparison.summary, /\$0\.23 more per session/);
  assert.match(comparison.summary, /\$26\.20 on 80 FBA units/);
});

test("compareSfp: FBM take at the floor ties FBA expected leftover", () => {
  const comparison = compareSfp({ ...SFP_BASE, fbmTakePct: 66.10163243247112 });
  near(comparison.fbm.expectedProfit, comparison.fba.expectedProfit, "FBM floor");
});

test("compareSfp: zero pack minutes still leaves FBA ahead on the default label", () => {
  const comparison = compareSfp({ ...SFP_BASE, sfpMinutes: 0 });
  assert.equal(comparison.winner, "fba");
  near(comparison.laborCost, 0, "no pack time");
  assert.ok(comparison.extraKeptOnSfp < 0);
});

test("compareSfp ignores a typed return mix and rejects impossible inputs", () => {
  const withReturns = compareSfp({
    ...SFP_BASE,
    returnRate: 15,
    unsellableReturnRate: 20,
    returnHandlingFee: 2.5,
  });
  const completed = compareSfp(SFP_BASE);
  near(withReturns.fba.completedProfit, completed.fba.completedProfit, "return mix forced to 0");
  assert.throws(() => compareSfp({ salePrice: -1 }), /Sale price/);
  assert.throws(() => compareSfp({ ...SFP_BASE, fbaTakePct: 0 }), /greater than zero/);
  assert.throws(() => compareSfp({ ...SFP_BASE, sfpTakePct: 101 }), /at most 100/);
  assert.throws(() => compareSfp({ ...SFP_BASE, monthlyUnits: 0 }), /greater than zero/);
  assert.throws(() => sfpNote({}), /missing rows/);
});

test("days of supply is average inventory divided by daily shipped", () => {
  near(
    daysOfSupply({ averageDailyInventory: 10, unitsSold: 30, windowDays: 30 }),
    10,
    "10 on hand / 1 per day",
  );
  assert.equal(
    daysOfSupply({ averageDailyInventory: 10, unitsSold: 0, windowDays: 30 }),
    Infinity,
  );
  assert.throws(
    () => daysOfSupply({ averageDailyInventory: 10, unitsSold: 30, windowDays: 0 }),
    /Window days/,
  );
});

test("LIL default bands follow size tier, weight, and days of supply", () => {
  near(defaultLowInventoryFee({ sizeTier: "small_standard", weightLb: 0.5, daysOfSupply: 10 }), 0.89, "thin small");
  near(defaultLowInventoryFee({ sizeTier: "small_standard", weightLb: 0.5, daysOfSupply: 18 }), 0.63, "mid small");
  near(defaultLowInventoryFee({ sizeTier: "small_standard", weightLb: 0.5, daysOfSupply: 24 }), 0.32, "near 28 small");
  near(defaultLowInventoryFee({ sizeTier: "small_standard", weightLb: 0.5, daysOfSupply: 28 }), 0, "at threshold");
  near(defaultLowInventoryFee({ sizeTier: "large_standard", weightLb: 2, daysOfSupply: 10 }), 0.97, "light large");
  near(defaultLowInventoryFee({ sizeTier: "large_standard", weightLb: 5, daysOfSupply: 10 }), 1.11, "heavy large");
  near(defaultLowInventoryFee({ sizeTier: "large_bulky", weightLb: 12, daysOfSupply: 10 }), 2.09, "bulky");
  near(defaultLowInventoryFee({ sizeTier: "extra_large", weightLb: 30, daysOfSupply: 5 }), 0, "XL exempt default");
});

test("thin 30-day and 90-day supply charges LIL and restocking beats staying thin", () => {
  const r = compareLowInventory({
    onHandUnits: 10,
    soldLast30Days: 30,
    soldLast90Days: 90,
    sizeTier: "small_standard",
    weightLb: 0.5,
    cubicFeet: cubicFeet({ length: 8, width: 6, height: 2 }),
    storageRate: 0.87,
    inboundPerUnit: 1.2,
    monthlyUnits: 30,
    fulfillmentMethod: "fba",
  });
  assert.equal(r.applies, true);
  assert.equal(r.reason, "below_threshold");
  near(r.shortTermDays, 10, "30-day days of supply");
  near(r.longTermDays, 10, "90-day days of supply");
  near(r.feePerUnit, 0.89, "0–13 day small-standard band");
  near(r.monthlyFee, 0.89 * 30, "monthly surcharge");
  near(r.extraUnitsTo28, 18, "28 days at 1/day minus 10 on hand");
  const extraStorage = 18 * cubicFeet({ length: 8, width: 6, height: 2 }) * 0.87;
  near(r.extraStoragePerMonth, extraStorage, "storage on the extra units");
  near(r.extraInbound, 18 * 1.2, "one-time inbound");
  near(r.restockSavesPerMonth, 0.89 * 30 - extraStorage, "LIL avoided minus extra storage");
  assert.equal(r.cheaperPolicy, "restock");
  assert.ok(r.inboundPaybackMonths < 1);
  assert.equal(LOW_INVENTORY_THRESHOLD_DAYS, 28);
  assert.doesNotMatch(lowInventoryNote(r), /should restock|must send|stay thin is better/i);
});

test("peak storage on a near-threshold cube can make staying thin cheaper than restocking", () => {
  const r = compareLowInventory({
    onHandUnits: 1050,
    soldLast30Days: 1500,
    soldLast90Days: 4500,
    sizeTier: "small_standard",
    weightLb: 0.5,
    cubicFeet: 1,
    storageRate: 2.4,
    inboundPerUnit: 1.2,
    monthlyUnits: 1500,
    fulfillmentMethod: "fba",
  });
  assert.equal(r.applies, true);
  near(r.shortTermDays, 21, "21 days of supply");
  near(r.feePerUnit, 0.32, "21–27 day small-standard band");
  near(r.extraUnitsTo28, 350, "7 more days at 50/day");
  near(r.extraStoragePerMonth, 350 * 2.4, "peak storage on 350 cu ft");
  near(r.monthlyFee, 0.32 * 1500, "monthly LIL");
  assert.ok(r.restockSavesPerMonth < 0);
  assert.equal(r.cheaperPolicy, "stay_thin");
  assert.doesNotMatch(lowInventoryNote(r), /should stay|must keep|do not restock/i);
});

test("either 28-day window at or above 28 days waives the LIL fee", () => {
  const longHealthy = compareLowInventory({
    onHandUnits: 30,
    soldLast30Days: 90,
    soldLast90Days: 90,
    sizeTier: "small_standard",
    weightLb: 0.5,
    monthlyUnits: 90,
  });
  near(longHealthy.shortTermDays, 10, "thin 30-day");
  near(longHealthy.longTermDays, 30, "healthy 90-day");
  assert.equal(longHealthy.applies, false);
  near(longHealthy.feePerUnit, 0, "waived");

  const bothHealthy = compareLowInventory({
    onHandUnits: 80,
    soldLast30Days: 80,
    soldLast90Days: 240,
    sizeTier: "large_standard",
    weightLb: 0.75,
    monthlyUnits: 80,
  });
  near(bothHealthy.shortTermDays, 30, "healthy 30-day");
  assert.equal(bothHealthy.applies, false);
});

test("FBM, grocery, and new-FNSKU listings do not pay the LIL surcharge", () => {
  const thin = {
    onHandUnits: 10,
    soldLast30Days: 30,
    soldLast90Days: 90,
    sizeTier: "small_standard",
    weightLb: 0.5,
    monthlyUnits: 30,
  };
  assert.equal(compareLowInventory({ ...thin, fulfillmentMethod: "fbm" }).feePerUnit, 0);
  assert.equal(compareLowInventory({ ...thin, groceryExempt: true }).feePerUnit, 0);
  assert.equal(compareLowInventory({ ...thin, newFnskuExempt: true }).feePerUnit, 0);
});

test("omitted inventory fields leave listing profit unchanged", () => {
  const without = calculateListing(base);
  const omitted = compareLowInventory({});
  near(without.fba.profit, calculateListing(base).fba.profit, "listing path ignores LIL");
  near(omitted.feePerUnit, 0, "no LIL without inventory inputs");
  assert.equal(omitted.applies, false);
  assert.throws(() => lowInventoryNote({}), /missing/);
});

test("rejects negative inventory inputs", () => {
  assert.throws(
    () => compareLowInventory({ onHandUnits: -1, soldLast30Days: 10, soldLast90Days: 30 }),
    /On-hand units/,
  );
});

const AWD_BASE = {
  salePrice: 29.99,
  referralRate: 15,
  length: 8,
  width: 6,
  height: 2,
  weightLb: 0.75,
  costOfGoods: 8,
  inboundPerUnit: 1.2,
  packagingCost: 0.6,
  storageRate: 0.87,
  monthlyUnits: 80,
};

test("compareAwd: default 400-unit lot still prefers AWD replenish over FBA now", () => {
  const comparison = compareAwd(AWD_BASE);
  assert.equal(comparison.winner, "awd");
  assert.equal(comparison.lotUnits, DEFAULT_AWD_LOT_UNITS);
  assert.equal(comparison.horizonMonths, DEFAULT_AWD_HORIZON_MONTHS);
  assert.equal(comparison.awdInboundPerUnit, DEFAULT_AWD_INBOUND);
  assert.equal(comparison.awdStoragePerCuFt, DEFAULT_AWD_STORAGE_PER_CU_FT);
  assert.equal(comparison.awdToFbaPerUnit, DEFAULT_AWD_TO_FBA);
  assert.equal(comparison.youHoldStoragePerUnit, DEFAULT_YOU_HOLD_STORAGE_PER_UNIT);
  assert.equal(comparison.sizeTier, "large_standard");
  near(comparison.fulfillmentFee, 4.15, "large-standard 12 oz band");
  near(comparison.contribution, 12.7415, "sale minus referral, pick, COGS, prep");
  near(comparison.fba.cash, 4558.6, "FBA now leftover");
  near(comparison.awd.cash, 4723.933333333332, "AWD leftover");
  near(comparison.hold.cash, 4397.2666666666655, "you-hold leftover");
  near(comparison.extraAwdVsFba, 165.33333333333303, "AWD vs FBA gap");
  near(comparison.extraHoldVsFba, -161.33333333333303, "you-hold vs FBA gap");
  near(comparison.breakEvenAwdToFba, 1.0933333333333333, "transfer ceiling");
  near(comparison.fba.inbound, 480, "FBA inbound on 400");
  near(comparison.awd.inbound, 60, "AWD receive on 400");
  near(comparison.awd.transfers, 272, "AWD-to-FBA on 400");
  near(comparison.hold.transfers, 480, "FBA inbound only as units drip");
  assert.equal(comparison.fba.sold, 400);
  assert.equal(comparison.awd.leftover, 0);
  assert.match(comparison.summary, /\$165\.33 more on 400 units/);
  assert.match(comparison.summary, /\$4723\.93 vs \$4558\.60/);
  assert.match(comparison.summary, /\$1\.09/);
  assert.match(comparison.summary, /loses \$161\.33/);
  assert.equal(awdNote(comparison), comparison.summary);
});

test("compareAwd: a $1.20 AWD-to-FBA transfer flips sending the lot to FBA", () => {
  const comparison = compareAwd({ ...AWD_BASE, awdToFbaPerUnit: 1.2 });
  assert.equal(comparison.winner, "fba");
  near(comparison.extraAwdVsFba, -42.66666666666697, "expensive transfer");
  assert.match(comparison.summary, /\$42\.67 more on 400 units/);
});

test("compareAwd: cheap you-hold storage beats parking the pile in FBA", () => {
  const comparison = compareAwd({ ...AWD_BASE, youHoldStoragePerUnit: 0.01 });
  assert.equal(comparison.winner, "awd");
  assert.ok(comparison.extraHoldVsFba > 0, "garage cheaper than FBA storage");
  const atCeiling = compareAwd({
    ...AWD_BASE,
    youHoldStoragePerUnit: comparison.breakEvenYouHoldStorage,
  });
  near(atCeiling.hold.cash, atCeiling.fba.cash, "you-hold storage floor");
});

test("compareAwd: transfer at the ceiling ties FBA leftover", () => {
  const comparison = compareAwd(AWD_BASE);
  const tied = compareAwd({ ...AWD_BASE, awdToFbaPerUnit: comparison.breakEvenAwdToFba });
  near(tied.awd.cash, tied.fba.cash, "transfer ceiling");
  assert.equal(tied.winner, "tie");
});

test("compareAwd ignores a typed return mix and rejects impossible inputs", () => {
  const withReturns = compareAwd({
    ...AWD_BASE,
    returnRate: 15,
    unsellableReturnRate: 20,
    returnHandlingFee: 2.5,
  });
  const completed = compareAwd(AWD_BASE);
  near(withReturns.awd.cash, completed.awd.cash, "return mix forced to 0");
  assert.throws(() => compareAwd({ salePrice: -1 }), /Sale price/);
  assert.throws(() => compareAwd({ ...AWD_BASE, lotUnits: 0 }), /greater than zero/);
  assert.throws(() => compareAwd({ ...AWD_BASE, horizonMonths: 0 }), /greater than zero/);
  assert.throws(() => compareAwd({ ...AWD_BASE, monthlyUnits: 0 }), /greater than zero/);
  assert.throws(() => compareAwd({ ...AWD_BASE, workingStock: 0 }), /greater than zero/);
  assert.throws(() => awdNote({}), /missing rows/);
});

test("defaults match the published liquidation pile", () => {
  assert.equal(DEFAULT_LIQUIDATION_RECOVERY_PCT, 8);
  assert.equal(DEFAULT_LIQUIDATION_FEE, 0.3);
  assert.equal(DEFAULT_ELSEWHERE_NET, 4);
});

test("compareLiquidation: default pile prefers pulling and selling elsewhere", () => {
  const comparison = compareLiquidation(base);
  assert.equal(comparison.winner, "elsewhere");
  near(comparison.keep.cash, -109.82315166666672, "keep matches aged page");
  near(comparison.dispose.cash, -25.6, "dispose matches aged page");
  near(comparison.liquidate.perUnit, 2.0992, "8% of $29.99 minus $0.30");
  near(comparison.liquidate.cash, 167.936, "80 units liquidated");
  near(comparison.elsewhere.perUnit, 2.96, "$4 leftover minus $1.04 removal");
  near(comparison.elsewhere.cash, 236.8, "80 units sold elsewhere");
  near(comparison.extraLiquidateVsDispose, 193.536, "liquidate vs dispose");
  near(comparison.extraElsewhereVsLiquidate, 68.864, "elsewhere vs liquidate");
  near(comparison.breakEvenRecoveryVsDispose, 0, "0% still beats dispose at $0.30 fee");
  near(comparison.breakEvenElsewhereVsLiquidate, 3.1392, "elsewhere floor");
  assert.ok(comparison.breakEvenSellThroughVsLiquidate > 100 - 1e-9
    || comparison.breakEvenSellThroughVsLiquidate === Infinity
    || comparison.keep.cash < comparison.liquidate.cash);
  assert.match(comparison.summary, /\$68\.86 more/);
  assert.match(comparison.summary, /\$236\.80/);
  assert.match(comparison.summary, /\$167\.94/);
  assert.match(comparison.summary, /\$3\.14/);
  assert.equal(liquidationNote(comparison), comparison.summary);
  assert.doesNotMatch(comparison.summary, /should liquidate|must remove|create a liquidation/i);
});

test("compareLiquidation: no elsewhere leftover flips FBA Liquidations ahead", () => {
  const comparison = compareLiquidation({ ...base, elsewhereNet: 0 });
  assert.equal(comparison.winner, "liquidate");
  near(comparison.elsewhere.cash, -83.2, "removal fee only");
  near(comparison.extraLiquidateVsDispose, 193.536, "same liquidate cash");
  assert.match(comparison.summary, /\$193\.54 more/);
  assert.match(comparison.summary, /\$167\.94 vs -\$25\.60/);
});

test("compareLiquidation: zero recovery and a $0.80 fee flips dispose ahead", () => {
  const comparison = compareLiquidation({
    ...base,
    recoveryPct: 0,
    liquidationFee: 0.8,
    elsewhereNet: 0,
  });
  assert.equal(comparison.winner, "dispose");
  near(comparison.liquidate.cash, -64, "80 × $0.80");
  near(comparison.breakEvenRecoveryVsDispose, 1.6005335111703902, "recovery floor");
  assert.match(comparison.summary, /\$38\.40 less/);
  assert.match(comparison.summary, /1\.6%/);
});

test("compareLiquidation: 20% monthly sell-through flips keep ahead of every exit", () => {
  const comparison = compareLiquidation({ ...base, monthlySellThroughPct: 20 });
  assert.equal(comparison.winner, "keep");
  assert.ok(comparison.keep.cash > comparison.elsewhere.cash, "keep beats a $4 elsewhere leftover");
  assert.ok(comparison.keep.cash > comparison.liquidate.cash, "keep beats liquidations");
  assert.match(comparison.summary, /still beats FBA Liquidations/);
});

test("compareLiquidation: empty recovery fields use the published defaults", () => {
  const comparison = compareLiquidation(base);
  near(comparison.recoveryPct, DEFAULT_LIQUIDATION_RECOVERY_PCT, "default recovery");
  near(comparison.liquidationFee, DEFAULT_LIQUIDATION_FEE, "default fee");
  near(comparison.elsewhereNet, DEFAULT_ELSEWHERE_NET, "default elsewhere");
  near(comparison.agedUnits, DEFAULT_AGED_UNITS, "same pile");
});

test("compareLiquidation rejects impossible recovery or a zero pile", () => {
  assert.throws(() => compareLiquidation({ ...base, recoveryPct: 101 }), /at most 100/);
  assert.throws(() => compareLiquidation({ ...base, agedUnits: 0 }), /Aged units/);
  assert.throws(() => compareLiquidation({ ...base, liquidationFee: -1 }), /Liquidation fee/);
  assert.throws(() => liquidationNote({}), /missing rows/);
});

const NARF_BASE = {
  salePrice: 29.99,
  referralRate: 15,
  length: 8,
  width: 6,
  height: 2,
  weightLb: 0.75,
  costOfGoods: 8,
  inboundPerUnit: 1.2,
  packagingCost: 0.6,
  storageRate: 0.87,
  monthlyUnits: 80,
};

test("compareRemoteFulfillment: default Canada demand still prefers NARF over a first CA pile", () => {
  const comparison = compareRemoteFulfillment(NARF_BASE);
  assert.equal(comparison.winner, "narf");
  assert.equal(comparison.narfFee, DEFAULT_NARF_FEE);
  assert.equal(comparison.caInboundPerUnit, DEFAULT_CA_INBOUND);
  assert.equal(comparison.narfTakePct, DEFAULT_NARF_TAKE_PCT);
  assert.equal(comparison.caTakePct, DEFAULT_CA_TAKE_PCT);
  assert.equal(comparison.monthlySessions, DEFAULT_CA_SESSIONS);
  assert.equal(comparison.sizeTier, "large_standard");
  near(comparison.fulfillmentFee, 4.15, "large-standard 12 oz band");
  near(comparison.usProfit, 11.493166666666664, "US FBA leftover");
  near(comparison.narf.completedProfit, 10.243166666666664, "NARF completed");
  near(comparison.narf.expectedProfit, 5.121583333333332, "NARF expected");
  near(comparison.canada.completedProfit, 7.493166666666663, "CA completed");
  near(comparison.canada.expectedProfit, 4.870558333333331, "CA expected");
  near(comparison.extraNarfVsSkip, 5.121583333333332, "NARF vs skip");
  near(comparison.extraCanadaVsNarf, -0.25102500000000116, "CA vs NARF");
  near(comparison.monthlyExtraOnNarf, 204.8633333333333, "monthly vs skip");
  near(comparison.breakEvenNarfFee, 1.7520500000000023, "remote-fee ceiling");
  near(comparison.breakEvenCaInbound, 4.813807692307691, "CA inbound ceiling");
  near(comparison.breakEvenNarfTakePct, 47.54934183764785, "NARF take floor");
  assert.equal(comparison.skip.expectedProfit, 0);
  assert.match(comparison.summary, /\$5\.12 more per Canada session/);
  assert.match(comparison.summary, /\$204\.86 on 40 Canada sessions/);
  assert.match(comparison.summary, /behind by \$0\.25/);
  assert.match(comparison.summary, /\$1\.75/);
  assert.equal(remoteFulfillmentNote(comparison), comparison.summary);
});

test("compareRemoteFulfillment: form defaults without monthly units match the locked leftover", () => {
  const fromForm = compareRemoteFulfillment({
    salePrice: "29.99",
    referralRate: "15",
    length: "8",
    width: "6",
    height: "2",
    weightLb: "0.75",
    costOfGoods: "8",
    inboundPerUnit: "1.20",
    packagingCost: "0.60",
    narfFee: "1.25",
    caInboundPerUnit: "5.20",
    narfTakePct: "50",
    caTakePct: "65",
    caSessions: "40",
  });
  const fromTests = compareRemoteFulfillment(NARF_BASE);
  assert.equal(fromForm.winner, "narf");
  near(fromForm.narf.expectedProfit, fromTests.narf.expectedProfit, "form vs test leftover");
  near(fromForm.usProfit, 11.493166666666664, "Professional fee not allocated to one unit");
});

test("compareRemoteFulfillment: a $2.40 Canada inbound flips the dedicated pile ahead", () => {
  const comparison = compareRemoteFulfillment({ ...NARF_BASE, caInboundPerUnit: 2.4 });
  assert.equal(comparison.winner, "canada");
  near(comparison.canada.expectedProfit, 6.690558333333331, "cheap CA expected");
  near(comparison.extraCanadaVsNarf, 1.5689749999999991, "cheap CA vs NARF");
  assert.match(comparison.summary, /\$1\.57 more per session/);
  assert.match(comparison.summary, /can rise to about \$4\.81/);
});

test("compareRemoteFulfillment: remote fee at the ceiling ties the Canada pile", () => {
  const comparison = compareRemoteFulfillment(NARF_BASE);
  const tied = compareRemoteFulfillment({
    ...NARF_BASE,
    narfFee: comparison.breakEvenNarfFee,
  });
  near(tied.narf.expectedProfit, tied.canada.expectedProfit, "remote-fee ceiling");
  assert.equal(tied.winner, "tie");
});

test("compareRemoteFulfillment ignores a typed return mix and rejects impossible inputs", () => {
  const withReturns = compareRemoteFulfillment({
    ...NARF_BASE,
    returnRate: 15,
    unsellableReturnRate: 20,
    returnHandlingFee: 2.5,
  });
  const completed = compareRemoteFulfillment(NARF_BASE);
  near(withReturns.narf.expectedProfit, completed.narf.expectedProfit, "return mix forced to 0");
  assert.throws(() => compareRemoteFulfillment({ salePrice: -1 }), /Sale price/);
  assert.throws(() => compareRemoteFulfillment({ ...NARF_BASE, caSessions: 0 }), /greater than zero/);
  assert.throws(() => compareRemoteFulfillment({ ...NARF_BASE, narfTakePct: 140 }), /at most 100/);
  assert.throws(() => remoteFulfillmentNote({}), /missing rows/);
});
