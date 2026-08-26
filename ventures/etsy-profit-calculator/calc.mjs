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
