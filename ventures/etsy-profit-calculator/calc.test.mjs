import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrder, priceForMargin, priceForProfit, compareOffsiteAdRates, maxAffordableOffsiteRate, offsiteAdsNote, compareEtsyPlus, plusBreakEvenListings, plusCreditValueUsed, ETSY_PLUS_DEFAULTS, comparePersonalization, personalizationNote, PERSONALIZATION_DEFAULTS, compareEtsyAds, etsyAdsNote, ETSY_ADS_DEFAULTS, compareProductionPartner, productionPartnerNote, PRODUCTION_PARTNER_DEFAULTS, compareStarSeller, starSellerNote, STAR_SELLER_DEFAULTS, compareShopSale, shopSaleNote, SHOP_SALE_DEFAULTS, compareFreeShipping, freeShippingNote, FREE_SHIPPING_DEFAULTS, calculateListingRenewal, listingRenewalNote, compareEtsyLabels, etsyLabelsNote, etsyLabelsSummary, ETSY_LABELS_DEFAULTS } from './calc.mjs';

const near = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-6, `${msg}: ${actual} vs ${expected}`);

test('calculates the complete fee stack and contribution', () => {
  const result = calculateOrder({ price: 30, shippingCharged: 5, listingFee: .2, transactionRate: 6.5, paymentRate: 3, paymentFixed: .25, offsiteAdRate: 0, shippingCost: 6, materialCost: 4, otherCost: 1 });
  assert.equal(result.revenue, 35);
  assert.equal(result.fees.transaction, 2.275);
  assert.equal(result.fees.payment, 1.3);
  assert.equal(result.profit, 20.225);
  assert.equal(Number(result.margin.toFixed(2)), 57.79);
});

test('includes offsite ads and shipping revenue in percentage fees', () => {
  const result = calculateOrder({ price: 20, shippingCharged: 5, transactionRate: 6.5, paymentRate: 3, offsiteAdRate: 15, shippingCost: 5 });
  assert.equal(result.fees.offsiteAd, 3.75);
  assert.equal(result.profit, 13.425);
});

test('finds the price that covers fixed and percentage costs', () => {
  const result = calculateOrder({ price: 100, listingFee: 1, paymentFixed: 1, transactionRate: 10, paymentRate: 5, shippingCost: 10, materialCost: 5 });
  assert.equal(result.breakEvenPrice, 20);
});

test('finds the item price that covers costs after shipping revenue', () => {
  const input = { shippingCharged: 5, listingFee: 1, paymentFixed: 1, transactionRate: 10, paymentRate: 5, shippingCost: 10, materialCost: 5 };
  const result = calculateOrder({ ...input, price: 100 });
  assert.equal(result.breakEvenPrice, 15);
  // Round-trip: quoting the break-even item price must leave exactly zero.
  assert.equal(calculateOrder({ ...input, price: result.breakEvenPrice }).profit, 0);
});

test('credits shipping charged when finding the break-even item price', () => {
  const result = calculateOrder({
    price: 0,
    shippingCharged: 5,
    listingFee: 1,
    paymentFixed: 1,
    transactionRate: 10,
    paymentRate: 5,
    shippingCost: 10,
    materialCost: 5,
  });
  assert.equal(result.breakEvenPrice, 15);
  assert.equal(calculateOrder({
    price: result.breakEvenPrice,
    shippingCharged: 5,
    listingFee: 1,
    paymentFixed: 1,
    transactionRate: 10,
    paymentRate: 5,
    shippingCost: 10,
    materialCost: 5,
  }).profit, 0);
});

test('rejects negative or non-numeric inputs', () => {
  assert.throws(() => calculateOrder({ price: -1 }));
  assert.throws(() => calculateOrder({ price: 'nope' }));
});

test('rejects percentage fee rates that make break-even impossible', () => {
  assert.throws(() => calculateOrder({ price: 10, transactionRate: 60, paymentRate: 40 }), /below 100/);
  assert.throws(() => calculateOrder({ price: 10, transactionRate: 70, paymentRate: 30 }), /below 100/);
  assert.throws(() => calculateOrder({ price: 10, transactionRate: 40, paymentRate: 30, offsiteAdRate: 30 }), /below 100/);
});

test('rejects impossible combined percentage fees for target pricing', () => {
  assert.throws(() => priceForMargin({ transactionRate: 101 }, 0), /must total less than 100%/);
  assert.throws(() => priceForProfit({ transactionRate: 101 }, 1), /must total less than 100%/);
});

test('finds the item price for a target margin', () => {
  const input = { shippingCharged: 5, listingFee: .2, paymentFixed: .25, transactionRate: 6.5, paymentRate: 3, shippingCost: 6, materialCost: 4 };
  const price = priceForMargin(input, 50);
  assert.ok(Math.abs(calculateOrder({ ...input, price }).margin - 50) < 0.000001);
});

test('rejects impossible target margins', () => {
  assert.throws(() => priceForMargin({ transactionRate: 60, paymentRate: 40 }, 1), /not possible/);
});

test('finds the item price for a target dollar profit', () => {
  const input = { shippingCharged: 5, listingFee: .2, paymentFixed: .25, transactionRate: 6.5, paymentRate: 3, shippingCost: 6, materialCost: 4 };
  const price = priceForProfit(input, 20);
  assert.ok(Math.abs(calculateOrder({ ...input, price }).profit - 20) < 0.000001);
});

test('rejects impossible target profits', () => {
  assert.throws(() => priceForProfit({ transactionRate: 97 }, 1), /not possible/);
  assert.throws(() => priceForProfit({}, -1), /non-negative/);
});

test('reports cash invested and ROI, excluding marketplace fees', () => {
  const result = calculateOrder({
    price: 30, shippingCharged: 5, listingFee: .2, transactionRate: 6.5,
    paymentRate: 3, paymentFixed: .25, offsiteAdRate: 0, shippingCost: 6,
    materialCost: 4, otherCost: 1,
  });
  near(result.cashInvested, 11, 'cash invested is shipping + materials + other');
  near(result.roi, 20.225 / 11 * 100, 'ROI is profit over cash laid out');
});

test('ROI is null when no cash was invested', () => {
  const result = calculateOrder({ price: 20, shippingCharged: 0, shippingCost: 0, materialCost: 0, otherCost: 0 });
  assert.equal(result.roi, null);
});

// Tight handmade listing: $14 item + $3 shipping charged, $5.50 label, $7
// supplies. Organic still clears ~$2.44. A 12% Offsite Ads sale (shops over
// $10k trailing 12 months) is still barely profitable. A 15% sale (under $10k)
// turns the order into a small loss — the decision the comparison table exists
// to surface.
const tightListing = {
  price: 14, shippingCharged: 3, listingFee: 0.2, transactionRate: 6.5,
  paymentRate: 3, paymentFixed: 0.25, shippingCost: 5.5, materialCost: 7,
};

test('offsite-ads comparison: 15% turns the tight listing into a loss', () => {
  const rows = compareOffsiteAdRates(tightListing);
  assert.deepEqual(rows.map((row) => row.offsiteAdRate), [0, 12, 15]);

  const organic = rows.find((row) => row.offsiteAdRate === 0);
  const at12 = rows.find((row) => row.offsiteAdRate === 12);
  const at15 = rows.find((row) => row.offsiteAdRate === 15);

  near(organic.profit, 2.435, 'organic profit');
  assert.equal(organic.stillProfitable, true);
  near(organic.profitVsOrganic, 0, 'organic vs itself');

  near(at12.offsiteAdFee, 2.04, '12% of $17 revenue');
  near(at12.profit, 0.395, '12% still clears a few cents');
  assert.equal(at12.stillProfitable, true);

  near(at15.offsiteAdFee, 2.55, '15% of $17 revenue');
  near(at15.profit, -0.115, '15% is a small loss');
  assert.equal(at15.stillProfitable, false);
  near(at15.profitVsOrganic, -2.55, 'the whole offsite fee is the delta vs organic');
});

