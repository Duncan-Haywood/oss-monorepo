export function calculateOrder(input) {
  const number = (value, name) => {
    const result = Number(value);
    if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be a non-negative number`);
    return result;
  };
  const price = number(input.price, 'Price');
  const shippingCharged = number(input.shippingCharged ?? 0, 'Shipping charged');
  const listingFee = number(input.listingFee ?? 0.2, 'Listing fee');
  const transactionRate = number(input.transactionRate ?? 6.5, 'Transaction rate');
  const paymentRate = number(input.paymentRate ?? 3, 'Payment rate');
  const paymentFixed = number(input.paymentFixed ?? 0.25, 'Payment fixed fee');
  const offsiteAdRate = number(input.offsiteAdRate ?? 0, 'Offsite ad rate');
  const shippingCost = number(input.shippingCost ?? 0, 'Shipping cost');
  const materialCost = number(input.materialCost ?? 0, 'Material cost');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const revenue = price + shippingCharged;
  const fees = {
    listing: listingFee,
    transaction: revenue * transactionRate / 100,
    payment: revenue * paymentRate / 100 + paymentFixed,
    offsiteAd: revenue * offsiteAdRate / 100,
  };
  const costs = fees.listing + fees.transaction + fees.payment + fees.offsiteAd + shippingCost + materialCost + otherCost;
  const profit = revenue - costs;
  return {
    revenue, fees, costs, profit,
    margin: revenue === 0 ? 0 : profit / revenue * 100,
    breakEvenPrice: Math.max(0, (listingFee + paymentFixed + shippingCost + materialCost + otherCost) /
      (1 - (transactionRate + paymentRate + offsiteAdRate) / 100)),
  };
}

export function priceForMargin(input, targetMargin) {
  const margin = Number(targetMargin);
  if (!Number.isFinite(margin) || margin < 0 || margin >= 100) throw new Error('Target margin must be between 0 and 99.9%');
  const n = name => Number(input[name] ?? ({ listingFee: .2, paymentFixed: .25, transactionRate: 6.5, paymentRate: 3, offsiteAdRate: 0 }[name] ?? 0));
  const denominator = 1 - (n('transactionRate') + n('paymentRate') + n('offsiteAdRate')) / 100 - margin / 100;
  if (denominator <= 0) throw new Error('Target margin is not possible with these fee rates');
  return Math.max(0, (n('listingFee') + n('paymentFixed') + n('shippingCost') + n('materialCost') + n('otherCost')) / denominator - n('shippingCharged'));
}

function nonNegativeNumber(value, name, fallback) {
  if (value === undefined || value === null || value === '') {
    if (fallback === undefined) throw new Error(`${name} must be a non-negative number`);
    const result = Number(fallback);
    if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be a non-negative number`);
    return result;
  }
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be a non-negative number`);
  return result;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

// Illustrative Etsy Plus defaults from Etsy's published Plus page (2026): a
// $10 monthly subscription, 15 listing credits, and a $5 Etsy Ads credit.
// Credits expire at the end of the billing cycle and do not roll over. These
// are inputs, not a live schedule — the seller overwrites them from their
// own Plus invoice.
export const ETSY_PLUS_DEFAULTS = {
  monthlyPlusFee: 10,
  listingCredits: 15,
  adsCredit: 5,
};

// Cash Plus actually saves this month: listing fees avoided on credits you
// will use, plus Ads credit you would have spent anyway, plus any dollar
// value you assign to the shop-only features. Unused credits are not savings.
export function plusCreditValueUsed({
  listingFee,
  listingsPerMonth,
  listingCredits,
  adsCredit,
  monthlyAdSpend,
  otherPlusValue = 0,
}) {
  const fee = nonNegativeNumber(listingFee, 'Listing fee');
  const listings = nonNegativeNumber(listingsPerMonth, 'Listings per month');
  const credits = nonNegativeNumber(listingCredits, 'Listing credits');
  const ads = nonNegativeNumber(adsCredit, 'Etsy Ads credit');
  const spend = nonNegativeNumber(monthlyAdSpend, 'Monthly Etsy Ads spend');
  const other = nonNegativeNumber(otherPlusValue, 'Other Plus value');
  const creditsUsed = Math.min(listings, credits);
  return {
    creditsUsed,
    listingValueUsed: roundMoney(creditsUsed * fee),
    adsValueUsed: roundMoney(Math.min(spend, ads)),
    unusedListingCredits: Math.max(0, credits - listings),
    unusedAdsCredit: roundMoney(Math.max(0, ads - spend)),
    otherPlusValue: roundMoney(other),
    creditValueUsed: roundMoney(creditsUsed * fee + Math.min(spend, ads) + other),
  };
}

// Listings (create + renew) needed this month for Plus cash to break even,
// given Ads you would buy anyway and any value assigned to shop features.
// Null when even using every listing credit still leaves Plus more expensive.
export function plusBreakEvenListings({
  listingFee,
  monthlyPlusFee,
  listingCredits,
  adsCredit,
  monthlyAdSpend,
  otherPlusValue = 0,
}) {
  const fee = nonNegativeNumber(listingFee, 'Listing fee');
  const plusFee = nonNegativeNumber(monthlyPlusFee, 'Monthly Plus fee');
  const credits = nonNegativeNumber(listingCredits, 'Listing credits');
  const ads = nonNegativeNumber(adsCredit, 'Etsy Ads credit');
  const spend = nonNegativeNumber(monthlyAdSpend, 'Monthly Etsy Ads spend');
  const other = nonNegativeNumber(otherPlusValue, 'Other Plus value');
  const remaining = plusFee - Math.min(spend, ads) - other;
  if (remaining <= 0) return 0;
  if (fee <= 0) return null;
  const needed = remaining / fee;
  if (needed > credits) return null;
  return needed;
}

// Stay off Plus vs subscribe this month. Extra listings beyond the credit
// cap cost the same on both paths, so volume past the credit count does not
// make Plus cheaper — it only uses the credits you would otherwise waste.
export function compareEtsyPlus(input = {}) {
  const listingFee = nonNegativeNumber(input.listingFee, 'Listing fee', 0.2);
  const listingsPerMonth = nonNegativeNumber(input.listingsPerMonth, 'Listings per month', 0);
  const monthlyPlusFee = nonNegativeNumber(input.monthlyPlusFee, 'Monthly Plus fee', ETSY_PLUS_DEFAULTS.monthlyPlusFee);
  const listingCredits = nonNegativeNumber(input.listingCredits, 'Listing credits', ETSY_PLUS_DEFAULTS.listingCredits);
  const adsCredit = nonNegativeNumber(input.adsCredit, 'Etsy Ads credit', ETSY_PLUS_DEFAULTS.adsCredit);
  const monthlyAdSpend = nonNegativeNumber(input.monthlyAdSpend, 'Monthly Etsy Ads spend', 0);
  const otherPlusValue = nonNegativeNumber(input.otherPlusValue, 'Other Plus value', 0);

  const used = plusCreditValueUsed({
    listingFee,
    listingsPerMonth,
    listingCredits,
    adsCredit,
    monthlyAdSpend,
    otherPlusValue,
  });

  const leftoverListings = Math.max(0, listingsPerMonth - listingCredits);
  const leftoverAds = Math.max(0, monthlyAdSpend - adsCredit);

  const withoutPlus = {
    listingFees: roundMoney(listingsPerMonth * listingFee),
    adsSpend: roundMoney(monthlyAdSpend),
    plusFee: 0,
    total: roundMoney(listingsPerMonth * listingFee + monthlyAdSpend),
  };
  const withPlus = {
    listingFees: roundMoney(leftoverListings * listingFee),
    adsSpend: roundMoney(leftoverAds),
    plusFee: roundMoney(monthlyPlusFee),
    total: roundMoney(leftoverListings * listingFee + leftoverAds + monthlyPlusFee),
  };

  const monthlyDelta = roundMoney(withoutPlus.total - withPlus.total + otherPlusValue);
  const netPlusCost = roundMoney(monthlyPlusFee - used.creditValueUsed);
  const maxCreditValue = roundMoney(listingCredits * listingFee + adsCredit);

  return {
    listingFee,
    listingsPerMonth,
    monthlyPlusFee,
    listingCredits,
    adsCredit,
    monthlyAdSpend,
    ...used,
    unusedListingValue: roundMoney(used.unusedListingCredits * listingFee),
    maxCreditValue,
    withoutPlus,
    withPlus,
    netPlusCost,
    monthlyDelta,
    plusPays: monthlyDelta > 0,
    plusBreaksEven: monthlyDelta === 0,
    breakEvenListings: plusBreakEvenListings({
      listingFee,
      monthlyPlusFee,
      listingCredits,
      adsCredit,
      monthlyAdSpend,
      otherPlusValue,
    }),
  };
}

// Illustrative personalization extras. $8.00 is a common "sounds fair"
// add-on; $1.50 covers extra ink, thread, or a gift box; $6.00 is twenty
// minutes at $18/hour. These are inputs, not a wage or fee schedule — the
// seller overwrites them from the request in front of them.
export const PERSONALIZATION_DEFAULTS = {
  personalizationUpcharge: 8,
  extraMaterialCost: 1.5,
  extraTimeCost: 6,
  monthlyCustomOrders: 12,
};

function orderFeeTotal(order) {
  return order.fees.listing + order.fees.transaction + order.fees.payment + order.fees.offsiteAd;
}

function winnerFromExtra(extraKept) {
  if (extraKept > 1e-9) return 'personalized';
  if (extraKept < -1e-9) return 'as_listed';
  return 'tie';
}

// Same listing, two ways to close the sale: as written vs the personalized
// request. Percentage fees sit on the higher ticket; listing fee and the
// payment fixed fee do not change. Extra materials and extra time are cash
// the seller lays out only on the custom path.
//
// Two frames, because sellers mix them up:
//   - upgrade: this buyer would have bought the standard listing;
//   - incremental: this request is extra demand (no sale if declined).
export function comparePersonalization(input = {}) {
  const personalizationUpcharge = nonNegativeNumber(
    input.personalizationUpcharge,
    'Personalization upcharge',
    PERSONALIZATION_DEFAULTS.personalizationUpcharge,
  );
  const extraMaterialCost = nonNegativeNumber(
    input.extraMaterialCost,
    'Extra material cost',
    PERSONALIZATION_DEFAULTS.extraMaterialCost,
  );
  const extraTimeCost = nonNegativeNumber(
    input.extraTimeCost,
    'Extra time cost',
    PERSONALIZATION_DEFAULTS.extraTimeCost,
  );
  const monthlyCustomOrders = nonNegativeNumber(
    input.monthlyCustomOrders,
    'Monthly custom orders',
    PERSONALIZATION_DEFAULTS.monthlyCustomOrders,
  );

  const asListedOrder = calculateOrder(input);
  const personalizedOrder = calculateOrder({
    ...input,
    price: Number(input.price) + personalizationUpcharge,
    materialCost: Number(input.materialCost ?? 0) + extraMaterialCost,
    otherCost: Number(input.otherCost ?? 0) + extraTimeCost,
  });

  const asListedProfit = roundMoney(asListedOrder.profit);
  const personalizedProfit = roundMoney(personalizedOrder.profit);
  const asListedFees = roundMoney(orderFeeTotal(asListedOrder));
  const personalizedFees = roundMoney(orderFeeTotal(personalizedOrder));
  const extraKept = roundMoney(personalizedProfit - asListedProfit);
  const extraFees = roundMoney(personalizedFees - asListedFees);
  const extraCashCosts = roundMoney(extraMaterialCost + extraTimeCost);

  const transactionRate = nonNegativeNumber(input.transactionRate, 'Transaction rate', 6.5);
  const paymentRate = nonNegativeNumber(input.paymentRate, 'Payment rate', 3);
  const offsiteAdRate = nonNegativeNumber(input.offsiteAdRate, 'Offsite ad rate', 0);
  const percentRate = (transactionRate + paymentRate + offsiteAdRate) / 100;
  const keepRate = 1 - percentRate;
  const breakEvenUpcharge = keepRate <= 1e-12
    ? Infinity
    : roundMoney(extraCashCosts / keepRate);

  const asListed = {
    id: 'as_listed',
    label: 'Sell as listed',
    price: roundMoney(Number(input.price)),
    revenue: roundMoney(asListedOrder.revenue),
    fees: asListedFees,
    extraCash: 0,
    profit: asListedProfit,
  };
  const personalized = {
    id: 'personalized',
    label: 'Take the personalization',
    price: roundMoney(Number(input.price) + personalizationUpcharge),
    revenue: roundMoney(personalizedOrder.revenue),
    fees: personalizedFees,
    extraCash: extraCashCosts,
    profit: personalizedProfit,
  };

  return {
    personalizationUpcharge: roundMoney(personalizationUpcharge),
    extraMaterialCost: roundMoney(extraMaterialCost),
    extraTimeCost: roundMoney(extraTimeCost),
    monthlyCustomOrders,
    asListed,
    personalized,
    extraKept,
    extraFees,
    extraCashCosts,
    extraRevenue: roundMoney(personalizationUpcharge),
    monthlyExtraKept: roundMoney(extraKept * monthlyCustomOrders),
    breakEvenUpcharge,
    upgradePays: extraKept > 1e-9,
    upgradeBreaksEven: Math.abs(extraKept) <= 1e-9,
    incrementalPays: personalizedProfit > 1e-9,
    incrementalProfit: personalizedProfit,
    winner: winnerFromExtra(extraKept),
  };
}

export function personalizationNote(comparison) {
  if (!comparison?.asListed || !comparison?.personalized) {
    throw new Error('Personalization comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '−' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const extras = [];
  if (comparison.extraMaterialCost > 0) extras.push(`${money(comparison.extraMaterialCost)} extra materials`);
  if (comparison.extraTimeCost > 0) extras.push(`${money(comparison.extraTimeCost)} extra time`);
  extras.push(`${money(comparison.extraFees)} extra fees`);
  const extraPhrase = extras.join(', ');
  const gap = money(Math.abs(comparison.extraKept));
  const ahead = comparison.extraKept >= 0 ? 'more' : 'less';
  const upgradeLine = `A ${money(comparison.personalizationUpcharge)} personalization, after ${extraPhrase}, leaves ${money(comparison.personalized.profit)} — ${gap} ${ahead} than selling the listing as written at ${money(comparison.asListed.profit)}.`;
  const ceiling = Number.isFinite(comparison.breakEvenUpcharge)
    ? ` The upcharge has to reach about ${money(comparison.breakEvenUpcharge)} before the upgrade beats the standard sale.`
    : ' No finite upcharge can cover these extras at these fee rates.';
  const incrementalLine = comparison.incrementalPays
    ? ` If this request is extra demand you would not have sold otherwise, the personalized order still leaves ${money(comparison.personalized.profit)} versus $0.00.`
    : ` If this request is extra demand you would not have sold otherwise, the personalized order still loses ${money(comparison.personalized.profit)}.`;
  return `${upgradeLine}${ceiling}${incrementalLine}`;
}

// Illustrative on-site Etsy Ads ACOS. 12% is a common “I will spend $12
// to make $100” target sellers type into Ads Manager. Offsite Ads are a
// different fee — a percentage Etsy takes on attributed orders — and
// stay on the order inputs. These are inputs, not Etsy's live CPC.
export const ETSY_ADS_DEFAULTS = {
  etsyAdsAcosPct: 12,
};

function winnerFromAds(extraKept) {
  if (extraKept > 1e-9) return 'advertised';
  if (extraKept < -1e-9) return 'organic';
  return 'tie';
}

// Same listing, two ways the order arrives: organic vs an Etsy Ads click.
// Marketplace fees do not change. Ads cash is ACOS × order revenue, the
// same definition Ads Manager uses (spend ÷ attributed sales).
//
// Two frames, because sellers mix them up:
//   - cannibalized: this buyer would have bought anyway, so Ads cost you
//     the click;
//   - incremental: this click is extra demand (no sale if you stay off).
export function compareEtsyAds(input = {}) {
  const etsyAdsAcosPct = nonNegativeNumber(
    input.etsyAdsAcosPct,
    'Etsy Ads ACOS',
    ETSY_ADS_DEFAULTS.etsyAdsAcosPct,
  );
  const monthlyAdSpend = nonNegativeNumber(
    input.monthlyAdSpend,
    'Monthly Etsy Ads spend',
    5,
  );

  const organicOrder = calculateOrder(input);
  const revenue = organicOrder.revenue;
  const organicProfitRaw = organicOrder.profit;
  const organicProfit = roundMoney(organicProfitRaw);
  const organicFees = roundMoney(orderFeeTotal(organicOrder));
  const adsCostRaw = revenue * etsyAdsAcosPct / 100;
  const adsCost = roundMoney(adsCostRaw);
  const advertisedProfitRaw = organicProfitRaw - adsCostRaw;
  const advertisedProfit = roundMoney(advertisedProfitRaw);
  const extraKept = roundMoney(advertisedProfit - organicProfit);

  const breakEvenAcosPct = revenue <= 1e-12
    ? Infinity
    : roundMoney((organicProfitRaw / revenue) * 100);

  let advertisedOrdersFromSpend = 0;
  if (adsCostRaw > 1e-12) {
    advertisedOrdersFromSpend = monthlyAdSpend / adsCostRaw;
  } else if (monthlyAdSpend > 1e-12) {
    advertisedOrdersFromSpend = Infinity;
  }

  const monthlyIncrementalKept = !Number.isFinite(advertisedOrdersFromSpend)
    ? advertisedOrdersFromSpend
    : roundMoney(advertisedOrdersFromSpend * advertisedProfitRaw);

  return {
    etsyAdsAcosPct: roundMoney(etsyAdsAcosPct),
    monthlyAdSpend: roundMoney(monthlyAdSpend),
    revenue: roundMoney(revenue),
    organic: {
      id: 'organic',
      label: 'Organic sale',
      adsCost: 0,
      fees: organicFees,
      profit: organicProfit,
    },
    advertised: {
      id: 'advertised',
      label: 'Advertised sale',
      adsCost,
      fees: organicFees,
      profit: advertisedProfit,
    },
    adsCost,
    extraKept,
    breakEvenAcosPct,
    advertisedOrdersFromSpend: Number.isFinite(advertisedOrdersFromSpend)
      ? roundMoney(advertisedOrdersFromSpend)
      : advertisedOrdersFromSpend,
    monthlyIncrementalKept,
    incrementalPays: advertisedProfit > 1e-9,
    incrementalBreaksEven: Math.abs(advertisedProfit) <= 1e-9,
    cannibalizedCosts: adsCost,
    winner: winnerFromAds(extraKept),
  };
}

export function etsyAdsNote(comparison) {
  if (!comparison?.organic || !comparison?.advertised) {
    throw new Error('Etsy Ads comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '−' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const pct = (value) => `${Number(value).toFixed(2)}%`;
  const gap = money(Math.abs(comparison.extraKept));
  const ahead = comparison.extraKept >= 0 ? 'more' : 'less';
  const perOrder = `A ${pct(comparison.etsyAdsAcosPct)} ACOS on a ${money(comparison.revenue)} order costs ${money(comparison.adsCost)} and leaves ${money(comparison.advertised.profit)} — ${gap} ${ahead} than the ${money(comparison.organic.profit)} organic sale.`;
  const ceiling = Number.isFinite(comparison.breakEvenAcosPct)
    ? ` An extra advertised order still pays until ACOS reaches about ${pct(comparison.breakEvenAcosPct)}.`
    : ' No finite ACOS can leave a profit on a $0.00 order.';
  const incrementalLine = comparison.incrementalPays
    ? ` If this click is extra demand you would not have sold otherwise, the advertised order still leaves ${money(comparison.advertised.profit)} versus $0.00.`
    : ` If this click is extra demand you would not have sold otherwise, the advertised order still loses ${money(comparison.advertised.profit)}.`;
  let monthlyLine = '';
  if (comparison.adsCost <= 1e-9) {
    monthlyLine = ` At 0% ACOS the monthly ${money(comparison.monthlyAdSpend)} Ads budget is not buying attributed sales in this table.`;
  } else if (Number.isFinite(comparison.advertisedOrdersFromSpend)) {
    const orders = comparison.advertisedOrdersFromSpend.toFixed(2);
    const monthly = Number.isFinite(comparison.monthlyIncrementalKept)
      ? money(comparison.monthlyIncrementalKept)
      : 'an unbounded amount';
    monthlyLine = ` A ${money(comparison.monthlyAdSpend)} monthly budget at this ACOS buys about ${orders} advertised orders and keeps ${monthly} if they are incremental.`;
  }
  return `${perOrder}${ceiling}${incrementalLine}${monthlyLine}`;
}

// Illustrative production-partner extras. $8.00 is about 25 minutes at
// $18/hour to make the piece yourself. $14.00 is a common all-in partner
// quote that already buys materials. $1.00 covers QC or inbound to you.
// 20 handmade units/month vs 40 you can sell is the capacity bind that
// makes a worse per-unit leftover still win the month. These are inputs,
// not a wage or Etsy schedule — the seller overwrites them from the quote
// and the hours they actually have.
export const PRODUCTION_PARTNER_DEFAULTS = {
  yourTimeCost: 8,
  partnerUnitCost: 14,
  partnerHandlingCost: 1,
  yourMonthlyCapacity: 20,
  monthlyDemand: 40,
  partnerRejectRatePercent: 0,
};

function rateAtMost100(value, name, fallback) {
  const result = nonNegativeNumber(value, name, fallback);
  if (result > 100) throw new Error(`${name} must be at most 100`);
  return result;
}

function monthlyWinner(youMonthly, partnerMonthly, hybridMonthly, hybridYouUnits, hybridPartnerUnits) {
  const best = Math.max(youMonthly, partnerMonthly, hybridMonthly);
  const hits = [];
  if (Math.abs(youMonthly - best) <= 1e-9) hits.push('you_make');
  if (Math.abs(partnerMonthly - best) <= 1e-9) hits.push('partner');
  // Hybrid is only its own path when both sides actually ship units.
  // Otherwise it is you-make (no overflow) or partner (no handmade).
  if (hybridYouUnits > 0 && hybridPartnerUnits > 0 && Math.abs(hybridMonthly - best) <= 1e-9) {
    hits.push('hybrid');
  }
  if (hits.length !== 1) return 'tie';
  return hits[0];
}

function perUnitWinner(youProfit, partnerProfit) {
  if (youProfit - partnerProfit > 1e-9) return 'you_make';
  if (partnerProfit - youProfit > 1e-9) return 'partner';
  return 'tie';
}

// Same listing, two ways to fill it: you make the piece (materials + time)
// vs a production partner's all-in unit quote (they buy materials). Fees
// do not change because the ticket does not change. Rejected partner units
// still cost you — the quote is spread across the sellable ones.
//
// Two frames, because sellers mix them up:
//   - per unit: the partner quote vs your handmade leftover;
//   - this month: you can only make so many, and leftover demand is $0
//     unless someone else makes it.
export function compareProductionPartner(input = {}) {
  const yourTimeCost = nonNegativeNumber(
    input.yourTimeCost,
    'Your time cost',
    PRODUCTION_PARTNER_DEFAULTS.yourTimeCost,
  );
  const partnerUnitCost = nonNegativeNumber(
    input.partnerUnitCost,
    'Partner unit cost',
    PRODUCTION_PARTNER_DEFAULTS.partnerUnitCost,
  );
  const partnerHandlingCost = nonNegativeNumber(
    input.partnerHandlingCost,
    'Partner handling cost',
    PRODUCTION_PARTNER_DEFAULTS.partnerHandlingCost,
  );
  const yourMonthlyCapacity = nonNegativeNumber(
    input.yourMonthlyCapacity,
    'Your monthly capacity',
    PRODUCTION_PARTNER_DEFAULTS.yourMonthlyCapacity,
  );
  const monthlyDemand = nonNegativeNumber(
    input.monthlyDemand,
    'Monthly demand',
    PRODUCTION_PARTNER_DEFAULTS.monthlyDemand,
  );
  const partnerRejectRatePercent = rateAtMost100(
    input.partnerRejectRatePercent,
    'Partner reject rate',
    PRODUCTION_PARTNER_DEFAULTS.partnerRejectRatePercent,
  );
  if (partnerRejectRatePercent >= 100) {
    throw new Error('Partner reject rate must be below 100');
  }

  const keepRate = 1 - partnerRejectRatePercent / 100;
  const effectivePartnerCost = (partnerUnitCost + partnerHandlingCost) / keepRate;
  const materialCost = nonNegativeNumber(input.materialCost, 'Material cost', 0);
  const otherCost = nonNegativeNumber(input.otherCost, 'Other cost', 0);

  const youMakeOrder = calculateOrder({
    ...input,
    otherCost: otherCost + yourTimeCost,
  });
  const partnerOrder = calculateOrder({
    ...input,
    materialCost: 0,
    otherCost: otherCost + effectivePartnerCost,
  });

  const youMakeProfit = roundMoney(youMakeOrder.profit);
  const partnerProfit = roundMoney(partnerOrder.profit);
  const perUnitDelta = roundMoney(partnerProfit - youMakeProfit);
  const youMakeFees = roundMoney(orderFeeTotal(youMakeOrder));
  const partnerFees = roundMoney(orderFeeTotal(partnerOrder));

  const youOnlyUnits = Math.min(yourMonthlyCapacity, monthlyDemand);
  const partnerOnlyUnits = monthlyDemand;
  const hybridYouUnits = youOnlyUnits;
  const hybridPartnerUnits = Math.max(0, monthlyDemand - yourMonthlyCapacity);

  const youOnlyMonthly = roundMoney(youOnlyUnits * youMakeProfit);
  const partnerOnlyMonthly = roundMoney(partnerOnlyUnits * partnerProfit);
  const hybridMonthly = roundMoney(
    hybridYouUnits * youMakeProfit + hybridPartnerUnits * partnerProfit,
  );

  const breakEvenPartnerUnit = roundMoney((materialCost + yourTimeCost) * keepRate - partnerHandlingCost);

  const transactionRate = nonNegativeNumber(input.transactionRate, 'Transaction rate', 6.5);
  const paymentRate = nonNegativeNumber(input.paymentRate, 'Payment rate', 3);
  const offsiteAdRate = nonNegativeNumber(input.offsiteAdRate, 'Offsite ad rate', 0);
  const listingFee = nonNegativeNumber(input.listingFee, 'Listing fee', 0.2);
  const paymentFixed = nonNegativeNumber(input.paymentFixed, 'Payment fixed fee', 0.25);
  const shippingCharged = nonNegativeNumber(input.shippingCharged, 'Shipping charged', 0);
  const shippingCost = nonNegativeNumber(input.shippingCost, 'Shipping cost', 0);
  const percentRate = (transactionRate + paymentRate + offsiteAdRate) / 100;
  const keepOfPrice = 1 - percentRate;
  const matchYouMakePrice = keepOfPrice <= 1e-12
    ? Infinity
    : roundMoney(
      (youMakeProfit
        - shippingCharged * keepOfPrice
        + listingFee
        + paymentFixed
        + shippingCost
        + otherCost
        + effectivePartnerCost) / keepOfPrice,
    );

  const youMake = {
    id: 'you_make',
    label: 'You make them',
    units: youOnlyUnits,
    cashOut: roundMoney(materialCost + yourTimeCost),
    fees: youMakeFees,
    profit: youMakeProfit,
    monthly: youOnlyMonthly,
  };
  const partner = {
    id: 'partner',
    label: 'Partner makes them',
    units: partnerOnlyUnits,
    cashOut: roundMoney(effectivePartnerCost),
    fees: partnerFees,
    profit: partnerProfit,
    monthly: partnerOnlyMonthly,
  };
  const hybrid = {
    id: 'hybrid',
    label: 'You make what you can, partner the rest',
    units: monthlyDemand,
    youUnits: hybridYouUnits,
    partnerUnits: hybridPartnerUnits,
    cashOut: roundMoney(
      (hybridYouUnits * (materialCost + yourTimeCost)
        + hybridPartnerUnits * effectivePartnerCost) / (monthlyDemand || 1),
    ),
    fees: youMakeFees,
    profit: monthlyDemand === 0
      ? 0
      : roundMoney(hybridMonthly / monthlyDemand),
    monthly: hybridMonthly,
  };

  return {
    yourTimeCost: roundMoney(yourTimeCost),
    partnerUnitCost: roundMoney(partnerUnitCost),
    partnerHandlingCost: roundMoney(partnerHandlingCost),
    yourMonthlyCapacity,
    monthlyDemand,
    partnerRejectRatePercent,
    effectivePartnerCost: roundMoney(effectivePartnerCost),
    youMake,
    partner,
    hybrid,
    perUnitDelta,
    monthlyDeltaVsYou: roundMoney(hybridMonthly - youOnlyMonthly),
    breakEvenPartnerUnit,
    matchYouMakePrice,
    youMakePaysPerUnit: youMakeProfit - partnerProfit > 1e-9,
    partnerPaysPerUnit: partnerProfit - youMakeProfit > 1e-9,
    hybridPaysThisMonth: hybridMonthly - youOnlyMonthly > 1e-9,
    perUnitWinner: perUnitWinner(youMakeProfit, partnerProfit),
    monthlyWinner: monthlyWinner(
      youOnlyMonthly,
      partnerOnlyMonthly,
      hybridMonthly,
      hybridYouUnits,
      hybridPartnerUnits,
    ),
  };
}

export function productionPartnerNote(comparison) {
  if (!comparison?.youMake || !comparison?.partner || !comparison?.hybrid) {
    throw new Error('Production-partner comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '−' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const perUnitGap = money(Math.abs(comparison.perUnitDelta));
  const ahead = comparison.perUnitDelta >= 0 ? 'more' : 'less';
  const perUnitLine = `Making it yourself keeps ${money(comparison.youMake.profit)} per order. The ${money(comparison.partnerUnitCost)} partner quote, after ${money(comparison.partnerHandlingCost)} handling${comparison.partnerRejectRatePercent > 0 ? ` and a ${comparison.partnerRejectRatePercent}% reject rate` : ''}, keeps ${money(comparison.partner.profit)} — ${perUnitGap} ${ahead} per sale.`;
  const capacityLine = comparison.monthlyDemand > comparison.yourMonthlyCapacity
    ? ` You can only make ${comparison.yourMonthlyCapacity} of the ${comparison.monthlyDemand} you can sell, so staying handmade leaves ${money(comparison.youMake.monthly)} this month. Sending every order to the partner leaves ${money(comparison.partner.monthly)}. Making what you can and sending the overflow keeps ${money(comparison.hybrid.monthly)}.`
    : ` At ${comparison.monthlyDemand} sales against ${comparison.yourMonthlyCapacity} you can make, handmade leftover this month is ${money(comparison.youMake.monthly)} and the partner path is ${money(comparison.partner.monthly)}.`;
  const ceiling = Number.isFinite(comparison.breakEvenPartnerUnit)
    ? ` The partner quote has to fall to about ${money(comparison.breakEvenPartnerUnit)} before it matches your handmade leftover.`
    : '';
  const reprice = Number.isFinite(comparison.matchYouMakePrice)
    ? ` Raising the listing to about ${money(comparison.matchYouMakePrice)} keeps the handmade leftover on the partner path.`
    : ' No finite listing price can match your handmade leftover on the partner path at these fee rates.';
  return `${perUnitLine}${capacityLine}${ceiling}${reprice}`;
}
