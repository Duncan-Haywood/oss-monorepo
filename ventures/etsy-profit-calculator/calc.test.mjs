import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrder, priceForMargin, compareEtsyPlus, plusBreakEvenListings, plusCreditValueUsed, ETSY_PLUS_DEFAULTS, comparePersonalization, personalizationNote, PERSONALIZATION_DEFAULTS, compareEtsyAds, etsyAdsNote, ETSY_ADS_DEFAULTS, compareProductionPartner, productionPartnerNote, PRODUCTION_PARTNER_DEFAULTS, compareStarSeller, starSellerNote, STAR_SELLER_DEFAULTS, compareShopSale, shopSaleNote, SHOP_SALE_DEFAULTS, compareFreeShipping, freeShippingNote, FREE_SHIPPING_DEFAULTS } from './calc.mjs';

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

test('rejects negative or non-numeric inputs', () => {
  assert.throws(() => calculateOrder({ price: -1 }));
  assert.throws(() => calculateOrder({ price: 'nope' }));
});

test('finds the item price for a target margin', () => {
  const input = { shippingCharged: 5, listingFee: .2, paymentFixed: .25, transactionRate: 6.5, paymentRate: 3, shippingCost: 6, materialCost: 4 };
  const price = priceForMargin(input, 50);
  assert.ok(Math.abs(calculateOrder({ ...input, price }).margin - 50) < 0.000001);
});

test('rejects impossible target margins', () => {
  assert.throws(() => priceForMargin({ transactionRate: 60, paymentRate: 40 }, 1), /not possible/);
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
