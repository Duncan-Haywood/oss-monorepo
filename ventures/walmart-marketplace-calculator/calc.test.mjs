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
