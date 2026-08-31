import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGED_WFS_DEFAULTS,
  agedWfsNote,
  applyCategoryPreset,
  applyStoragePreset,
  breakEvenSalePrice,
  calculateListing,
  CATEGORY_PRESETS,
  classifySizeTier,
  compareAgedWfs,
  compareTwoDay,
  compareReturns,
  compareWalmartAds,
  compareMatchTake,
  compareWfsBox,
  sizeTierGaps,
  wfsBoxNote,
  WFS_BOX_DEFAULTS,
  cubicFeet,
  DEFAULT_REFERRAL_MINIMUM,
  defaultFulfillmentFee,
  referralFee,
  RETURNS_DEFAULTS,
  STORAGE_PRESETS,
  TWO_DAY_DEFAULTS,
  WALMART_ADS_DEFAULTS,
  MATCH_TAKE_DEFAULTS,
  twoDayNote,
  returnsNote,
  walmartAdsNote,
  matchTakeNote,
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

test("a listing that already loses money at $0 cost reports a negative raw ceiling, not a bare $0", () => {
  // Fees and non-COGS cash costs alone exceed a $3 sale price, so no sourcing
  // cost -- not even free -- reaches break-even. The clamped display value
  // (breakEvenBuyCost) floors at $0.00, which reads as "buy at up to $0 and
  // still break even" -- indistinguishable from a listing that genuinely
  // breaks even on a free unit. breakEvenBuyCostRaw keeps the signed figure
  // so a $0.00 ceiling and an already-underwater listing can be told apart.
  // Same bug class already fixed for amazon-fba-calculator's maxBuyCost.
  const losing = calculateListing({ ...base, salePrice: 3, costOfGoods: 0 });
  near(losing.wfs.profit, -3.0416666666666665, "loses money on this listing even at $0 cost of goods");
  assert.equal(losing.wfs.breakEvenBuyCost, 0, "display value floors at $0");
  assert.ok(losing.wfs.breakEvenBuyCostRaw < 0, "the true ceiling is negative, not a genuine $0 break-even");
  near(losing.wfs.breakEvenBuyCostRaw, -3.0416666666666665, "raw ceiling matches the real deficit");
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

test("seller fulfilled still keeps more after an 8% Walmart return mix", () => {
  const r = compareReturns(base);
  const listing = calculateListing(base);
  const labor = (8 / 60) * 18;
  const wfsSunk = listing.wfs.cashInvested - 7 + listing.fulfillmentFee;
  const sellerSunk = listing.seller.cashInvested - 7;
  const wfsReturn = -wfsSunk - 2.5 - 0.25 * 7;
  const sellerReturn = -sellerSunk - 5.5 - labor - 0.25 * 7;

  near(r.restockLabor, 2.4, "8 min at $18");
  near(r.wfs.completedProfit, listing.wfs.profit, "WFS completed");
  near(r.seller.completedProfit, listing.seller.profit, "seller completed");
  near(r.wfs.returnLeftover, wfsReturn, "WFS return leftover");
  near(r.seller.returnLeftover, sellerReturn, "seller return leftover");
  near(r.wfs.expectedProfit, 0.92 * listing.wfs.profit + 0.08 * wfsReturn, "WFS expected");
  near(r.seller.expectedProfit, 0.92 * listing.seller.profit + 0.08 * sellerReturn, "seller expected");
  near(r.extraWfsVsSeller, r.wfs.expectedProfit - r.seller.expectedProfit, "gap");
  near(r.monthlyExtraOnWfs, r.extraWfsVsSeller * 60, "monthly gap");
  assert.equal(r.winner, "seller");
  assert.equal(r.completedWinner, "seller");
  near(r.wfs.expectedProfit, 7.170513333333334, "locked WFS expected");
  near(r.seller.expectedProfit, 7.330179999999999, "locked seller expected");
  near(r.wfs.returnLeftover, -9.841666666666665, "locked WFS return");
  near(r.seller.returnLeftover, -14.65, "locked seller return");
  near(r.breakEvenReturnPct, 10.956790123456756, "locked return-rate floor");
  assert.match(returnsNote(r), /seller fulfilled keeps \$0\.16 more per unit/);
  assert.match(returnsNote(r), /\$7\.33 vs \$7\.17/);
  assert.match(returnsNote(r), /11\.0%/);
});

test("a 20% return mix flips WFS ahead of seller fulfilled", () => {
  const r = compareReturns({ ...base, returnRatePct: 20 });
  assert.equal(r.winner, "wfs");
  assert.equal(r.completedWinner, "seller");
  near(r.extraWfsVsSeller, 0.48833333333333595, "locked 20% flip");
  assert.match(returnsNote(r), /WFS keeps \$0\.49 more per unit/);
  assert.match(returnsNote(r), /returns flip the mix/);
});

test("a waived WFS return fee flips the 8% mix", () => {
  const r = compareReturns({ ...base, wfsReturnFee: 0 });
  assert.equal(r.winner, "wfs");
  near(r.extraWfsVsSeller, 0.040333333333334664, "locked waived-fee flip");
  assert.match(returnsNote(r), /WFS keeps \$0\.04 more per unit/);
});

test("rejects invalid return rates and zero volume", () => {
  assert.throws(() => compareReturns({ ...base, returnRatePct: 101 }), /at most 100/);
  assert.throws(() => compareReturns({ ...base, unsellableReturnPct: 101 }), /at most 100/);
  assert.throws(() => compareReturns({ ...base, monthlyUnits: 0 }), /greater than zero/);
  assert.throws(() => compareReturns({ ...base, referralRefunded: "maybe" }), /true or false/);
  assert.throws(() => returnsNote({}), /missing rows/);
});

test("exports the returns defaults the page starts from", () => {
  assert.equal(RETURNS_DEFAULTS.returnRatePct, 8);
  assert.equal(RETURNS_DEFAULTS.wfsReturnFee, 2.5);
  assert.equal(RETURNS_DEFAULTS.sellerReturnLabel, 5.5);
  assert.equal(RETURNS_DEFAULTS.restockMinutes, 8);
  assert.equal(RETURNS_DEFAULTS.unsellableReturnPct, 25);
});

test("pulling a slow leftover WFS pile still beats leaving it for 4 months", () => {
  const r = compareAgedWfs(base);
  const listing = calculateListing(base);
  const keepContribution = 24.99 - listing.referral - listing.fulfillmentFee;
  const sellerContribution = 24.99 - listing.referral - 4.5 - 0.5;

  near(r.keepContribution, keepContribution, "WFS contribution ignores sunk inbound");
  near(r.sellerContribution, sellerContribution, "seller contribution after a new label");
  near(r.storagePerUnitMonth, listing.cubicFeet * 2.1, "aged rate on leftover cu ft");
  near(r.remove.cash, 40 * (sellerContribution - 1.25), "remove cash");
  near(r.dispose.cash, -0.35 * 40, "dispose cash");
  assert.equal(r.winner, "remove");
  near(r.keep.cash, 261.3073046357333, "locked keep cash");
  near(r.remove.cash, 599.66, "locked remove cash");
  near(r.extraRemoveVsKeep, 338.35269536426665, "locked pull gap");
  near(r.breakEvenSellThroughVsRemove, 41.31343147224591, "locked sell-through floor");
  near(r.keep.soldUnits, 16.012185600000002, "12% over 4 months sells ~16");
  assert.ok(r.keep.leftoverUnits > 23, "most of the pile is still sitting");
  assert.match(agedWfsNote(r), /keeps \$338\.35 more/);
  assert.match(agedWfsNote(r), /\$599\.66 vs \$261\.31/);
  assert.match(agedWfsNote(r), /41\.3%/);
});

test("55% monthly sell-through flips the leftover pile back to WFS", () => {
  const r = compareAgedWfs({ ...base, monthlySellThroughPct: 55 });
  assert.equal(r.winner, "keep");
  near(r.extraRemoveVsKeep, -55.5007004583332, "locked keep flip");
  assert.match(agedWfsNote(r), /Leaving the 40 leftover units in WFS keeps \$55\.50 more/);
  assert.match(agedWfsNote(r), /41\.3%/);
});

test("reports the real aged-storage crossing instead of always 0", () => {
  // `breakEvenAgedRateVsRemove`'s bisection built its own `keepArgs` object
  // without `sellThroughPct`, so every point it sampled sold NaN units and
  // its `cash` came back NaN. `NaN < x` and `NaN >= x` are both false, which
  // drove the bisection's `hi` straight to 0 on every run -- the page always
  // told the seller the crossing was "$0.00/cu ft" (i.e. unreachable)
  // regardless of the real number, even when keeping clearly wins at low
  // storage rates.
  const scenario = {
    salePrice: 34.99,
    referralRate: 15,
    referralMinimum: 0.3,
    length: 12,
    width: 9,
    height: 5,
    weightLb: 2.2,
    costOfGoods: 9,
    inboundPerUnit: 1.2,
    monthsInStorage: 1,
    storageRate: 0.75,
    sellerShippingCost: 6.5,
    packagingCost: 1,
    otherCost: 0,
    adsPerUnit: 0,
    leftoverUnits: 150,
    monthlySellThroughPct: 25,
    horizonMonths: 8,
    removalFee: 2,
    disposalFee: 3,
    agedStorageRate: 6.518497919457394,
  };
  const r = compareAgedWfs(scenario);
  assert.equal(r.winner, "remove");

  // Ground truth from the same formula the page reports, sampled on both
  // sides of the reported crossing -- independent of the bisection under
  // test, which only ever touches its own internal `keepArgs`.
  const below = compareAgedWfs({ ...scenario, agedStorageRate: r.breakEvenAgedRateVsRemove - 0.05 });
  const above = compareAgedWfs({ ...scenario, agedStorageRate: r.breakEvenAgedRateVsRemove + 0.05 });
  assert.ok(below.keep.cash > below.remove.cash, "keeping still wins just below the reported crossing");
  assert.ok(above.keep.cash < above.remove.cash, "removing already wins just above the reported crossing");

  near(r.breakEvenAgedRateVsRemove, 1.5184979194573884, "locked aged-storage crossing");
  assert.match(agedWfsNote(r), /Aged storage can fall to about \$1\.52\/cu ft before keeping matches\./);
});

test("rejects invalid leftover, horizon, and sell-through inputs", () => {
  assert.throws(() => compareAgedWfs({ ...base, leftoverUnits: 0 }), /greater than zero/);
  assert.throws(() => compareAgedWfs({ ...base, horizonMonths: 0 }), /greater than zero/);
  assert.throws(() => compareAgedWfs({ ...base, monthlySellThroughPct: 101 }), /at most 100/);
  assert.throws(() => agedWfsNote({}), /missing rows/);
});

test("exports the aged WFS defaults the page starts from", () => {
  assert.equal(AGED_WFS_DEFAULTS.leftoverUnits, 40);
  assert.equal(AGED_WFS_DEFAULTS.monthlySellThroughPct, 12);
  assert.equal(AGED_WFS_DEFAULTS.horizonMonths, 4);
  assert.equal(AGED_WFS_DEFAULTS.agedStorageRate, STORAGE_PRESETS.long_term.perCuFt);
  assert.equal(AGED_WFS_DEFAULTS.removalFee, 1.25);
  assert.equal(AGED_WFS_DEFAULTS.disposalFee, 0.35);
});

test("skipping Walmart Connect still beats 15% ACOS after last-click on organic", () => {
  const r = compareWalmartAds(base);
  const listing = calculateListing({ ...base, adsPerUnit: 0 });
  const organic = listing.selected.profit;
  const adSpend = 24.99 * 0.15;
  const billed = 60 * 0.4 + 12;

  near(r.organicProfit, organic, "organic leftover ignores a typed ads line");
  near(r.skip.cash, 60 * organic, "skip cash");
  near(r.sponsored.adSpend, billed * adSpend, "sponsored bill");
  near(r.sponsored.cash, 60 * organic + 12 * organic - billed * adSpend, "sponsored cash");
  assert.equal(r.winner, "skip");
  near(r.skip.cash, 518.99, "locked skip cash");
  near(r.sponsored.cash, 487.842, "locked sponsored cash");
  near(r.higher.cash, 384.41633333333334, "locked higher-ACOS cash");
  near(r.extraSponsoredVsSkip, -31.147999999999968, "locked ads gap");
  near(r.breakEvenAcosPct, 11.537726201591749, "locked ACOS ceiling");
  near(r.breakEvenExtraAdUnits, 18.355005440696406, "locked extra-unit floor");
  near(r.breakEvenAttributedOrganicPct, 26.150904806366995, "locked attribution ceiling");
  assert.match(walmartAdsNote(r), /keeps \$31\.15 more/);
  assert.match(walmartAdsNote(r), /\$518\.99 vs \$487\.84/);
  assert.match(walmartAdsNote(r), /11\.5%/);
});

test("an 8% ACOS flips Sponsored Products ahead of skipping ads", () => {
  const r = compareWalmartAds({ ...base, acosPct: 8 });
  assert.equal(r.winner, "sponsored");
  near(r.extraSponsoredVsSkip, 31.82680000000005, "locked ACOS flip");
  assert.match(walmartAdsNote(r), /keeps \$31\.83 more/);
});

test("does not leak a typed adsPerUnit into the organic leftover", () => {
  const baseline = compareWalmartAds(base);
  const overridden = compareWalmartAds({ ...base, adsPerUnit: 9 });
  near(overridden.organicProfit, baseline.organicProfit, "adsPerUnit is forced to zero");
  near(overridden.skip.cash, baseline.skip.cash, "skip cash stays organic");
});

test("rejects invalid ACOS, attribution, and zero volume", () => {
  assert.throws(() => compareWalmartAds({ ...base, acosPct: 101 }), /at most 100/);
  assert.throws(() => compareWalmartAds({ ...base, attributedOrganicPct: 101 }), /at most 100/);
  assert.throws(() => compareWalmartAds({ ...base, monthlyUnits: 0 }), /greater than zero/);
  assert.throws(() => walmartAdsNote({}), /missing rows/);
});

test("exports the Walmart Connect defaults the page starts from", () => {
  assert.equal(WALMART_ADS_DEFAULTS.acosPct, 15);
  assert.equal(WALMART_ADS_DEFAULTS.extraAdUnits, 12);
  assert.equal(WALMART_ADS_DEFAULTS.attributedOrganicPct, 40);
  assert.equal(WALMART_ADS_DEFAULTS.highAcosPct, 25);
  assert.equal(WALMART_ADS_DEFAULTS.highExtraAdUnits, 22);
  assert.equal(WALMART_ADS_DEFAULTS.highAttributedOrganicPct, 50);
});

test("a 70% match take still beats holding the $24.99 list after Buy Box mix", () => {
  const r = compareMatchTake(base);
  const listing = calculateListing({ ...base, matchPrice: undefined });
  const matched = calculateListing({ ...base, salePrice: 21.99, matchPrice: undefined });
  const holdCompleted = listing.selected.profit;
  const matchCompleted = matched.selected.profit;
  const sessions = 60 / 0.4;

  near(r.hold.completedProfit, holdCompleted, "hold unit leftover");
  near(r.match.completedProfit, matchCompleted, "match unit leftover");
  near(r.sessions, sessions, "sessions from hold take");
  near(r.hold.monthlyProfit, 60 * holdCompleted, "hold monthly");
  near(r.match.monthlyProfit, sessions * 0.7 * matchCompleted, "match monthly");
  near(r.promo.monthlyProfit, sessions * ((10 / 30) * 0.8 * matchCompleted + (20 / 30) * 0.4 * holdCompleted), "promo monthly");
  assert.equal(r.winner, "match");
  near(r.hold.monthlyProfit, 518.99, "locked hold cash");
  near(r.match.monthlyProfit, 640.4825, "locked match cash");
  near(r.promo.monthlyProfit, 589.9866666666668, "locked promo cash");
  near(r.extraMatchVsHold, 121.49249999999984, "locked match gap");
  near(r.breakEvenMatchTakePct, 56.72176835432663, "locked match-take floor");
  near(r.breakEvenPromoDays, 17.112423118456245, "locked promo-day floor");
  near(r.breakEvenMatchPrice, 20.628739495798317, "locked match-price floor");
  assert.match(matchTakeNote(r), /keeps \$121\.49 more/);
  assert.match(matchTakeNote(r), /\$640\.48 vs \$518\.99/);
  assert.match(matchTakeNote(r), /17\.1 promo days/);
  assert.match(matchTakeNote(r), /56\.7%/);
});

test("a 20-day promo flips ahead of a permanent match", () => {
  const r = compareMatchTake({ ...base, promoDays: 20 });
  assert.equal(r.winner, "promo");
  near(r.extraMatchVsPromo, -20.500833333333617, "locked promo flip");
  assert.match(matchTakeNote(r), /keeps \$141\.99 more/);
  assert.match(matchTakeNote(r), /\$660\.98 vs \$518\.99/);
});

test("a 50% match take flips the leftover back to holding the list", () => {
  const r = compareMatchTake({ ...base, matchTakePct: 50, promoTakePct: 50 });
  assert.equal(r.winner, "hold");
  near(r.extraMatchVsHold, -61.50250000000005, "locked hold flip");
  assert.match(matchTakeNote(r), /keeps \$61\.50 more/);
  assert.match(matchTakeNote(r), /\$518\.99 vs \$457\.49/);
});

test("uses the selected fulfillment path and the typed match price", () => {
  const wfs = compareMatchTake(base);
  const seller = compareMatchTake({ ...base, fulfillmentMethod: "seller" });
  assert.notEqual(wfs.hold.completedProfit, seller.hold.completedProfit);
  assert.equal(wfs.match.salePrice, 21.99);
  assert.equal(wfs.promo.salePrice, 21.99);
  assert.equal(wfs.hold.salePrice, 24.99);
});

test("rejects invalid take, promo length, and zero volume", () => {
  assert.throws(() => compareMatchTake({ ...base, holdTakePct: 0 }), /greater than zero/);
  assert.throws(() => compareMatchTake({ ...base, holdTakePct: 101 }), /at most 100/);
  assert.throws(() => compareMatchTake({ ...base, matchTakePct: 101 }), /at most 100/);
  assert.throws(() => compareMatchTake({ ...base, promoTakePct: 101 }), /at most 100/);
  assert.throws(() => compareMatchTake({ ...base, monthlyUnits: 0 }), /greater than zero/);
  assert.throws(() => compareMatchTake({ ...base, monthDays: 0 }), /greater than zero/);
  assert.throws(() => compareMatchTake({ ...base, promoDays: 40 }), /cannot exceed/);
  assert.throws(() => matchTakeNote({}), /missing rows/);
});

test("exports the match-take defaults the page starts from", () => {
  assert.equal(MATCH_TAKE_DEFAULTS.holdTakePct, 40);
  assert.equal(MATCH_TAKE_DEFAULTS.matchPrice, 21.99);
  assert.equal(MATCH_TAKE_DEFAULTS.matchTakePct, 70);
  assert.equal(MATCH_TAKE_DEFAULTS.promoTakePct, 80);
  assert.equal(MATCH_TAKE_DEFAULTS.promoDays, 10);
  assert.equal(MATCH_TAKE_DEFAULTS.monthDays, 30);
});

// --- WFS box / size-tier repack -------------------------------------------
// The lever that does not touch the price: the fulfillment fee is a step
// function of the shipped carton, so these assert the steps, the three ways a
// repack fails to pay, and the per-measurement gap that tells a seller what to
// shave.

test("sizeTierGaps names each measurement that misses Standard", () => {
  const over = sizeTierGaps({ length: 19, width: 13, height: 7, weightLb: 3 });
  assert.equal(over.clears, false);
  assert.deepEqual(over.blocking.map((row) => row.id), ["longest"]);
  near(over.blocking[0].over, 1, "longest side overage");

  const many = sizeTierGaps({ length: 24, width: 16, height: 9, weightLb: 25 });
  assert.deepEqual(many.blocking.map((row) => row.id), ["longest", "median", "shortest", "weight"]);

  const inside = sizeTierGaps({ length: 10, width: 8, height: 4, weightLb: 1 });
  assert.equal(inside.clears, true);
  assert.equal(inside.blocking.length, 0);
  assert.ok(inside.rows.every((row) => row.over === 0), "a Standard box is over on nothing");
});

test("sizeTierGaps sorts the sides rather than trusting the field names", () => {
  // A seller who types height into the length box must get the same answer.
  const a = sizeTierGaps({ length: 7, width: 19, height: 13, weightLb: 3 });
  const b = sizeTierGaps({ length: 19, width: 13, height: 7, weightLb: 3 });
  assert.deepEqual(a.blocking.map((r) => r.id), b.blocking.map((r) => r.id));
  near(a.blocking[0].over, b.blocking[0].over, "same box, same overage");
});

test("compareWfsBox prices a tier drop and nets off the repack", () => {
  const r = compareWfsBox({});
  assert.equal(r.current.tier, "oversize");
  assert.equal(r.repacked.tier, "standard");
  assert.equal(r.tierChanged, true);
  near(r.current.fulfillmentFee, defaultFulfillmentFee("oversize", 3), "fee today");
  near(r.repacked.fulfillmentFee, defaultFulfillmentFee("standard", 2.9), "fee repacked");
  near(r.feeSaving, r.current.fulfillmentFee - r.repacked.fulfillmentFee, "fee saving");
  near(r.netPerUnit, r.feeSaving - WFS_BOX_DEFAULTS.repackCostPerUnit, "net per unit");
  near(r.monthlySaving, r.netPerUnit * WFS_BOX_DEFAULTS.monthlyUnits, "monthly saving");
  assert.equal(r.winner, "repacked");
});

test("compareWfsBox calls a repack that changes no fee a straight loss", () => {
  // Half an inch off a 19-inch side is still Oversize. The tool that says
  // "saves $0.00" and stops has hidden the labour the seller just paid for.
  const r = compareWfsBox({ newLength: 18.9, newWidth: 13, newHeight: 7, newWeightLb: 3 });
  assert.equal(r.tierChanged, false);
  near(r.feeSaving, 0, "no fee moved");
  assert.equal(r.winner, "current");
  assert.ok(r.monthlySaving < 0, "the repack cost is still spent");
  assert.match(r.summary, /saves nothing/);
  assert.match(r.summary, /longest side is 0\.90 in over/);
});

test("compareWfsBox reports a repack that raises the fee as worse, not as zero", () => {
  // Same carton, heavier: a "repack" that consolidated two units into one box
  // and stayed Oversize, which is the shape that actually shows up.
  const r = compareWfsBox({ newLength: 19, newWidth: 13, newHeight: 7, newWeightLb: 6 });
  assert.equal(r.tierChanged, false, "still Oversize");
  assert.ok(r.feeSaving < 0, "heavier box costs more");
  assert.equal(r.winner, "current");
  assert.match(r.summary, /more per unit to fulfil, not less/);
  // A negative break-even is reported, not clamped: no repack cost rescues it.
  assert.ok(r.breakEvenRepackCost < 0, "break-even stays negative");
});

test("compareWfsBox lets the repack cost outweigh a real tier drop", () => {
  const r = compareWfsBox({ repackCostPerUnit: 5 });
  assert.equal(r.tierChanged, true, "the tier really does drop");
  assert.ok(r.feeSaving > 0, "and the fee really does fall");
  assert.equal(r.winner, "current", "but the labour costs more than it saves");
  near(r.breakEvenRepackCost, r.feeSaving, "break-even is the fee saving");
});

test("compareWfsBox ties when the repack costs exactly the fee it saves", () => {
  const first = compareWfsBox({});
  const r = compareWfsBox({ repackCostPerUnit: first.feeSaving });
  assert.equal(r.winner, "tie");
  near(r.netPerUnit, 0, "level");
});

test("compareWfsBox rejects a zero monthly volume rather than dividing by it", () => {
  assert.throws(() => compareWfsBox({ monthlyUnits: 0 }), /Monthly units/);
});

test("wfsBoxNote returns the summary and refuses a comparison without rows", () => {
  const r = compareWfsBox({});
  assert.equal(wfsBoxNote(r), r.summary);
  assert.throws(() => wfsBoxNote({}), /missing rows/);
  assert.throws(() => wfsBoxNote(null), /missing rows/);
});

// Two loss-making paths still cross at a real take rate.
//
// Expected profit on a take path is `take% × completed profit`. When the
// completed sale loses money that product is negative, so a HIGHER take rate
// books more of the loss and the path is better BELOW the crossing rather than
// above it. The old guard (`completed > 1e-12`) refused to compute a crossing
// at all in that regime and the page said "an unreachable take rate" — for a
// rate that is both reachable and the one the seller would act on.
//
// The rates below are derived from `calculateListing` output by plain
// division, never by calling the formula under test.
test("a loss-making standard path reports the take rate it stops beating WFS at", () => {
  const input = { ...base, costOfGoods: 30, twoDayShippingCost: 3 };
  const r = compareTwoDay(input);

  const listing = calculateListing(input);
  assert.ok(listing.wfs.profit < 0, "WFS loses money on a $30 cost at $24.99");
  assert.ok(listing.seller.profit < 0, "seller fulfilment loses money too");

  // Independent derivation: take% where standard's expected ties WFS's.
  const wfsExpected = (TWO_DAY_DEFAULTS.wfsTakePct / 100) * listing.wfs.profit;
  const expectedCrossing = (wfsExpected / listing.seller.profit) * 100;
  assert.ok(
    expectedCrossing > 0 && expectedCrossing <= 100,
    `crossing should be reachable, got ${expectedCrossing}`,
  );
  near(r.breakEvenStandardTakePct, expectedCrossing, "standard take crossing");
  assert.equal(r.standardTakeIsCeiling, true, "a losing path is better below the rate");

  // And the two paths really do tie there — re-run the comparison at the
  // reported rate rather than trusting the algebra.
  const atCrossing = compareTwoDay({ ...input, standardTakePct: r.breakEvenStandardTakePct });
  near(
    atCrossing.standard.expectedProfit,
    atCrossing.wfs.expectedProfit,
    "standard ties WFS at the reported take",
  );

  // Just below it standard is ahead; just above it WFS is.
  const below = compareTwoDay({ ...input, standardTakePct: r.breakEvenStandardTakePct - 5 });
  const above = compareTwoDay({ ...input, standardTakePct: r.breakEvenStandardTakePct + 5 });
  assert.ok(below.standard.expectedProfit > below.wfs.expectedProfit, "ahead below the rate");
  assert.ok(above.standard.expectedProfit < above.wfs.expectedProfit, "behind above it");
});

test("the summary calls a losing path's crossing a ceiling, not a floor", () => {
  const r = compareTwoDay({ ...base, costOfGoods: 30, twoDayShippingCost: 3 });
  assert.equal(r.winner, "standard");
  const note = twoDayNote(r);
  assert.match(note, /stays ahead of WFS until take rises to about/);
  assert.doesNotMatch(note, /unreachable take rate/);
  assert.doesNotMatch(note, /still needs about/);
});

test("a profitable path keeps the floor wording and an out-of-range crossing stays unreachable", () => {
  // Regression guard on the other side of the fix: nothing about the ordinary
  // profitable case changes, and a crossing above 100% is still unreachable
  // because take cannot exceed every session.
  const r = compareTwoDay(base);
  assert.equal(r.standardTakeIsCeiling, false, "a profitable path is better above the rate");
  assert.ok(Number.isFinite(r.breakEvenStandardTakePct));
  assert.match(twoDayNote(r), /take rises to about|still needs about/);

  const listing = calculateListing(base);
  const wfsExpected = (TWO_DAY_DEFAULTS.wfsTakePct / 100) * listing.wfs.profit;
  const twoDayCompleted = r.twoDay.completedProfit;
  assert.ok(
    (wfsExpected / twoDayCompleted) * 100 > 100,
    "this fixture's 2-day crossing is genuinely out of range",
  );
  assert.equal(r.breakEvenTwoDayTakePct, Infinity);
});

test("a loss-making matched sale reports the take rate matching stops winning at", () => {
  const input = { ...base, costOfGoods: 30 };
  let r;
  try {
    r = compareMatchTake(input);
  } catch (error) {
    // compareMatchTake rejects some negative-cash fixtures outright; if this
    // one is rejected the regime is unreachable here and there is nothing to
    // assert, but say so rather than passing silently.
    assert.fail(`fixture rejected: ${error.message}`);
  }
  if (r.match.completedProfit >= 0) {
    assert.fail("fixture no longer produces a loss-making matched sale");
  }
  const expectedCrossing = (r.hold.expectedProfit / r.match.completedProfit) * 100;
  if (expectedCrossing > 0 && expectedCrossing <= 100) {
    near(r.breakEvenMatchTakePct, expectedCrossing, "match take crossing");
    assert.equal(r.matchTakeIsCeiling, true);
    const atCrossing = compareMatchTake({ ...input, matchTakePct: r.breakEvenMatchTakePct });
    near(
      atCrossing.match.expectedProfit,
      atCrossing.hold.expectedProfit,
      "match ties hold at the reported take",
    );
  } else {
    assert.equal(r.breakEvenMatchTakePct, Infinity);
  }
});

test("free clicks have no attribution rate that ties skipping ads", () => {
  // At 0% ACOS the gap is `extra units × organic leftover` no matter what
  // share of organic the ads claim, so the paths never cross. This used to
  // report exactly 100%, which reads as a real answer.
  const r = compareWalmartAds({ ...base, acosPct: 0, extraAdUnits: 12 });
  assert.equal(r.breakEvenAttributedOrganicPct, Infinity);
  const gapAtFullAttribution =
    compareWalmartAds({ ...base, acosPct: 0, extraAdUnits: 12, attributedOrganicPct: 100 })
      .sponsored.cash -
    compareWalmartAds({ ...base, acosPct: 0, extraAdUnits: 12, attributedOrganicPct: 100 })
      .skip.cash;
  assert.ok(
    Math.abs(gapAtFullAttribution) > 1e-9,
    "there is no tie at 100% attribution, so 100% was never the answer",
  );
});

test("an attribution crossing above full attribution is unreachable, not 100%", () => {
  const input = { ...base, acosPct: 5, extraAdUnits: 40 };
  const r = compareWalmartAds(input);
  const raw =
    (r.extraAdUnits * (r.organicProfit - r.salePrice * (r.acosPct / 100)) * 100) /
    (r.organicUnits * r.salePrice * (r.acosPct / 100));
  if (raw <= 100) {
    assert.fail(`fixture no longer exceeds 100% attribution (raw ${raw})`);
  }
  assert.equal(r.breakEvenAttributedOrganicPct, Infinity);
  const at100 = compareWalmartAds({ ...input, attributedOrganicPct: 100 });
  assert.ok(
    at100.sponsored.cash - at100.skip.cash > 1e-9,
    "ads still win at full attribution, so 100% was not a tie",
  );
});