test('includes a custom offsite rate that is not a published preset', () => {
  const rows = compareOffsiteAdRates({ ...tightListing, offsiteAdRate: 8 });
  assert.deepEqual(rows.map((row) => row.offsiteAdRate), [0, 8, 12, 15]);
  assert.equal(rows.find((row) => row.offsiteAdRate === 8).isCurrent, true);
  assert.equal(rows.find((row) => row.offsiteAdRate === 0).isCurrent, false);
});

test('max affordable offsite rate is where organic profit is consumed', () => {
  const cap = maxAffordableOffsiteRate(tightListing);
  near(cap, 2.435 / 17 * 100, 'cap is organic profit / revenue');
  const atCap = calculateOrder({ ...tightListing, offsiteAdRate: cap });
  near(atCap.profit, 0, 'profit at the cap is break-even');
  assert.ok(cap < 15, 'the tight listing cannot afford the 15% under-$10k rate');
  assert.ok(cap > 12, 'it can still afford the 12% over-$10k rate');
});

test('max affordable offsite rate is null when the order already loses money', () => {
  // Previously this asserted 0. That was wrong on its own terms: 0% is not an
  // affordable rate here either, because the order is already below break-even
  // before any ad fee. offsiteAdsNote then printed "stays at or above $0.00
  // until Offsite Ads reach about 0.0%" directly beneath a row showing the
  // organic order at a loss.
  const losing = {
    price: 8, shippingCharged: 0, listingFee: 0.2, transactionRate: 6.5,
    paymentRate: 3, paymentFixed: 0.25, shippingCost: 6, materialCost: 5,
  };
  // Premise straight from calculateOrder, not from the function under test.
  const organic = calculateOrder({ ...losing, offsiteAdRate: 0 });
  assert.ok(organic.profit < 0, 'premise: already losing at 0% offsite ads');

  assert.equal(maxAffordableOffsiteRate(losing), null);
});

test('offsite-ads note does not claim a 0% ceiling on an already-losing order', () => {
  const losing = {
    price: 12, shippingCharged: 0, listingFee: 0.2, transactionRate: 6.5,
    paymentRate: 3, paymentFixed: 0.25, shippingCost: 8, materialCost: 6,
    otherCost: 1,
  };
  const rows = compareOffsiteAdRates(losing);
  const text = offsiteAdsNote(rows, maxAffordableOffsiteRate(losing));
  assert.doesNotMatch(text, /about 0\.0%/, 'must not quote a 0.0% ceiling');
  assert.match(text, /No Offsite Ads rate keeps this order at or above \$0\.00/);
});

test('a genuinely tiny offsite ceiling is still reported, not treated as none', () => {
  // Guard against over-correcting: an order that clears by a hair has a real,
  // very small ceiling and must keep reporting it.
  const base = {
    price: 20, shippingCharged: 0, listingFee: 0.2, transactionRate: 6.5,
    paymentRate: 3, paymentFixed: 0.25, shippingCost: 5, materialCost: 5,
  };
  const organic = calculateOrder({ ...base, offsiteAdRate: 0 });
  // Add cost so only a sliver of profit is left.
  const thin = { ...base, otherCost: organic.profit - 0.01 };
  const thinOrganic = calculateOrder({ ...thin, offsiteAdRate: 0 });
  assert.ok(thinOrganic.profit > 0, 'premise: still clears, barely');

  const cap = maxAffordableOffsiteRate(thin);
  assert.notEqual(cap, null, 'a real sliver of headroom is not "no rate qualifies"');
  assert.ok(cap > 0 && cap < 1, `expected a sub-1% ceiling, got ${cap}`);
});

test('rejects a non-numeric minimum profit for the offsite-ads cap', () => {
  assert.throws(() => maxAffordableOffsiteRate(tightListing, 'nope'), /Minimum profit/);
});

test('offsite-ads note names the $0.12 loss and the 14.3% ceiling', () => {
  const rows = compareOffsiteAdRates(tightListing);
  const text = offsiteAdsNote(rows, maxAffordableOffsiteRate(tightListing));
  assert.match(text, /\$2\.44/);
  assert.match(text, /\$0\.39/);
  assert.match(text, /−\$0\.12/);
  assert.match(text, /14\.3%/);
  assert.doesNotMatch(text, /should opt|must turn|opt in or out/i);
});

test('Plus defaults match the published $10 / 15 credits / $5 Ads credit example', () => {
  assert.deepEqual(ETSY_PLUS_DEFAULTS, { monthlyPlusFee: 10, listingCredits: 15, adsCredit: 5 });
});

test('using every Plus credit at $0.20 still leaves Plus $2 more expensive', () => {
  const result = compareEtsyPlus({
    listingFee: 0.2,
    listingsPerMonth: 15,
    monthlyPlusFee: 10,
    listingCredits: 15,
    adsCredit: 5,
    monthlyAdSpend: 5,
  });
  assert.equal(result.withoutPlus.listingFees, 3);
  assert.equal(result.withoutPlus.adsSpend, 5);
  assert.equal(result.withoutPlus.total, 8);
  assert.equal(result.withPlus.listingFees, 0);
  assert.equal(result.withPlus.adsSpend, 0);
  assert.equal(result.withPlus.plusFee, 10);
  assert.equal(result.withPlus.total, 10);
  assert.equal(result.creditValueUsed, 8);
  assert.equal(result.maxCreditValue, 8);
  assert.equal(result.netPlusCost, 2);
  assert.equal(result.monthlyDelta, -2);
  assert.equal(result.plusPays, false);
  assert.equal(result.breakEvenListings, null);
});

test('unused listing and Ads credits expire and do not count as savings', () => {
  const result = compareEtsyPlus({
    listingFee: 0.2,
    listingsPerMonth: 5,
    monthlyPlusFee: 10,
    listingCredits: 15,
    adsCredit: 5,
    monthlyAdSpend: 0,
  });
  assert.equal(result.creditsUsed, 5);
  assert.equal(result.listingValueUsed, 1);
  assert.equal(result.adsValueUsed, 0);
  assert.equal(result.unusedListingCredits, 10);
  assert.equal(result.unusedListingValue, 2);
  assert.equal(result.unusedAdsCredit, 5);
  assert.equal(result.withoutPlus.total, 1);
  assert.equal(result.withPlus.total, 10);
  assert.equal(result.monthlyDelta, -9);
  assert.equal(result.plusPays, false);
});

test('listings past the credit cap cost the same on both paths', () => {
  const atCap = compareEtsyPlus({
    listingFee: 0.2, listingsPerMonth: 15, monthlyPlusFee: 10,
    listingCredits: 15, adsCredit: 5, monthlyAdSpend: 5,
  });
  const pastCap = compareEtsyPlus({
    listingFee: 0.2, listingsPerMonth: 50, monthlyPlusFee: 10,
    listingCredits: 15, adsCredit: 5, monthlyAdSpend: 5,
  });
  assert.equal(pastCap.withoutPlus.listingFees, 10);
  assert.equal(pastCap.withPlus.listingFees, 7);
  assert.equal(pastCap.monthlyDelta, atCap.monthlyDelta);
});

