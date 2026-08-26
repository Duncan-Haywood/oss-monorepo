import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCategoryPreset,
  applyStoragePreset,
  breakEvenSalePrice,
  calculateListing,
  CATEGORY_PRESETS,
  classifySizeTier,
  cubicFeet,
  DEFAULT_REFERRAL_MINIMUM,
  defaultFulfillmentFee,
  referralFee,
  STORAGE_PRESETS,
} from "./calc.mjs";

const near = (actual, expected, msg) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${msg}: ${actual} vs ${expected}`);

const base = {
  salePrice: 24.99,
  referralRate: 15,
  referralMinimum: 0.3,
  length: 8,
  width: 6,
  height: 2,
  weightLb: 0.75,
  costOfGoods: 7,
  inboundPerUnit: 1.1,
  monthsInStorage: 1,
  storageRate: 0.75,
  sellerShippingCost: 4.5,
  packagingCost: 0.5,
  otherCost: 0,
  adsPerUnit: 0,
  monthlySellerFee: 0,
  monthlyUnits: 60,
  targetMargin: 25,
  fulfillmentMethod: "wfs",
};

test("classifies WFS size tiers from dimensions and weight", () => {
  assert.equal(
    classifySizeTier({ length: 10, width: 8, height: 2, weightLb: 1.2 }),
    "standard",
  );
  assert.equal(
    classifySizeTier({ length: 24, width: 16, height: 10, weightLb: 12 }),
    "oversize",
  );
  assert.equal(
    classifySizeTier({ length: 52, width: 20, height: 20, weightLb: 30 }),
    "extra_large",
  );
});

test("computes cubic feet from inches", () => {
  near(cubicFeet({ length: 12, width: 12, height: 12 }), 1, "1 cubic foot");
});

test("uses illustrative WFS fulfillment bands", () => {
  near(defaultFulfillmentFee("standard", 0.2), 3.45, "4 oz");
  near(defaultFulfillmentFee("standard", 0.9), 4.25, "14.4 oz");
  near(defaultFulfillmentFee("standard", 2), 4.85, "2 lb");
  near(defaultFulfillmentFee("standard", 4.2), 5.35 + 2 * 0.4, "4.2 lb");
  near(defaultFulfillmentFee("oversize", 2), 8.75, "oversize base");
  near(defaultFulfillmentFee("extra_large", 5), 22.5, "XL base");
});

test("applies the Walmart-style referral floor on cheap items", () => {
  near(referralFee(1, 15, 0.3), 0.3, "floor beats 15% of $1");
  near(referralFee(24.99, 15, 0.3), 24.99 * 0.15, "percentage on a mid-price item");
  near(referralFee(0, 15, 0.3), 0.3, "zero sale still pays the floor when a sale is scored");
});

test("fills category and storage presets", () => {
  assert.equal(applyCategoryPreset({}, "electronics").referralRate, 8);
  assert.equal(applyCategoryPreset({}, "jewelry").referralRate, 20);
  assert.equal(applyStoragePreset({}, "standard").storageRate, 0.75);
  assert.equal(applyStoragePreset({}, "long_term").storageRate, 2.1);
  assert.throws(() => applyCategoryPreset({}, "unknown"), /Unknown Walmart category/);
  assert.equal(CATEGORY_PRESETS.home.referralRate, 15);
  assert.equal(STORAGE_PRESETS.standard.perCuFt, 0.75);
});

test("computes WFS fees, storage, profit, margin and ROI", () => {
  const r = calculateListing(base);
  const cuFt = (8 * 6 * 2) / 1728;
  const storage = cuFt * 0.75;
  const fulfillment = defaultFulfillmentFee("standard", 0.75);
  const referral = 24.99 * 0.15;
  const cash = 7 + 0.5 + 0 + 0 + 0 + 1.1 + storage;

  assert.equal(r.sizeTier, "standard");
  near(r.cubicFeet, cuFt, "cu ft");
  near(r.storagePerUnit, storage, "storage");
  near(r.suggestedFulfillment, fulfillment, "suggested WFS fee");
  near(r.wfs.fees.referral, referral, "referral");
  near(r.wfs.fees.fulfillment, fulfillment, "fulfillment");
  near(r.wfs.cashInvested, cash, "WFS cash");
  near(r.wfs.profit, 24.99 - referral - fulfillment - cash, "WFS profit");
  near(r.selected.profit, r.wfs.profit, "selected path is WFS");
  near(r.wfs.margin, (r.wfs.profit / 24.99) * 100, "margin");
  near(r.wfs.roi, (r.wfs.profit / cash) * 100, "ROI");
  assert.equal(r.match, null);
});

test("compares WFS against seller-fulfilled on the same listing", () => {
  const r = calculateListing({ ...base, fulfillmentMethod: "seller" });
  const referral = 24.99 * 0.15;
  const sellerCash = 7 + 0.5 + 4.5;
  near(r.seller.fees.fulfillment, 0, "seller-fulfilled has no WFS fee");
  near(r.seller.cashInvested, sellerCash, "seller cash");
  near(r.seller.profit, 24.99 - referral - sellerCash, "seller profit");
  near(r.selected.profit, r.seller.profit, "selected path is seller");
  assert.equal(r.cheaperPath, r.wfs.profit > r.seller.profit ? "wfs" : "seller");
});

test("reports max buy cost that drives profit to zero", () => {
  const r = calculateListing(base);
  const rebuilt = calculateListing({ ...base, costOfGoods: r.wfs.breakEvenBuyCost });
  near(rebuilt.wfs.profit, 0, "buying at max buy cost zeros WFS profit");
});

test("uses the referral floor when the break-even price is cheap", () => {
  const cheap = breakEvenSalePrice({
    fixedCash: 1.2,
    referralRate: 15,
    referralMinimum: 0.3,
  });
  // 1.2 / 0.85 = 1.412, which is below 0.30 / 0.15 = 2, so the floor applies.
  near(cheap, 1.5, "fixed cash plus the $0.30 floor");
  const mid = breakEvenSalePrice({
    fixedCash: 10,
    referralRate: 15,
    referralMinimum: 0.3,
  });
  near(mid, 10 / 0.85, "percentage path once price clears the floor");
});

test("price-match view shows whether matching still leaves a profit", () => {
  const r = calculateListing({ ...base, matchPrice: 19.99 });
  assert.ok(r.match);
  near(r.match.salePrice, 19.99, "match sale price");
  near(r.matchDelta, r.match.selected.profit - r.selected.profit, "delta");
  assert.equal(r.matchStillProfitable, r.match.selected.profit >= 0);
  assert.ok(r.matchDelta < 0, "matching a lower price reduces profit");
});

test("matching at the list price is a wash", () => {
  const r = calculateListing({ ...base, matchPrice: 24.99 });
  near(r.matchDelta, 0, "same price");
  assert.equal(r.matchStillProfitable, r.selected.profit >= 0);
});

test("rejects invalid fulfillment methods and target margins", () => {
  assert.throws(() => calculateListing({ ...base, fulfillmentMethod: "fba" }), /wfs or seller/);
  assert.throws(() => calculateListing({ ...base, targetMargin: 100 }), /less than 100/);
  assert.throws(
    () => calculateListing({ ...base, monthlySellerFee: 20, monthlyUnits: 0 }),
    /Monthly units must be greater than zero/,
  );
});

test("exports the default referral floor sellers can edit", () => {
  assert.equal(DEFAULT_REFERRAL_MINIMUM, 0.3);
});
