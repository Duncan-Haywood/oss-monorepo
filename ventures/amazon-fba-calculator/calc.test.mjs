import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCategoryPreset,
  applyStoragePreset,
  calculateListing,
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
  vineUnitCost,
  DEFAULT_VINE_UNITS,
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