test('assigned shop-feature value can make Plus cash-positive', () => {
  const result = compareEtsyPlus({
    listingFee: 0.2,
    listingsPerMonth: 15,
    monthlyPlusFee: 10,
    listingCredits: 15,
    adsCredit: 5,
    monthlyAdSpend: 5,
    otherPlusValue: 3,
  });
  assert.equal(result.creditValueUsed, 11);
  assert.equal(result.netPlusCost, -1);
  assert.equal(result.monthlyDelta, 1);
  assert.equal(result.plusPays, true);
  assert.equal(result.breakEvenListings, 10);
});

test('a higher listing fee can make the included credits cover Plus', () => {
  const result = compareEtsyPlus({
    listingFee: 1,
    listingsPerMonth: 15,
    monthlyPlusFee: 10,
    listingCredits: 15,
    adsCredit: 5,
    monthlyAdSpend: 0,
  });
  assert.equal(result.withoutPlus.total, 15);
  assert.equal(result.withPlus.total, 10);
  assert.equal(result.monthlyDelta, 5);
  assert.equal(result.plusPays, true);
  assert.equal(result.breakEvenListings, 10);
});

test('break-even listings is 0 when Ads and shop value already cover Plus', () => {
  assert.equal(plusBreakEvenListings({
    listingFee: 0.2, monthlyPlusFee: 10, listingCredits: 15,
    adsCredit: 5, monthlyAdSpend: 5, otherPlusValue: 5,
  }), 0);
});

test('credit value used never counts Ads you would not have bought', () => {
  const used = plusCreditValueUsed({
    listingFee: 0.2, listingsPerMonth: 15, listingCredits: 15,
    adsCredit: 5, monthlyAdSpend: 0,
  });
  assert.equal(used.adsValueUsed, 0);
  assert.equal(used.creditValueUsed, 3);
});

test('rejects negative Plus inputs', () => {
  assert.throws(() => compareEtsyPlus({ listingFee: -0.2 }), /Listing fee/);
  assert.throws(() => compareEtsyPlus({ listingsPerMonth: -1 }), /Listings per month/);
  assert.throws(() => plusBreakEvenListings({ listingFee: 0.2, monthlyPlusFee: -1, listingCredits: 15, adsCredit: 5, monthlyAdSpend: 0 }), /Monthly Plus fee/);
});

const PAGE_ORDER = {
  price: 30,
  shippingCharged: 5,
  listingFee: 0.2,
  transactionRate: 6.5,
  paymentRate: 3,
  paymentFixed: 0.25,
  offsiteAdRate: 0,
  shippingCost: 6,
  materialCost: 4,
  otherCost: 0,
};

test('personalization defaults match the $8 / $1.50 / $6 / 12-order example', () => {
  assert.deepEqual(PERSONALIZATION_DEFAULTS, {
    personalizationUpcharge: 8,
    extraMaterialCost: 1.5,
    extraTimeCost: 6,
    monthlyCustomOrders: 12,
  });
});

test('an $8 personalization loses cash against the standard $30 listing', () => {
  const result = comparePersonalization(PAGE_ORDER);
  assert.equal(result.asListed.profit, 21.23);
  assert.equal(result.personalized.profit, 20.97);
  assert.equal(result.extraKept, -0.26);
  assert.equal(result.extraFees, 0.76);
  assert.equal(result.extraCashCosts, 7.5);
  assert.equal(result.extraRevenue, 8);
  assert.equal(result.breakEvenUpcharge, 8.29);
  assert.equal(result.monthlyExtraKept, -3.12);
  assert.equal(result.upgradePays, false);
  assert.equal(result.incrementalPays, true);
  assert.equal(result.winner, 'as_listed');
  assert.equal(result.personalized.price, 38);
});

test('zero extra time makes the same $8 upcharge keep $5.74 more', () => {
  const result = comparePersonalization({ ...PAGE_ORDER, extraTimeCost: 0 });
  assert.equal(result.personalized.profit, 26.97);
  assert.equal(result.extraKept, 5.74);
  assert.equal(result.breakEvenUpcharge, 1.66);
  assert.equal(result.upgradePays, true);
  assert.equal(result.winner, 'personalized');
});

test('a $12 upcharge covers the default extras after fees', () => {
  const result = comparePersonalization({ ...PAGE_ORDER, personalizationUpcharge: 12 });
  assert.equal(result.personalized.profit, 24.59);
  assert.equal(result.extraKept, 3.36);
  assert.equal(result.upgradePays, true);
  assert.equal(result.monthlyExtraKept, 40.32);
});

test('Offsite Ads raise extra fees and the break-even upcharge', () => {
  const result = comparePersonalization({ ...PAGE_ORDER, offsiteAdRate: 15 });
  assert.equal(result.asListed.profit, 15.98);
  assert.equal(result.personalized.profit, 14.52);
  assert.equal(result.extraKept, -1.46);
  assert.equal(result.extraFees, 1.96);
  assert.equal(result.breakEvenUpcharge, 9.93);
});

test('an incremental custom request can still pay when the upgrade loses', () => {
  const result = comparePersonalization(PAGE_ORDER);
  assert.equal(result.upgradePays, false);
  assert.equal(result.incrementalPays, true);
  assert.equal(result.incrementalProfit, 20.97);
});

test('personalization note names both the upgrade gap and the incremental frame', () => {
  const note = personalizationNote(comparePersonalization(PAGE_ORDER));
  assert.match(note, /\$8\.00 personalization/);
  assert.match(note, /\$0\.26 less/);
  assert.match(note, /\$21\.23/);
  assert.match(note, /\$8\.29/);
  assert.match(note, /\$20\.97 versus \$0\.00/);
});

test('rejects negative personalization inputs', () => {
  assert.throws(() => comparePersonalization({ ...PAGE_ORDER, personalizationUpcharge: -8 }), /Personalization upcharge/);
  assert.throws(() => comparePersonalization({ ...PAGE_ORDER, extraTimeCost: -1 }), /Extra time cost/);
});

test('Etsy Ads defaults match the 12% ACOS example', () => {
  assert.deepEqual(ETSY_ADS_DEFAULTS, { etsyAdsAcosPct: 12 });
});

test('a 12% ACOS still leaves a profit on an extra $30 order', () => {
  const result = compareEtsyAds({ ...PAGE_ORDER, monthlyAdSpend: 5 });
  assert.equal(result.organic.profit, 21.23);
  assert.equal(result.advertised.profit, 17.03);
  assert.equal(result.adsCost, 4.2);
  assert.equal(result.extraKept, -4.2);
  assert.equal(result.breakEvenAcosPct, 60.64);
  assert.equal(result.advertisedOrdersFromSpend, 1.19);
  assert.equal(result.monthlyIncrementalKept, 20.27);
  assert.equal(result.incrementalPays, true);
  assert.equal(result.winner, 'organic');
});

test('a 70% ACOS turns an extra advertised order into a loss', () => {
  const result = compareEtsyAds({ ...PAGE_ORDER, etsyAdsAcosPct: 70, monthlyAdSpend: 5 });
  assert.equal(result.adsCost, 24.5);
  assert.equal(result.advertised.profit, -3.27);
  assert.equal(result.incrementalPays, false);
  assert.equal(result.breakEvenAcosPct, 60.64);
});

test('Offsite Ads lower the ACOS ceiling on the same click', () => {
  const result = compareEtsyAds({ ...PAGE_ORDER, offsiteAdRate: 15, monthlyAdSpend: 5 });
  assert.equal(result.organic.profit, 15.98);
  assert.equal(result.advertised.profit, 11.78);
  assert.equal(result.adsCost, 4.2);
  assert.equal(result.breakEvenAcosPct, 45.64);
});

