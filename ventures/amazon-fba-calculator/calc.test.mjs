import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCategoryPreset,
  applyStoragePreset,
  calculateListing,
  CATEGORY_PRESETS,
  clampBoxToTier,
  classifySizeTier,
  compareSizeTierPackaging,
  cubicFeet,
  defaultFulfillmentFee,
  nextCheaperWeightLb,
  nextLowerSizeTier,
  sizeTierPackagingNote,
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

test("compareSizeTierPackaging: default 8×6×2 box drops a tier by flattening to 0.75 in", () => {
  const comparison = compareSizeTierPackaging(base);
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
  assert.match(sizeTierPackagingNote(comparison), /0\.75 in|small standard|keeps \$/i);
});

test("compareSizeTierPackaging: extra prep can make the smaller carton lose", () => {
  const comparison = compareSizeTierPackaging({
    ...base,
    weightLb: 0.25,
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
    ...base,
    length: 8,
    width: 6,
    height: 0.5,
    weightLb: 0.2,
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
    ...base,
    length: 12,
    width: 10,
    height: 6,
    weightLb: 1,
  });
  assert.equal(comparison.current.sizeTier, "large_standard");
  assert.ok(comparison.dropWeight);
  near(comparison.dropWeight.pack.weightLb, 12 / 16, "12 oz band");
  assert.equal(comparison.dropWeight.sizeTier, "large_standard");
  assert.ok(comparison.dropWeight.profitDelta > 0);
});

test("compareSizeTierPackaging rejects invalid repack cost", () => {
  assert.throws(() => compareSizeTierPackaging({ ...base, repackCostPerUnit: -1 }), /Repack cost/);
});
