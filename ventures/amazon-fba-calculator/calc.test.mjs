import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCategoryPreset,
  applyStoragePreset,
  calculateListing,
  CATEGORY_PRESETS,
  classifySizeTier,
  compareSellerPlans,
  cubicFeet,
  defaultFulfillmentFee,
  SELLER_PLAN_DEFAULTS,
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