test('zero ACOS leaves the advertised sale equal to organic', () => {
  const result = compareEtsyAds({ ...PAGE_ORDER, etsyAdsAcosPct: 0, monthlyAdSpend: 5 });
  assert.equal(result.adsCost, 0);
  assert.equal(result.advertised.profit, result.organic.profit);
  assert.equal(result.extraKept, 0);
  assert.equal(result.winner, 'tie');
  assert.equal(result.advertisedOrdersFromSpend, Infinity);
});

test('Etsy Ads note names the cannibalized gap, the ceiling, and the monthly budget', () => {
  const note = etsyAdsNote(compareEtsyAds({ ...PAGE_ORDER, monthlyAdSpend: 5 }));
  assert.match(note, /12\.00% ACOS/);
  assert.match(note, /\$4\.20/);
  assert.match(note, /\$17\.03/);
  assert.match(note, /\$4\.20 less/);
  assert.match(note, /\$21\.23/);
  assert.match(note, /60\.64%/);
  assert.match(note, /\$17\.03 versus \$0\.00/);
  assert.match(note, /\$5\.00 monthly budget/);
  assert.match(note, /1\.19 advertised orders/);
  assert.match(note, /\$20\.27/);
});

test('rejects a negative Etsy Ads ACOS', () => {
  assert.throws(() => compareEtsyAds({ ...PAGE_ORDER, etsyAdsAcosPct: -12 }), /Etsy Ads ACOS/);
});

test('production-partner defaults match the $8 time / $14 quote / 20-of-40 example', () => {
  assert.deepEqual(PRODUCTION_PARTNER_DEFAULTS, {
    yourTimeCost: 8,
    partnerUnitCost: 14,
    partnerHandlingCost: 1,
    yourMonthlyCapacity: 20,
    monthlyDemand: 40,
    partnerRejectRatePercent: 0,
  });
});

test('a $14 partner quote loses per unit but overflow still wins the month', () => {
  const result = compareProductionPartner(PAGE_ORDER);
  assert.equal(result.youMake.profit, 13.23);
  assert.equal(result.partner.profit, 10.23);
  assert.equal(result.perUnitDelta, -3);
  assert.equal(result.effectivePartnerCost, 15);
  assert.equal(result.youMake.cashOut, 12);
  assert.equal(result.youMake.units, 20);
  assert.equal(result.youMake.monthly, 264.6);
  assert.equal(result.partner.units, 40);
  assert.equal(result.partner.monthly, 409.2);
  assert.equal(result.hybrid.youUnits, 20);
  assert.equal(result.hybrid.partnerUnits, 20);
  assert.equal(result.hybrid.monthly, 469.2);
  assert.equal(result.monthlyDeltaVsYou, 204.6);
  assert.equal(result.breakEvenPartnerUnit, 11);
  assert.equal(result.matchYouMakePrice, 33.32);
  assert.equal(result.youMakePaysPerUnit, true);
  assert.equal(result.partnerPaysPerUnit, false);
  assert.equal(result.hybridPaysThisMonth, true);
  assert.equal(result.perUnitWinner, 'you_make');
  assert.equal(result.monthlyWinner, 'hybrid');
});

test('a $10 partner quote beats handmade per unit and this month', () => {
  const result = compareProductionPartner({ ...PAGE_ORDER, partnerUnitCost: 10 });
  assert.equal(result.partner.profit, 14.23);
  assert.equal(result.perUnitDelta, 1);
  assert.equal(result.perUnitWinner, 'partner');
  assert.equal(result.monthlyWinner, 'partner');
  assert.equal(result.partner.monthly, 569.2);
  assert.equal(result.hybrid.monthly, 549.2);
});

test('a 10% reject rate raises the effective partner cost and lowers the break-even quote', () => {
  const result = compareProductionPartner({ ...PAGE_ORDER, partnerRejectRatePercent: 10 });
  assert.equal(result.effectivePartnerCost, 16.67);
  assert.equal(result.partner.profit, 8.56);
  assert.equal(result.breakEvenPartnerUnit, 9.8);
  assert.equal(result.perUnitWinner, 'you_make');
});

test('when demand fits handmade capacity, overflow is not a separate winner', () => {
  const result = compareProductionPartner({ ...PAGE_ORDER, monthlyDemand: 15 });
  assert.equal(result.youMake.units, 15);
  assert.equal(result.hybrid.partnerUnits, 0);
  assert.equal(result.youMake.monthly, 198.45);
  assert.equal(result.hybrid.monthly, 198.45);
  assert.equal(result.partner.monthly, 153.45);
  assert.equal(result.monthlyWinner, 'you_make');
  assert.equal(result.hybridPaysThisMonth, false);
});

test('production-partner note names the per-unit gap and the monthly overflow', () => {
  const note = productionPartnerNote(compareProductionPartner(PAGE_ORDER));
  assert.match(note, /\$13\.23 per order/);
  assert.match(note, /\$14\.00 partner quote/);
  assert.match(note, /\$3\.00 less/);
  assert.match(note, /\$264\.60 this month/);
  assert.match(note, /\$409\.20/);
  assert.match(note, /\$469\.20/);
  assert.match(note, /\$11\.00/);
  assert.match(note, /\$33\.32/);
});

test('rejects negative or 100% production-partner inputs', () => {
  assert.throws(() => compareProductionPartner({ ...PAGE_ORDER, partnerUnitCost: -14 }), /Partner unit cost/);
  assert.throws(() => compareProductionPartner({ ...PAGE_ORDER, yourTimeCost: -1 }), /Your time cost/);
  assert.throws(() => compareProductionPartner({ ...PAGE_ORDER, partnerRejectRatePercent: 100 }), /below 100/);
  assert.throws(() => compareProductionPartner({ ...PAGE_ORDER, partnerRejectRatePercent: 101 }), /at most 100/);
});

test('Star Seller defaults match the $9 label / 8 min / 40% vs 50% example', () => {
  assert.deepEqual(STAR_SELLER_DEFAULTS, {
    starSellerShippingCost: 9,
    starSellerMessageMinutes: 8,
    starSellerHourlyWage: 18,
    unsignedSellThroughPct: 40,
    starSellerSellThroughPct: 50,
    starSellerListings: 40,
  });
});

test('a 10-point Star Seller lift loses after a $9 label and message time', () => {
  const result = compareStarSeller(PAGE_ORDER);
  assert.equal(result.messageCost, 2.4);
  assert.equal(result.extraPostage, 3);
  assert.equal(result.extraCash, 5.4);
  assert.equal(result.unsigned.profit, 21.23);
  assert.equal(result.starSeller.profit, 15.83);
  assert.equal(result.unsigned.expected, 8.49);
  assert.equal(result.starSeller.expected, 7.91);
  assert.equal(result.extraExpected, -0.58);
  assert.equal(result.extraAcrossListings, -23.2);
  assert.equal(result.unsigned.acrossListings, 339.6);
  assert.equal(result.starSeller.acrossListings, 316.4);
  assert.equal(result.breakEvenSellThroughPct, 53.65);
  assert.equal(result.starPostageCeiling, 7.85);
  assert.equal(result.starPays, false);
  assert.equal(result.winner, 'unsigned');
});

test('a 20-point lift flips Star Seller ahead on the same fees', () => {
  const result = compareStarSeller({ ...PAGE_ORDER, starSellerSellThroughPct: 60 });
  assert.equal(result.starSeller.expected, 9.5);
  assert.equal(result.extraExpected, 1.01);
  assert.equal(result.extraAcrossListings, 40.4);
  assert.equal(result.breakEvenSellThroughPct, 53.65);
  assert.equal(result.starPays, true);
  assert.equal(result.winner, 'star_seller');
});

