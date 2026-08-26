import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCategoryPreset,
  applyStoragePreset,
  breakEvenSalePrice,
  calculateListing,
  CATEGORY_PRESETS,
  classifySizeTier,
  compareReturns,
  compareTwoDay,
  cubicFeet,
  DEFAULT_REFERRAL_MINIMUM,
  defaultFulfillmentFee,
  referralFee,
  RETURN_DEFAULTS,
  RETURN_RATE_PRESETS,
  STORAGE_PRESETS,
  TWO_DAY_DEFAULTS,
  twoDayNote,
  returnsSummary,
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

test("WFS 2-day beats a seller 2-day label on the page defaults", () => {
  const r = compareTwoDay(base);
  const listing = calculateListing(base);
  const labor = (6 / 60) * 18;
  const twoDayCompleted = listing.seller.profit + 4.5 - 8.95 - labor;

  near(r.laborCost, 1.8, "6 min at $18");
  near(r.wfs.completedProfit, listing.wfs.profit, "WFS completed");
  near(r.standard.completedProfit, listing.seller.profit, "standard completed");
  near(r.twoDay.completedProfit, twoDayCompleted, "2-day completed");
  near(r.sessions, 75, "60 WFS units at 80% take");
  near(r.wfs.expectedProfit, 0.8 * listing.wfs.profit, "WFS expected");
  near(r.twoDay.expectedProfit, 0.7 * twoDayCompleted, "2-day expected");
  near(r.standard.expectedProfit, 0.35 * listing.seller.profit, "standard expected");
  near(r.extraTwoDayVsWfs, r.twoDay.expectedProfit - r.wfs.expectedProfit, "2-day gap");
  near(r.monthlyExtraOnTwoDay, r.extraTwoDayVsWfs * 75, "monthly 2-day gap");
  assert.equal(r.winner, "wfs");
  assert.ok(r.extraTwoDayVsWfs < 0, "seller 2-day loses on these rates");
  near(r.wfs.expectedProfit, 6.9198666666666675, "locked WFS expected");
  near(r.twoDay.expectedProfit, 2.0940499999999993, "locked 2-day expected");
  near(r.standard.expectedProfit, 3.234524999999999, "locked standard expected");
  near(r.breakEvenTwoDayShipping, 2.055976190476187, "locked 2-day label ceiling");
  near(r.breakEvenStandardTakePct, 74.8781763422244, "locked standard take floor");
  assert.equal(r.breakEvenTwoDayTakePct, Infinity, "2-day leftover cannot match WFS even at 100%");
  assert.match(twoDayNote(r), /WFS keeps \$4\.83 more per session/);
  assert.match(twoDayNote(r), /\$2\.06/);
  assert.match(twoDayNote(r), /unreachable take rate/);
});

test("a cheap 2-day label at matched take flips ahead of WFS", () => {
  const r = compareTwoDay({
    ...base,
    twoDayShippingCost: 4.5,
    twoDayMinutes: 0,
    twoDayTakePct: 80,
  });
  assert.equal(r.winner, "two_day");
  near(r.twoDay.completedProfit, r.standard.completedProfit, "same label as standard");
  assert.ok(r.extraTwoDayVsWfs > 0, "matched take + no WFS inbound beats WFS");
  near(r.extraTwoDayVsWfs, 0.47333333333333183, "locked flip gap");
  assert.match(twoDayNote(r), /Seller-fulfilled 2-day keeps \$0\.47 more/);
});

test("90% standard take flips ahead of WFS on the same listing", () => {
  const r = compareTwoDay({ ...base, standardTakePct: 90 });
  assert.equal(r.winner, "standard");
  near(r.extraStandardVsWfs, 1.3974833333333319, "locked standard flip");
  assert.match(twoDayNote(r), /Seller-fulfilled standard shipping keeps \$1\.40 more/);
});

test("rejects invalid two-day take rates and zero WFS volume", () => {
  assert.throws(() => compareTwoDay({ ...base, wfsTakePct: 0 }), /WFS take percent must be greater than zero/);
  assert.throws(() => compareTwoDay({ ...base, twoDayTakePct: 101 }), /at most 100/);
  assert.throws(() => compareTwoDay({ ...base, monthlyUnits: 0 }), /greater than zero/);
  assert.throws(() => twoDayNote({}), /missing rows/);
});

