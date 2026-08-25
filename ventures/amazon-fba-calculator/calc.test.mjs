import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCategoryPreset,
  applyPlacementPreset,
  applyStoragePreset,
  calculateListing,
  CATEGORY_PRESETS,
  classifySizeTier,
  compareInboundPlacement,
  cubicFeet,
  defaultFulfillmentFee,
  PLACEMENT_PRESETS,
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

test("rejects unknown presets and invalid inputs", () => {
  assert.throws(() => applyCategoryPreset({}, "widgets"), /Unknown Amazon category/);
  assert.throws(() => applyStoragePreset({}, "summer"), /Unknown storage season/);
  assert.throws(() => applyPlacementPreset({}, "envelope"), /Unknown size tier/);
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

test("rejects empty or invalid inbound-placement inputs", () => {
  assert.throws(() => compareInboundPlacement({ units: 0, freightMinimal: 10 }), /greater than zero/);
  assert.throws(() => compareInboundPlacement({ units: -2, freightMinimal: 10 }), /Shipment units/);
  assert.throws(() => compareInboundPlacement({ units: 10, freightMinimal: "abc" }), /Single-destination freight/);
});