test('a $7 Star Seller label covers a 10-point lift', () => {
  const result = compareStarSeller({ ...PAGE_ORDER, starSellerShippingCost: 7 });
  assert.equal(result.starSeller.profit, 17.83);
  assert.equal(result.extraCash, 3.4);
  assert.equal(result.extraExpected, 0.42);
  assert.equal(result.breakEvenSellThroughPct, 47.63);
  assert.equal(result.starPostageCeiling, 7.85);
  assert.equal(result.winner, 'star_seller');
});

test('a shop that already converts loses money chasing a small badge lift', () => {
  const result = compareStarSeller({
    ...PAGE_ORDER,
    unsignedSellThroughPct: 70,
    starSellerSellThroughPct: 75,
  });
  assert.equal(result.unsigned.expected, 14.86);
  assert.equal(result.starSeller.expected, 11.87);
  assert.equal(result.extraExpected, -2.99);
  assert.equal(result.winner, 'unsigned');
});

test('a low-conversion shop can still come out ahead with a 15-point lift', () => {
  const result = compareStarSeller({
    ...PAGE_ORDER,
    unsignedSellThroughPct: 20,
    starSellerSellThroughPct: 35,
  });
  assert.equal(result.unsigned.expected, 4.25);
  assert.equal(result.starSeller.expected, 5.54);
  assert.equal(result.extraExpected, 1.29);
  assert.equal(result.breakEvenSellThroughPct, 26.86);
  assert.equal(result.winner, 'star_seller');
});

test('Star Seller note names the packed gap, the lift, and the postage ceiling', () => {
  const note = starSellerNote(compareStarSeller(PAGE_ORDER));
  assert.match(note, /\$3\.00 extra postage/);
  assert.match(note, /\$2\.40 answering messages/);
  assert.match(note, /\$15\.83/);
  assert.match(note, /\$21\.23/);
  assert.match(note, /40\.0% vs 50\.0%/);
  assert.match(note, /\$8\.49/);
  assert.match(note, /\$7\.91/);
  assert.match(note, /\$0\.58 less/);
  assert.match(note, /\$23\.20/);
  assert.match(note, /53\.6%/);
  assert.match(note, /\$7\.85/);
});

test('rejects negative or over-100 Star Seller inputs', () => {
  assert.throws(() => compareStarSeller({ ...PAGE_ORDER, starSellerShippingCost: -9 }), /Star Seller shipping cost/);
  assert.throws(() => compareStarSeller({ ...PAGE_ORDER, starSellerMessageMinutes: -1 }), /Star Seller message minutes/);
  assert.throws(() => compareStarSeller({ ...PAGE_ORDER, unsignedSellThroughPct: 101 }), /at most 100/);
  assert.throws(() => compareStarSeller({ ...PAGE_ORDER, starSellerSellThroughPct: -5 }), /Star Seller sell-through/);
});

// Regression: breakEvenSellThroughPct used to hard-code 0% whenever the
// Star Seller path already packed a loss, the same wrong-branch bug fixed
// in compareShopSale above. $10 item, $12 materials packs a $2 loss
// unsigned (-$1 expected at 50% sell-through); a $5 Star Seller label with
// no message time deepens that to a $7 packed loss. The paths only tie once
// Star Seller's -$7-per-sale expected value grows to -$1, which brute-force
// division (independent of compareStarSeller's own formula) puts at
// -1 / -7 * 100 = 14.2857...% — not 0%.
test('a Star Seller path that loses more per packed sale than staying unsigned needs real conversion lift, not 0%, to break even', () => {
  const input = {
    price: 10, shippingCharged: 0, listingFee: 0, transactionRate: 0, paymentRate: 0,
    paymentFixed: 0, offsiteAdRate: 0, shippingCost: 0, materialCost: 12, otherCost: 0,
    starSellerShippingCost: 5, starSellerMessageMinutes: 0, starSellerHourlyWage: 0,
    unsignedSellThroughPct: 50, starSellerSellThroughPct: 50, starSellerListings: 40,
  };
  const result = compareStarSeller(input);
  assert.equal(result.unsigned.profit, -2);
  assert.equal(result.starSeller.profit, -7);

  const unsignedExpected = 0.5 * result.unsigned.profit;
  const bruteForcedRate = (unsignedExpected / result.starSeller.profit) * 100;
  near(bruteForcedRate, 100 / 7, 'algebraic crossing point');

  assert.equal(result.breakEvenSellThroughPct, 14.29);
  assert.notEqual(result.breakEvenSellThroughPct, 0);

  const atBreakEven = compareStarSeller({ ...input, starSellerSellThroughPct: result.breakEvenSellThroughPct });
  near(atBreakEven.extraExpected, 0, 'Star Seller path ties unsigned at the reported rate');
});

test('shop-sale defaults match the 20% / $5 / 40% vs 55% example', () => {
  assert.deepEqual(SHOP_SALE_DEFAULTS, {
    salePercent: 20,
    saleDollar: 5,
    listedSellThroughPct: 40,
    saleSellThroughPct: 55,
    saleListings: 40,
  });
});

test('a 15-point lift makes $5 off beat 20% and full price', () => {
  const result = compareShopSale(PAGE_ORDER);
  assert.equal(result.asListed.profit, 21.23);
  assert.equal(result.percent.price, 24);
  assert.equal(result.percent.profit, 15.8);
  assert.equal(result.percent.cannibalized, -5.43);
  assert.equal(result.dollar.price, 25);
  assert.equal(result.dollar.profit, 16.7);
  assert.equal(result.dollar.cannibalized, -4.53);
  assert.equal(result.asListed.expected, 8.49);
  assert.equal(result.percent.expected, 8.69);
  assert.equal(result.dollar.expected, 9.19);
  assert.equal(result.percentExtraExpected, 0.2);
  assert.equal(result.dollarExtraExpected, 0.7);
  assert.equal(result.percentExtraAcrossListings, 8);
  assert.equal(result.dollarExtraAcrossListings, 28);
  assert.equal(result.asListed.acrossListings, 339.6);
  assert.equal(result.percent.acrossListings, 347.6);
  assert.equal(result.dollar.acrossListings, 367.6);
  assert.equal(result.breakEvenPercentSellThroughPct, 53.75);
  assert.equal(result.breakEvenDollarSellThroughPct, 50.84);
  assert.equal(result.percentCeiling, 21.33);
  assert.equal(result.dollarCeiling, 6.4);
  assert.equal(result.salePriceCeiling, 23.6);
  assert.equal(result.percentPays, true);
  assert.equal(result.dollarPays, true);
  assert.equal(result.winner, 'dollar');
});

test('a 10-point sale lift is not enough — stay full price', () => {
  const result = compareShopSale({ ...PAGE_ORDER, saleSellThroughPct: 50 });
  assert.equal(result.percent.expected, 7.9);
  assert.equal(result.dollar.expected, 8.35);
  assert.equal(result.percentExtraExpected, -0.59);
  assert.equal(result.dollarExtraExpected, -0.14);
  assert.equal(result.percentExtraAcrossListings, -23.6);
  assert.equal(result.dollarExtraAcrossListings, -5.6);
  assert.equal(result.breakEvenPercentSellThroughPct, 53.75);
  assert.equal(result.percentPays, false);
  assert.equal(result.dollarPays, false);
  assert.equal(result.winner, 'as_listed');
});

