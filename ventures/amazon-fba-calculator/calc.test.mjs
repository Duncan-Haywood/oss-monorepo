import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCategoryPreset,
  applyStoragePreset,
  calculateListing,
  CATEGORY_PRESETS,
  classifySizeTier,
  compareLowInventory,
  cubicFeet,
  daysOfSupply,
  defaultFulfillmentFee,
  defaultLowInventoryFee,
  LOW_INVENTORY_THRESHOLD_DAYS,
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
  const withHealthy = calculateListing({
    ...base,
    onHandUnits: 80,
    soldLast30Days: 80,
    soldLast90Days: 240,
  });
  near(without.fba.profit, withHealthy.fba.profit, "healthy stock matches omitted fields");
  near(without.lowInventory.feePerUnit, 0, "no LIL without inventory inputs");
});

test("thin FBA stock reduces FBA profit by the LIL fee and leaves FBM unchanged", () => {
  const healthy = calculateListing(base);
  const thin = calculateListing({
    ...base,
    onHandUnits: 10,
    soldLast30Days: 80,
    soldLast90Days: 240,
  });
  assert.equal(thin.lowInventory.applies, true);
  near(thin.fba.fees.lowInventory, 0.97, "LIL on FBA fees");
  near(thin.fba.profit, healthy.fba.profit - 0.97, "FBA profit drops by LIL");
  near(thin.fbm.profit, healthy.fbm.profit, "FBM ignores LIL");
  near(thin.fbm.fees.lowInventory, 0, "no LIL line on FBM");
});

test("rejects negative inventory inputs", () => {
  assert.throws(
    () => compareLowInventory({ onHandUnits: -1, soldLast30Days: 10, soldLast90Days: 30 }),
    /On-hand units/,
  );
});