test("exports the two-day defaults the page starts from", () => {
  assert.equal(TWO_DAY_DEFAULTS.twoDayShippingCost, 8.95);
  assert.equal(TWO_DAY_DEFAULTS.twoDayMinutes, 6);
  assert.equal(TWO_DAY_DEFAULTS.wfsTakePct, 80);
  assert.equal(TWO_DAY_DEFAULTS.twoDayTakePct, 70);
  assert.equal(TWO_DAY_DEFAULTS.standardTakePct, 35);
});

test("zero returns leaves the completed-sale leftover untouched", () => {
  const completed = calculateListing(base);
  const mixed = compareReturns({
    ...base,
    returnRate: 0,
    returnHandlingFee: 2.75,
    unsellableReturnRate: 20,
  });
  near(mixed.typed.selected.profit, completed.selected.profit, "no drag at 0%");
  near(mixed.typed.selected.returnDrag, 0, "zero drag");
  near(mixed.typed.selected.profitBeforeReturns, completed.selected.profit, "before");
  assert.equal(mixed.typed.selected.breakEvenReturnRate > 0, true);
});

test("an 18% Walmart return rate drags WFS leftover and can wipe it", () => {
  const completed = calculateListing(base);
  const mixed = compareReturns({
    ...base,
    returnRate: 18,
    returnHandlingFee: 2.75,
    unsellableReturnRate: 20,
  });
  const referral = 24.99 * 0.15;
  const fulfillment = defaultFulfillmentFee("standard", 0.75);
  const cashExCogs = completed.wfs.cashInvested - 7;
  const keep = 0.82;
  const cogsFactor = 1 - 0.18 * 0.8;
  const expected =
    keep * 24.99
    - keep * referral
    - fulfillment
    - cashExCogs
    - 0.18 * 2.75
    - 7 * cogsFactor;
  near(mixed.typed.wfs.profit, expected, "WFS expected after returns");
  near(mixed.typed.selected.profitBeforeReturns, completed.wfs.profit, "completed WFS");
  assert.ok(mixed.typed.selected.returnDrag > 0, "returns drag leftover");
  assert.ok(mixed.typed.selected.profit < completed.wfs.profit, "mixed is below completed");
  assert.ok(mixed.typed.seller.profit > mixed.typed.wfs.profit, "seller keeps more: no WFS pick left spent");
  const stayValue = 24.99 - referral + 2.75 - 7 * 0.8;
  near(mixed.typed.selected.breakEvenReturnRate, completed.wfs.profit / stayValue, "wipe rate");
  assert.deepEqual(mixed.rows.map((row) => row.returnRate), [0, 10, 18, 28]);
  assert.equal(mixed.rows.find((row) => row.isCurrent).returnRate, 18);
  assert.match(returnsSummary({
    typedRate: mixed.returnRate,
    handling: mixed.returnHandlingFee,
    unsellable: mixed.unsellableReturnRate,
    typed: mixed.typed,
  }), /18% return rate/);
  near(mixed.typed.wfs.profit, 5.3393633333333375, "locked WFS expected");
  near(mixed.typed.selected.returnDrag, 3.310469999999996, "locked drag");
  near(mixed.typed.selected.breakEvenReturnRate, 0.4703169036420811, "locked wipe");
  near(mixed.typed.seller.profit, 5.9310300000000025, "locked seller expected");
});

test("100% unsellable returns still recover nothing of cost of goods", () => {
  const mixed = compareReturns({
    ...base,
    returnRate: 100,
    returnHandlingFee: 2.75,
    unsellableReturnRate: 100,
  });
  const completed = calculateListing(base);
  const cashExCogs = completed.wfs.cashInvested - 7;
  const expected = 0 - 0 - completed.fulfillmentFee - cashExCogs - 2.75 - 7;
  near(mixed.typed.wfs.profit, expected, "full refund, dead unit, handling");
  assert.equal(mixed.typed.wfs.breakEvenBuyCost, 0);
});

test("rejects impossible return rates", () => {
  assert.throws(() => compareReturns({ ...base, returnRate: 101 }), /at most 100/);
  assert.throws(() => compareReturns({ ...base, unsellableReturnRate: 101 }), /at most 100/);
});

test("exports the return defaults the page starts from", () => {
  assert.equal(RETURN_DEFAULTS.returnRate, 18);
  assert.equal(RETURN_DEFAULTS.returnHandlingFee, 2.75);
  assert.equal(RETURN_DEFAULTS.unsellableReturnRate, 20);
  assert.deepEqual(RETURN_RATE_PRESETS, [0, 10, 18, 28]);
});