test('a 30-point lift widens the dollar-off lead', () => {
  const result = compareShopSale({ ...PAGE_ORDER, saleSellThroughPct: 70 });
  assert.equal(result.percent.expected, 11.06);
  assert.equal(result.dollar.expected, 11.69);
  assert.equal(result.percentExtraExpected, 2.57);
  assert.equal(result.dollarExtraExpected, 3.2);
  assert.equal(result.winner, 'dollar');
});

test('15% Offsite Ads make 20% off lose while $5 off still squeaks ahead', () => {
  const result = compareShopSale({ ...PAGE_ORDER, offsiteAdRate: 15 });
  assert.equal(result.asListed.profit, 15.98);
  assert.equal(result.percent.profit, 11.45);
  assert.equal(result.dollar.profit, 12.2);
  assert.equal(result.asListed.expected, 6.39);
  assert.equal(result.percent.expected, 6.29);
  assert.equal(result.dollar.expected, 6.71);
  assert.equal(result.percentExtraExpected, -0.1);
  assert.equal(result.dollarExtraExpected, 0.32);
  assert.equal(result.breakEvenPercentSellThroughPct, 55.83);
  assert.equal(result.breakEvenDollarSellThroughPct, 52.38);
  assert.equal(result.percentCeiling, 19.23);
  assert.equal(result.dollarCeiling, 5.77);
  assert.equal(result.percentPays, false);
  assert.equal(result.dollarPays, true);
  assert.equal(result.winner, 'dollar');
});

test('a shallower 10% sale keeps more than $5 off at the same lift', () => {
  const result = compareShopSale({ ...PAGE_ORDER, salePercent: 10 });
  assert.equal(result.percent.price, 27);
  assert.equal(result.percent.profit, 18.51);
  assert.equal(result.percent.expected, 10.18);
  assert.equal(result.percentExtraExpected, 1.69);
  assert.equal(result.breakEvenPercentSellThroughPct, 45.87);
  assert.equal(result.winner, 'percent');
});

test('shop-sale note names the packed gap, the lift, and the discount ceiling', () => {
  const note = shopSaleNote(compareShopSale(PAGE_ORDER));
  assert.match(note, /\$21\.23/);
  assert.match(note, /20\.0% off/);
  assert.match(note, /\$24\.00/);
  assert.match(note, /\$15\.80/);
  assert.match(note, /\$5\.43/);
  assert.match(note, /\$5\.00 coupon/);
  assert.match(note, /\$16\.70/);
  assert.match(note, /\$4\.53/);
  assert.match(note, /40\.0% vs 55\.0%/);
  assert.match(note, /\$8\.49/);
  assert.match(note, /\$8\.69/);
  assert.match(note, /\$0\.20/);
  assert.match(note, /\$9\.19/);
  assert.match(note, /\$0\.70/);
  assert.match(note, /\$28\.00/);
  assert.match(note, /53\.8%/);
  assert.match(note, /50\.8%/);
  assert.match(note, /21\.3%/);
  assert.match(note, /\$6\.40/);
});

test('rejects negative or over-100 shop-sale inputs', () => {
  assert.throws(() => compareShopSale({ ...PAGE_ORDER, salePercent: 101 }), /at most 100/);
  assert.throws(() => compareShopSale({ ...PAGE_ORDER, saleDollar: -5 }), /Sale dollar off/);
  assert.throws(() => compareShopSale({ ...PAGE_ORDER, listedSellThroughPct: 101 }), /at most 100/);
  assert.throws(() => compareShopSale({ ...PAGE_ORDER, saleSellThroughPct: -5 }), /Sale sell-through/);
});

// Regression: when the full-price order already loses money and the sale
// price loses even more per packed sale, both breakEvenPercentSellThroughPct
// and breakEvenDollarSellThroughPct used to hard-code 0% instead of solving
// the crossing point — because the old branch treated "packed sale profit
// <= 0" as "already broke even" without checking where the two negative
// expected values actually meet. $10 item, $12 materials: full price packs
// a $2 loss (-$1 expected at 50% sell-through); 90% off / $9 off both drop
// the price to $1, packing an $11 loss. The two paths only tie once the
// sale's -$11-per-sale expected value grows (in magnitude) to match the
// full price's -$1, which brute-forcing the crossing independently (not by
// copying calc.mjs's formula) puts at -1 / -11 * 100 = 9.0909...% — not 0%.
test('a sale that loses more per packed sale than full price needs real conversion lift, not 0%, to break even', () => {
  const input = {
    price: 10, shippingCharged: 0, listingFee: 0, transactionRate: 0, paymentRate: 0,
    paymentFixed: 0, offsiteAdRate: 0, shippingCost: 0, materialCost: 12, otherCost: 0,
    salePercent: 90, saleDollar: 9, listedSellThroughPct: 50, saleSellThroughPct: 50, saleListings: 40,
  };
  const result = compareShopSale(input);
  assert.equal(result.asListed.profit, -2);
  assert.equal(result.percent.profit, -11);
  assert.equal(result.dollar.profit, -11);

  // Independently derive the crossing rate from calculateOrder, not from
  // compareShopSale's own breakEven formula: find sale-path sell-through
  // r such that r/100 * percentProfit == listedExpected (both computed
  // straight from calculateOrder).
  const listedExpected = 0.5 * result.asListed.profit;
  const bruteForcedRate = (listedExpected / result.percent.profit) * 100;
  near(bruteForcedRate, 9.090909090909092, 'algebraic crossing point');

  assert.equal(result.breakEvenPercentSellThroughPct, 9.09);
  assert.equal(result.breakEvenDollarSellThroughPct, 9.09);
  assert.notEqual(result.breakEvenPercentSellThroughPct, 0);

  // Confirm the pinned rate actually ties the two paths (the bug this
  // guards against reported a rate where they did not).
  const atBreakEven = compareShopSale({ ...input, saleSellThroughPct: result.breakEvenPercentSellThroughPct });
  near(atBreakEven.percentExtraExpected, 0, 'percent path ties full price at the reported rate');
  near(atBreakEven.dollarExtraExpected, 0, 'dollar path ties full price at the reported rate');
});

test('free-shipping defaults match the $32 / 40-order example', () => {
  assert.deepEqual(FREE_SHIPPING_DEFAULTS, {
    freeShipPrice: 32,
    monthlyOrders: 40,
  });
});

test('charging shipping beats a $32 free-shipping price until extra orders arrive', () => {
  const result = compareFreeShipping(PAGE_ORDER);
  assert.equal(result.charged.profit, 21.23);
  assert.equal(result.charged.monthly, 849);
  assert.equal(result.eatLabel.profit, 16.7);
  assert.equal(result.eatLabelDelta, -4.53);
  assert.equal(result.absorb.price, 35);
  assert.equal(result.absorb.profit, 21.23);
  assert.equal(result.raised.price, 32);
  assert.equal(result.raised.profit, 18.51);
  assert.equal(result.perOrderDelta, -2.72);
  assert.equal(result.liftPercent, 14.67);
  assert.equal(result.extraOrdersNeeded, 5.87);
  assert.equal(result.monthlyRaised, 740.4);
  assert.equal(result.monthlyDelta, -108.6);
  assert.equal(result.canWinWithVolume, true);
  assert.equal(result.alreadyAhead, false);
  assert.equal(result.winner, 'charged');
});

test('absorbing the label into the item price is a fee-stack tie', () => {
  const result = compareFreeShipping({ ...PAGE_ORDER, freeShipPrice: 35 });
  assert.equal(result.raised.profit, 21.23);
  assert.equal(result.perOrderDelta, 0);
  assert.equal(result.extraOrdersNeeded, 0);
  assert.equal(result.winner, 'tie');
});

test('eating the label at the same item price needs about 10.8 extra orders', () => {
  const result = compareFreeShipping({ ...PAGE_ORDER, freeShipPrice: 30 });
  assert.equal(result.raised.profit, 16.7);
  assert.equal(result.perOrderDelta, -4.53);
  assert.equal(result.liftPercent, 27.1);
  assert.equal(result.extraOrdersNeeded, 10.84);
  assert.equal(result.winner, 'charged');
});

test('raising the free-shipping price above the old buyer total already wins', () => {
  const result = compareFreeShipping({ ...PAGE_ORDER, freeShipPrice: 40 });
  assert.equal(result.raised.profit, 25.75);
  assert.equal(result.perOrderDelta, 4.52);
  assert.equal(result.alreadyAhead, true);
  assert.equal(result.winner, 'raised');
});

test('15% Offsite Ads still leave charging shipping ahead on the $32 path', () => {
  const result = compareFreeShipping({ ...PAGE_ORDER, offsiteAdRate: 15 });
  assert.equal(result.charged.profit, 15.98);
  assert.equal(result.raised.profit, 13.71);
  assert.equal(result.perOrderDelta, -2.27);
  assert.equal(result.liftPercent, 16.52);
  assert.equal(result.extraOrdersNeeded, 6.61);
  assert.equal(result.winner, 'charged');
});

test('a free-shipping price that loses money cannot catch up with volume', () => {
  const result = compareFreeShipping({ ...PAGE_ORDER, freeShipPrice: 10, materialCost: 20 });
  assert.equal(result.raised.profit, -17.4);
  assert.equal(result.canWinWithVolume, false);
  assert.equal(result.extraOrdersNeeded, null);
  assert.equal(result.winner, 'charged');
});

test('freeShippingNote names the $32 default lift', () => {
  const note = freeShippingNote(compareFreeShipping(PAGE_ORDER));
  assert.match(note, /\$21\.23/);
  assert.match(note, /\$16\.70/);
  assert.match(note, /−\$4\.53/);
  assert.match(note, /\$35\.00/);
  assert.match(note, /tie/);
  assert.match(note, /\$18\.51/);
  assert.match(note, /−\$2\.72/);
  assert.match(note, /5\.9 extra orders/);
  assert.match(note, /14\.7%/);
  assert.match(note, /\$849\.00/);
});

test('freeShippingNote names a raised-ahead path without asking for volume', () => {
  const note = freeShippingNote(compareFreeShipping({ ...PAGE_ORDER, freeShipPrice: 40 }));
  assert.match(note, /\+\$4\.52/);
  assert.match(note, /already keeps more/);
});

test('rejects a negative free-shipping item price or monthly orders', () => {
  assert.throws(() => compareFreeShipping({ ...PAGE_ORDER, freeShipPrice: -1 }), /Free-shipping item price/);
  assert.throws(() => compareFreeShipping({ ...PAGE_ORDER, monthlyOrders: -4 }), /Monthly orders/);
});

const renewalInput = {
  price: 30,
  shippingCharged: 5,
  listingFee: 0.2,
  transactionRate: 6.5,
  paymentRate: 3,
  paymentFixed: 0.25,
  offsiteAdRate: 0,
  shippingCost: 6,
  materialCost: 4,
  otherCost: 1,
  renewalMonths: 4,
};

test('allocates the listing fee across sales in one renewal window', () => {
  const result = calculateListingRenewal({ ...renewalInput, expectedSales: 5 });
  const withoutListing = calculateOrder({ ...renewalInput, listingFee: 0 });
  assert.equal(result.listingPerSale, 0.04);
  assert.equal(result.contributionExListing, withoutListing.profit);
  assert.equal(result.periodProfitAfterListing, withoutListing.profit * 5 - 0.2);
  assert.equal(Number(result.annualListingCost.toFixed(2)), 0.6);
  assert.equal(result.overstatedInPeriod, 0.8);
  assert.equal(result.coversListing, true);
  assert.equal(result.unpaidRenewal, false);
  assert.equal(result.profitIfAllocated, calculateOrder({ ...renewalInput, listingFee: 0.04 }).profit);
});

test('keeps the listing fee on a listing that sells nothing', () => {
  const result = calculateListingRenewal({ ...renewalInput, expectedSales: 0 });
  assert.equal(result.listingPerSale, null);
  assert.equal(result.profitIfAllocated, null);
  assert.equal(result.periodProfitAfterListing, -0.2);
  assert.equal(result.coversListing, false);
  assert.equal(result.unpaidRenewal, true);
  assert.equal(result.scenarios[0].periodProfitAfterListing, -0.2);
  assert.equal(result.scenarios[0].periodProfitIfListingPerOrder, 0);
});

test('counts how many sales recover the listing fee from leftover contribution', () => {
  const result = calculateListingRenewal({ ...renewalInput, expectedSales: 2 });
  assert.equal(result.salesToRecover, 1);
  assert.ok(result.contributionExListing > 0.2);
  assert.equal(Number(result.periodProfitAfterListing.toFixed(2)), 40.65);
  assert.equal(result.listingPerSale, 0.1);
});

test('reports that a losing order never recovers the listing fee', () => {
  const result = calculateListingRenewal({
    ...renewalInput,
    price: 5,
    shippingCharged: 0,
    shippingCost: 8,
    materialCost: 4,
    expectedSales: 10,
  });
  assert.equal(result.salesToRecover, null);
  assert.equal(result.coversListing, false);
});

test('rejects a zero or invalid renewal window', () => {
  assert.throws(() => calculateListingRenewal({ ...renewalInput, renewalMonths: 0 }), /greater than zero/);
  assert.throws(() => calculateListingRenewal({ ...renewalInput, expectedSales: -1 }), /non-negative/);
});

test('listingRenewalNote names unpaid renewals and overstated per-order fees', () => {
  const unpaid = listingRenewalNote(calculateListingRenewal({ ...renewalInput, expectedSales: 0 }));
  assert.match(unpaid, /\$0\.20/);
  assert.match(unpaid, /even if nothing sells/);
  assert.match(unpaid, /\$0\.60/);
  const two = listingRenewalNote(calculateListingRenewal({ ...renewalInput, expectedSales: 2 }));
  assert.match(two, /\$40\.65/);
  assert.match(two, /\$0\.10/);
  assert.match(two, /1 sale recovers/);
  assert.match(two, /\$0\.20/);
});

test('Etsy label defaults match the $6 / $5.10 / 4 min example', () => {
  assert.deepEqual(ETSY_LABELS_DEFAULTS, {
    etsyLabelCost: 6,
    thirdPartyLabelCost: 5.1,
    etsyLabelClaimRatePercent: 0.8,
    thirdPartyClaimRatePercent: 2.5,
    labelUploadMinutes: 4,
    labelUploadWage: 18,
    labelFeeRefundOnClaimPercent: 100,
    monthlyLabelShipments: 40,
  });
});

test('four minutes wipe a $0.90 Etsy postage save', () => {
  const result = compareEtsyLabels(PAGE_ORDER);
  assert.equal(result.etsy.completedProfit, 21.23);
  assert.equal(result.etsy.expectedProfit, 20.98);
  assert.equal(result.etsy.claimProfit, -10);
  assert.equal(result.third.completedProfit, 20.93);
  assert.equal(result.third.expectedProfit, 20.14);
  assert.equal(result.third.claimProfit, -10.3);
  assert.equal(result.third.extraCost, 1.2);
  assert.equal(result.postageOnly.completedProfit, 22.13);
  assert.equal(result.postageOnly.expectedProfit, 21.34);
  assert.equal(result.postageOnly.claimProfit, -9.1);
  assert.equal(result.winner, 'etsy');
  assert.equal(result.extraKeptOnThird, -0.84);
  assert.equal(result.extraKeptOnPostageOnly, 0.36);
  assert.equal(result.monthlyExtraOnThird, -33.6);
  assert.equal(result.monthlyExtraOnPostageOnly, 14.4);
  assert.equal(result.uploadTimeCost, 1.2);
  assert.equal(result.breakEvenThirdPartyClaimRate, Infinity);
  assert.ok(Math.abs(result.breakEvenThirdPartyLabelCost - 4.27) < 0.01);
  assert.ok(Math.abs(result.breakEvenUploadMinutes - 1.23) < 0.02);
});

test('a lower fee refund on claim costs more per claim and lowers the expected outcome', () => {
  // labelFeeRefundOnClaimPercent has no form control before this fix -- it
  // silently defaulted to a 100% refund (Etsy returns every fee on a
  // successful item-not-received claim) with no way for a seller whose
  // actual refund is partial to model that. Confirms the field is live on
  // both the Etsy and third-party paths, not just accepted and ignored.
  const fullRefund = compareEtsyLabels(PAGE_ORDER);
  const noRefund = compareEtsyLabels({ ...PAGE_ORDER, labelFeeRefundOnClaimPercent: 0 });
  assert.equal(fullRefund.etsy.claimProfit, -10);
  assert.ok(noRefund.etsy.claimProfit < fullRefund.etsy.claimProfit, 'keeping none of the fees on a claim costs more');
  assert.ok(Math.abs(noRefund.etsy.claimProfit - -13.78) < 0.02);
  assert.ok(noRefund.etsy.expectedProfit < fullRefund.etsy.expectedProfit, 'a costlier claim lowers the blended expected profit');
  assert.ok(noRefund.third.claimProfit < fullRefund.third.claimProfit);
  assert.ok(noRefund.third.expectedProfit < fullRefund.third.expectedProfit);
});

test('dropping upload time flips the cheaper quote ahead', () => {
  const result = compareEtsyLabels({ ...PAGE_ORDER, labelUploadMinutes: 0 });
  assert.equal(result.third.expectedProfit, 21.34);
  assert.equal(result.postageOnly.expectedProfit, 21.34);
  assert.equal(result.extraKeptOnThird, 0.36);
  assert.equal(result.winner, 'third_party');
  assert.ok(Math.abs(result.breakEvenThirdPartyClaimRate - 3.7) < 0.05);
});

test('matching the 0.8% claim rate still loses after four minutes', () => {
  const result = compareEtsyLabels({ ...PAGE_ORDER, thirdPartyClaimRatePercent: 0.8 });
  assert.equal(result.third.expectedProfit, 20.68);
  assert.equal(result.extraKeptOnThird, -0.3);
  assert.equal(result.winner, 'etsy');
});

test('15% Offsite Ads still leave the Etsy label ahead after upload time', () => {
  const result = compareEtsyLabels({ ...PAGE_ORDER, offsiteAdRate: 15 });
  assert.equal(result.etsy.expectedProfit, 15.77);
  assert.equal(result.third.expectedProfit, 15.03);
  assert.equal(result.postageOnly.expectedProfit, 16.23);
  assert.equal(result.extraKeptOnThird, -0.74);
  assert.equal(result.winner, 'etsy');
});

test('a $4 quote and one upload minute flip third-party ahead', () => {
  const result = compareEtsyLabels({ ...PAGE_ORDER, thirdPartyLabelCost: 4, labelUploadMinutes: 1 });
  assert.equal(result.etsy.expectedProfit, 20.98);
  assert.equal(result.third.expectedProfit, 22.14);
  assert.equal(result.extraKeptOnThird, 1.16);
  assert.equal(result.winner, 'third_party');
});

test('etsyLabelsNote names the default $0.84 leak and $4.27 quote ceiling', () => {
  const text = etsyLabelsNote(compareEtsyLabels(PAGE_ORDER));
  assert.equal(text, compareEtsyLabels(PAGE_ORDER).summary);
  assert.equal(text, etsyLabelsSummary(compareEtsyLabels(PAGE_ORDER)));
  assert.match(text, /\$6\.00/);
  assert.match(text, /\$20\.98/);
  assert.match(text, /−\$10\.00/);
  assert.match(text, /\$5\.10/);
  assert.match(text, /\$1\.20/);
  assert.match(text, /\$20\.14/);
  assert.match(text, /\$0\.84 less/);
  assert.match(text, /\$21\.34/);
  assert.match(text, /\$0\.36 more/);
  assert.match(text, /No third-party claim rate/);
  assert.match(text, /\$4\.27/);
  assert.throws(() => etsyLabelsNote({}), /missing rows/);
});

test('compareEtsyLabels rejects impossible inputs', () => {
  assert.throws(() => compareEtsyLabels({}), /Price/);
  assert.throws(() => compareEtsyLabels({ price: -1 }), /Price/);
  assert.throws(() => compareEtsyLabels({ ...PAGE_ORDER, thirdPartyClaimRatePercent: 101 }), /at most 100/);
  assert.throws(() => compareEtsyLabels({ ...PAGE_ORDER, monthlyLabelShipments: 0 }), /greater than zero/);
  assert.throws(() => compareEtsyLabels({ ...PAGE_ORDER, labelUploadMinutes: -1 }), /Label upload minutes/);
});

test('offsite ad rate raises the price needed for a target margin and a target profit', () => {
  const base = { shippingCost: 5, materialCost: 4 };
  const withAds = { ...base, offsiteAdRate: 15 };
  const m0 = priceForMargin(base, 30), m1 = priceForMargin(withAds, 30);
  near(m1, (0.2 + 0.25 + 9) / (1 - 0.245 - 0.3), 'margin price with 15% offsite ads');
  assert.ok(m1 > m0);
  const p0 = priceForProfit(base, 10), p1 = priceForProfit(withAds, 10);
  near(p1, (0.2 + 0.25 + 9 + 10) / (1 - 0.245), 'profit price with 15% offsite ads');
  assert.ok(p1 > p0);
});

test('break-even listings is exactly reachable when it equals the credits', () => {
  const args = { listingFee: 0.2, monthlyPlusFee: 10, listingCredits: 50, adsCredit: 0, monthlyAdSpend: 0 };
  assert.equal(plusBreakEvenListings(args), 50);
  assert.equal(plusBreakEvenListings({ ...args, listingCredits: 49 }), null);
});

test('personalization note needs both rows', () => {
  const c = comparePersonalization({ price: 30 });
  assert.throws(() => personalizationNote({ ...c, asListed: undefined }), /missing rows/);
  assert.throws(() => personalizationNote({ ...c, personalized: undefined }), /missing rows/);
  assert.throws(() => personalizationNote({}), /missing rows/);
});

test('a Star Seller path that packs a loss while unsigned profits has no reachable break-even rate', () => {
  const result = compareStarSeller({
    price: 10, shippingCharged: 0, listingFee: 0, transactionRate: 0, paymentRate: 0,
    paymentFixed: 0, offsiteAdRate: 0, shippingCost: 0, materialCost: 0, otherCost: 0,
    starSellerShippingCost: 12, starSellerMessageMinutes: 0, starSellerHourlyWage: 0,
    unsignedSellThroughPct: 50, starSellerSellThroughPct: 50, starSellerListings: 40,
  });
  assert.equal(result.starSeller.profit, -2);
  assert.equal(result.breakEvenSellThroughPct, Infinity);
});
