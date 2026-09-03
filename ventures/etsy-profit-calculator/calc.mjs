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
  const percentageRate = transactionRate + paymentRate + offsiteAdRate;
  if (percentageRate >= 100) throw new Error('Combined percentage fee rates must be below 100%');
  const revenue = price + shippingCharged;
  const fees = {
    listing: listingFee,
    transaction: revenue * transactionRate / 100,
    payment: revenue * paymentRate / 100 + paymentFixed,
    offsiteAd: revenue * offsiteAdRate / 100,
  };
  // Cash the seller lays out to make and ship the order. Marketplace
  // fees are deducted from proceeds, not paid up front, so they stay
  // out of invested cash — that keeps ROI honest (same split as the
  // eBay calculator).
  const cashInvested = shippingCost + materialCost + otherCost;
  const costs = fees.listing + fees.transaction + fees.payment + fees.offsiteAd + shippingCost + materialCost + otherCost;
  const profit = revenue - costs;
  return {
    revenue, fees, costs, profit, cashInvested,
    margin: revenue === 0 ? 0 : profit / revenue * 100,
    roi: cashInvested === 0 ? null : profit / cashInvested * 100,
    // Percentage fees apply to shipping revenue too, so solve for the item
    // price after subtracting the shipping amount the customer already pays.
    breakEvenPrice: Math.max(0, (listingFee + paymentFixed + shippingCost + materialCost + otherCost) /
      (1 - percentageRate / 100) - shippingCharged),
  };
}

// Illustrative Offsite Ads rates from Etsy's published shop-size split
// (2026): 15% under $10k trailing-12-month sales, 12% over that
// threshold. These are inputs, not a live schedule — the seller
// overwrites them from their own statement.
export const OFFSITE_AD_RATE_PRESETS = [0, 12, 15];

function offsiteRateLabel(rate) {
  if (rate === 0) return 'Organic (no offsite ads)';
  if (rate === 12) return '12% offsite ads (over $10k shop)';
  if (rate === 15) return '15% offsite ads (under $10k shop)';
  return `${rate}% offsite ads`;
}

// Side-by-side leftover at Etsy's two published Offsite Ads rates plus
// organic. The seller's current offsiteAdRate is included when it is
// not already a preset, so a custom 8% or 13% still appears as "your
// input". Complementary to on-site Etsy Ads (a click you buy). This
// does not opt a shop in or out.
export function compareOffsiteAdRates(input, rates = OFFSITE_AD_RATE_PRESETS) {
  const current = nonNegativeNumber(input.offsiteAdRate, 'Offsite ad rate', 0);
  const unique = [...new Set([...rates, current])]
    .filter((rate) => Number.isFinite(rate) && rate >= 0)
    .sort((a, b) => a - b);
  const organic = calculateOrder({ ...input, offsiteAdRate: 0 });
  return unique.map((rate) => {
    const result = calculateOrder({ ...input, offsiteAdRate: rate });
    return {
      offsiteAdRate: rate,
      label: offsiteRateLabel(rate),
      isCurrent: rate === current,
      profit: result.profit,
      margin: result.margin,
      roi: result.roi,
      cashInvested: result.cashInvested,
      offsiteAdFee: result.fees.offsiteAd,
      profitVsOrganic: result.profit - organic.profit,
      stillProfitable: result.profit > 0,
    };
  });
}

// Highest Offsite Ads rate at which this order still clears minProfit
// (default: break-even). Algebra: profit = organicProfit - revenue * rate/100.
// Returns 0 when the order is already at or below the floor without ads.
export function maxAffordableOffsiteRate(input, minProfit = 0) {
  const floor = Number(minProfit);
  if (!Number.isFinite(floor)) throw new Error('Minimum profit must be a number');
  const organic = calculateOrder({ ...input, offsiteAdRate: 0 });
  // Already under the floor before a single ad fee is charged, so no rate
  // reaches it — not even 0%. Clamping to 0 here claimed 0% was affordable
  // when it is not, and the caller then printed "stays at or above $0.00
  // until Offsite Ads reach about 0.0%" directly beneath a row showing the
  // order already below $0.00 at 0%. null is "no rate qualifies".
  if (organic.profit < floor) return null;
  // No revenue for a percentage fee to sit on, so the rate cannot move
  // profit at all. The floor is already met above, so every rate clears it.
  if (organic.revenue <= 0) return Infinity;
  const rate = (organic.profit - floor) / organic.revenue * 100;
  if (!Number.isFinite(rate)) return null;
  return Math.max(0, rate);
}

export function offsiteAdsNote(rows, maxRate) {
  if (!Array.isArray(rows) || rows.length < 2) {
    throw new Error('Offsite Ads comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '−' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const organic = rows.find((row) => row.offsiteAdRate === 0);
  if (!organic) throw new Error('Offsite Ads comparison is missing the organic row');
  const roi = organic.roi == null ? '' : ` (${organic.roi.toFixed(1)}% ROI on ${money(organic.cashInvested)} cash)`;
  const organicLine = `${organic.label} keeps ${money(organic.profit)}${roi}.`;
  const others = rows.filter((row) => row.offsiteAdRate !== 0).map((row) => {
    const gap = money(Math.abs(row.profitVsOrganic));
    const ahead = row.profitVsOrganic >= 0 ? 'more' : 'less';
    return ` ${row.label} take ${money(row.offsiteAdFee)} and leave ${money(row.profit)} — ${gap} ${ahead}.`;
  }).join('');
  const cap = maxRate === null
    ? ' No Offsite Ads rate keeps this order at or above $0.00 — it is already below that before any ad fee.'
    : Number.isFinite(maxRate)
      ? ` The order stays at or above $0.00 leftover until Offsite Ads reach about ${maxRate.toFixed(1)}%.`
      : '';
  return `${organicLine}${others}${cap}`;
}

export function priceForMargin(input, targetMargin) {
  const margin = Number(targetMargin);
  if (!Number.isFinite(margin) || margin < 0 || margin >= 100) throw new Error('Target margin must be between 0 and 99.9%');
  const n = name => Number(input[name] ?? ({ listingFee: .2, paymentFixed: .25, transactionRate: 6.5, paymentRate: 3, offsiteAdRate: 0 }[name] ?? 0));
  const percentageFees = n('transactionRate') + n('paymentRate') + n('offsiteAdRate');
  if (![n('transactionRate'), n('paymentRate'), n('offsiteAdRate')].every(value => Number.isFinite(value) && value >= 0) || percentageFees > 100) {
    throw new Error('Transaction, payment, and offsite ad rates must total less than 100%');
  }
  const denominator = 1 - percentageFees / 100 - margin / 100;
  if (denominator <= 0) throw new Error('Target margin is not possible with these fee rates');
  return Math.max(0, (n('listingFee') + n('paymentFixed') + n('shippingCost') + n('materialCost') + n('otherCost')) / denominator - n('shippingCharged'));
}

export function priceForProfit(input, targetProfit) {
  const profit = Number(targetProfit);
  if (!Number.isFinite(profit) || profit < 0) throw new Error('Target profit must be a non-negative number');
  const n = name => Number(input[name] ?? ({ listingFee: .2, paymentFixed: .25, transactionRate: 6.5, paymentRate: 3, offsiteAdRate: 0 }[name] ?? 0));
  const percentageFees = n('transactionRate') + n('paymentRate') + n('offsiteAdRate');
  if (![n('transactionRate'), n('paymentRate'), n('offsiteAdRate')].every(value => Number.isFinite(value) && value >= 0) || percentageFees > 100) {
    throw new Error('Transaction, payment, and offsite ad rates must total less than 100%');
  }
  const denominator = 1 - percentageFees / 100;
  if (denominator <= 0) throw new Error('Target profit is not possible with these fee rates');
  return Math.max(0, (profit + n('listingFee') + n('paymentFixed') + n('shippingCost') + n('materialCost') + n('otherCost')) / denominator - n('shippingCharged'));
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

// Solve rate/100 * profitAtFullRate = targetExpected for a sell-through rate
// in [0, 100]. profitAtFullRate is the packed-sale profit that rate scales
// (it can be negative — a discounted or badge-chasing path can lose money on
// every packed sale, not just cost more). The straight ratio is correct
// whatever the sign of profitAtFullRate: a negative profitAtFullRate paired
// with a negative targetExpected still has a real, positive crossing rate
// (both examples below cross at 100%, not 0% — the old code returned 0%
// here because it treated "profit <= 0" as "already broke even", which
// silently understates how much conversion lift a losing discount needs).
//   sale:  $10 item, $12 materials, 90% off -> $1 price, packed loss -$11.
//          Full price at 50% sell-through expects -$1. -$1 / -$11 * 100 =
//          9.09%, not the 0% the old branch produced.
//   Star Seller: same order, $5 postage -> packed loss -$7. Unsigned at 50%
//          sell-through expects -$1. -$1 / -$7 * 100 = 14.29%, not 0%.
// A ratio outside [0, 100] means no reachable sell-through ties the two
// paths (the discounted/badge path can never close the gap, or already
// leads at every rate), so it maps to Infinity rather than a rate no seller
// can actually type.
function breakEvenSellThroughRate(targetExpected, profitAtFullRate) {
  if (Math.abs(profitAtFullRate) <= 1e-12) {
    return Math.abs(targetExpected) <= 1e-12 ? 0 : Infinity;
  }
  const rate = (targetExpected / profitAtFullRate) * 100;
  if (rate < -1e-9 || rate > 100 + 1e-9) return Infinity;
  return roundMoney(Math.max(0, rate));
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

// Illustrative Star Seller extras. $9.00 is a faster USPS / Etsy label
// that buys on-time shipping; the unsigned path keeps the typed $6.00
// Ground / First Class cost. 8 minutes at $18/hour is answering the
// messages that keep a 24-hour response rate. 40% vs 50% is a 10-point
// conversion lift sellers often assign the badge. These are inputs, not
// Etsy's live Star Seller rules — the seller overwrites them from the
// labels they actually buy and the views they actually convert.
export const STAR_SELLER_DEFAULTS = {
  starSellerShippingCost: 9,
  starSellerMessageMinutes: 8,
  starSellerHourlyWage: 18,
  unsignedSellThroughPct: 40,
  starSellerSellThroughPct: 50,
  starSellerListings: 40,
};

function winnerFromExpected(extraExpected) {
  if (extraExpected > 1e-9) return 'star_seller';
  if (extraExpected < -1e-9) return 'unsigned';
  return 'tie';
}

// Same listing, two ways to close the views you already have: stay
// unsigned vs chase the Star Seller badge. The badge itself is free.
// The cash it costs is faster postage plus message time on packed
// sales. The cash it returns is a higher sell-through on the same
// listings. Message time is paid only on packed sales (the same
// pattern as handling on other fee tools). Sell-through is typed, not
// scraped from Shop Stats.
export function compareStarSeller(input = {}) {
  const starSellerShippingCost = nonNegativeNumber(
    input.starSellerShippingCost,
    'Star Seller shipping cost',
    STAR_SELLER_DEFAULTS.starSellerShippingCost,
  );
  const starSellerMessageMinutes = nonNegativeNumber(
    input.starSellerMessageMinutes,
    'Star Seller message minutes',
    STAR_SELLER_DEFAULTS.starSellerMessageMinutes,
  );
  const starSellerHourlyWage = nonNegativeNumber(
    input.starSellerHourlyWage,
    'Star Seller hourly wage',
    STAR_SELLER_DEFAULTS.starSellerHourlyWage,
  );
  const unsignedSellThroughPct = rateAtMost100(
    input.unsignedSellThroughPct,
    'Unsigned sell-through',
    STAR_SELLER_DEFAULTS.unsignedSellThroughPct,
  );
  const starSellerSellThroughPct = rateAtMost100(
    input.starSellerSellThroughPct,
    'Star Seller sell-through',
    STAR_SELLER_DEFAULTS.starSellerSellThroughPct,
  );
  const starSellerListings = nonNegativeNumber(
    input.starSellerListings,
    'Star Seller listings',
    STAR_SELLER_DEFAULTS.starSellerListings,
  );

  const messageCost = starSellerMessageMinutes / 60 * starSellerHourlyWage;
  const otherCost = nonNegativeNumber(input.otherCost, 'Other cost', 0);
  const unsignedShippingCost = nonNegativeNumber(input.shippingCost, 'Shipping cost', 0);

  const unsignedOrder = calculateOrder(input);
  const starOrder = calculateOrder({
    ...input,
    shippingCost: starSellerShippingCost,
    otherCost: otherCost + messageCost,
  });

  const unsignedProfit = roundMoney(unsignedOrder.profit);
  const starProfit = roundMoney(starOrder.profit);
  const extraPostage = roundMoney(starSellerShippingCost - unsignedShippingCost);
  const extraCash = roundMoney(extraPostage + messageCost);
  const unsignedFees = roundMoney(orderFeeTotal(unsignedOrder));
  const starFees = roundMoney(orderFeeTotal(starOrder));

  const unsignedRate = unsignedSellThroughPct / 100;
  const starRate = starSellerSellThroughPct / 100;
  const unsignedExpected = roundMoney(unsignedRate * unsignedOrder.profit);
  const starExpected = roundMoney(starRate * starOrder.profit);
  const extraExpected = roundMoney(starExpected - unsignedExpected);
  const extraAcrossListings = roundMoney(extraExpected * starSellerListings);

  const breakEvenSellThroughPct = breakEvenSellThroughRate(unsignedExpected, starOrder.profit);

  // Total Star Seller postage that still matches unsigned expected keep,
  // after message time and the typed Star Seller sell-through.
  const neededStarProfit = starRate <= 1e-12
    ? (unsignedExpected <= 1e-12 ? unsignedOrder.profit : Infinity)
    : unsignedExpected / starRate;
  const starPostageCeiling = !Number.isFinite(neededStarProfit)
    ? Infinity
    : roundMoney(unsignedShippingCost + unsignedOrder.profit - messageCost - neededStarProfit);

  const unsigned = {
    id: 'unsigned',
    label: 'Stay unsigned',
    shippingCost: roundMoney(unsignedShippingCost),
    messageCost: 0,
    extraCash: 0,
    fees: unsignedFees,
    profit: unsignedProfit,
    sellThroughPct: unsignedSellThroughPct,
    expected: unsignedExpected,
    acrossListings: roundMoney(unsignedExpected * starSellerListings),
  };
  const starSeller = {
    id: 'star_seller',
    label: 'Chase Star Seller',
    shippingCost: roundMoney(starSellerShippingCost),
    messageCost: roundMoney(messageCost),
    extraCash,
    fees: starFees,
    profit: starProfit,
    sellThroughPct: starSellerSellThroughPct,
    expected: starExpected,
    acrossListings: roundMoney(starExpected * starSellerListings),
  };

  return {
    starSellerShippingCost: roundMoney(starSellerShippingCost),
    starSellerMessageMinutes,
    starSellerHourlyWage: roundMoney(starSellerHourlyWage),
    unsignedSellThroughPct,
    starSellerSellThroughPct,
    starSellerListings,
    messageCost: roundMoney(messageCost),
    extraPostage,
    extraCash,
    unsigned,
    starSeller,
    extraExpected,
    extraAcrossListings,
    breakEvenSellThroughPct,
    starPostageCeiling,
    starPays: extraExpected > 1e-9,
    starBreaksEven: Math.abs(extraExpected) <= 1e-9,
    winner: winnerFromExpected(extraExpected),
  };
}

export function starSellerNote(comparison) {
  if (!comparison?.unsigned || !comparison?.starSeller) {
    throw new Error('Star Seller comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '−' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const pct = (value) => `${Number(value).toFixed(1)}%`;
  const extras = [];
  if (Math.abs(comparison.extraPostage) > 1e-9) extras.push(`${money(comparison.extraPostage)} extra postage`);
  if (comparison.messageCost > 0) extras.push(`${money(comparison.messageCost)} answering messages`);
  const extraPhrase = extras.length ? extras.join(' and ') : 'no extra cash';
  const gap = money(Math.abs(comparison.extraExpected));
  const ahead = comparison.extraExpected >= 0 ? 'more' : 'less';
  const packed = `A packed Star Seller sale, after ${extraPhrase}, leaves ${money(comparison.starSeller.profit)} versus ${money(comparison.unsigned.profit)} staying unsigned.`;
  const expected = ` At ${pct(comparison.unsignedSellThroughPct)} vs ${pct(comparison.starSellerSellThroughPct)} sell-through the unsigned path expects ${money(comparison.unsigned.expected)} per listing and Star Seller expects ${money(comparison.starSeller.expected)} — ${gap} ${ahead} (${money(comparison.extraAcrossListings)} across ${comparison.starSellerListings} listings).`;
  const ceiling = Number.isFinite(comparison.breakEvenSellThroughPct)
    ? ` The badge has to convert about ${pct(comparison.breakEvenSellThroughPct)} of listings before it matches staying unsigned.`
    : ' No finite sell-through can match staying unsigned when a packed Star Seller sale leaves $0.00 or less.';
  const postage = Number.isFinite(comparison.starPostageCeiling)
    ? ` Star Seller postage has to stay at or below about ${money(comparison.starPostageCeiling)} at this conversion lift.`
    : '';
  return `${packed}${expected}${ceiling}${postage}`;
}

// Illustrative shop-sale extras. 20% off is the coupon Etsy sellers
// reach for first. $5.00 off is the “looks smaller than 20%” dollar
// coupon on a $30 listing. 40% vs 55% is a 15-point conversion lift
// sellers often assign a sale. These are inputs, not Etsy's live
// coupon schedule — the seller overwrites them from the sale they
// actually run and the views they actually convert.
export const SHOP_SALE_DEFAULTS = {
  salePercent: 20,
  saleDollar: 5,
  listedSellThroughPct: 40,
  saleSellThroughPct: 55,
  saleListings: 40,
};

function salePriceFromPercent(listPrice, salePercent) {
  return Math.max(0, listPrice * (1 - salePercent / 100));
}

function salePriceFromDollar(listPrice, saleDollar) {
  return Math.max(0, listPrice - saleDollar);
}

function saleWinner(listedExpected, percentExpected, dollarExpected) {
  const best = Math.max(listedExpected, percentExpected, dollarExpected);
  const hits = [];
  if (Math.abs(listedExpected - best) <= 1e-9) hits.push('as_listed');
  if (Math.abs(percentExpected - best) <= 1e-9) hits.push('percent');
  if (Math.abs(dollarExpected - best) <= 1e-9) hits.push('dollar');
  if (hits.length !== 1) return 'tie';
  return hits[0];
}

function neededSalePriceForProfit(input, neededProfit) {
  const transactionRate = nonNegativeNumber(input.transactionRate, 'Transaction rate', 6.5);
  const paymentRate = nonNegativeNumber(input.paymentRate, 'Payment rate', 3);
  const offsiteAdRate = nonNegativeNumber(input.offsiteAdRate, 'Offsite ad rate', 0);
  const listingFee = nonNegativeNumber(input.listingFee, 'Listing fee', 0.2);
  const paymentFixed = nonNegativeNumber(input.paymentFixed, 'Payment fixed fee', 0.25);
  const shippingCharged = nonNegativeNumber(input.shippingCharged, 'Shipping charged', 0);
  const shippingCost = nonNegativeNumber(input.shippingCost, 'Shipping cost', 0);
  const materialCost = nonNegativeNumber(input.materialCost, 'Material cost', 0);
  const otherCost = nonNegativeNumber(input.otherCost, 'Other cost', 0);
  const keepRate = 1 - (transactionRate + paymentRate + offsiteAdRate) / 100;
  if (keepRate <= 1e-12) return Infinity;
  const neededRevenue = neededProfit + listingFee + paymentFixed + shippingCost + materialCost + otherCost;
  return roundMoney(neededRevenue / keepRate - shippingCharged);
}

// Same listing, three ways to close the views you already have: stay
// full price, run a percent-off shop sale, or run a dollar-off coupon.
// Percentage fees sit on the lower ticket; listing fee, payment fixed
// fee, postage, and materials do not change. The cash a sale returns
// is a higher sell-through on the same listings. Sell-through is
// typed, not scraped from Shop Stats.
//
// Two frames, because sellers mix them up:
//   - cannibalized: this buyer would have paid full price, so the
//     sale only costs you the discount;
//   - expected: packed leftover × typed sell-through, the same
//     pattern as Star Seller.
export function compareShopSale(input = {}) {
  const listPrice = nonNegativeNumber(input.price, 'Price');
  const salePercent = rateAtMost100(
    input.salePercent,
    'Sale percent',
    SHOP_SALE_DEFAULTS.salePercent,
  );
  const saleDollar = nonNegativeNumber(
    input.saleDollar,
    'Sale dollar off',
    SHOP_SALE_DEFAULTS.saleDollar,
  );
  const listedSellThroughPct = rateAtMost100(
    input.listedSellThroughPct,
    'Full-price sell-through',
    SHOP_SALE_DEFAULTS.listedSellThroughPct,
  );
  const saleSellThroughPct = rateAtMost100(
    input.saleSellThroughPct,
    'Sale sell-through',
    SHOP_SALE_DEFAULTS.saleSellThroughPct,
  );
  const saleListings = nonNegativeNumber(
    input.saleListings,
    'Sale listings',
    SHOP_SALE_DEFAULTS.saleListings,
  );

  const percentPrice = salePriceFromPercent(listPrice, salePercent);
  const dollarPrice = salePriceFromDollar(listPrice, saleDollar);

  const listedOrder = calculateOrder(input);
  const percentOrder = calculateOrder({ ...input, price: percentPrice });
  const dollarOrder = calculateOrder({ ...input, price: dollarPrice });

  const listedProfitRaw = listedOrder.profit;
  const percentProfitRaw = percentOrder.profit;
  const dollarProfitRaw = dollarOrder.profit;
  const listedProfit = roundMoney(listedProfitRaw);
  const percentProfit = roundMoney(percentProfitRaw);
  const dollarProfit = roundMoney(dollarProfitRaw);
  const listedFees = roundMoney(orderFeeTotal(listedOrder));
  const percentFees = roundMoney(orderFeeTotal(percentOrder));
  const dollarFees = roundMoney(orderFeeTotal(dollarOrder));

  const listedRate = listedSellThroughPct / 100;
  const saleRate = saleSellThroughPct / 100;
  const listedExpected = roundMoney(listedRate * listedProfitRaw);
  const percentExpected = roundMoney(saleRate * percentProfitRaw);
  const dollarExpected = roundMoney(saleRate * dollarProfitRaw);
  const percentExtraExpected = roundMoney(percentExpected - listedExpected);
  const dollarExtraExpected = roundMoney(dollarExpected - listedExpected);

  const breakEvenPercentSellThroughPct = breakEvenSellThroughRate(listedExpected, percentProfitRaw);
  const breakEvenDollarSellThroughPct = breakEvenSellThroughRate(listedExpected, dollarProfitRaw);

  const neededProfitAtSaleRate = saleRate <= 1e-12
    ? (listedExpected <= 1e-12 ? listedProfitRaw : Infinity)
    : listedExpected / saleRate;
  const salePriceCeiling = !Number.isFinite(neededProfitAtSaleRate)
    ? Infinity
    : neededSalePriceForProfit(input, neededProfitAtSaleRate);
  const percentCeiling = !Number.isFinite(salePriceCeiling) || listPrice <= 1e-12
    ? (listPrice <= 1e-12 ? 0 : Infinity)
    : roundMoney(((listPrice - salePriceCeiling) / listPrice) * 100);
  const dollarCeiling = !Number.isFinite(salePriceCeiling)
    ? Infinity
    : roundMoney(listPrice - salePriceCeiling);

  const asListed = {
    id: 'as_listed',
    label: 'Stay full price',
    price: roundMoney(listPrice),
    discount: 0,
    fees: listedFees,
    profit: listedProfit,
    sellThroughPct: listedSellThroughPct,
    expected: listedExpected,
    acrossListings: roundMoney(listedExpected * saleListings),
    cannibalized: 0,
  };
  const percent = {
    id: 'percent',
    label: `${roundMoney(salePercent)}% off`,
    price: roundMoney(percentPrice),
    discount: roundMoney(listPrice - percentPrice),
    fees: percentFees,
    profit: percentProfit,
    sellThroughPct: saleSellThroughPct,
    expected: percentExpected,
    acrossListings: roundMoney(percentExpected * saleListings),
    cannibalized: roundMoney(percentProfitRaw - listedProfitRaw),
  };
  const dollar = {
    id: 'dollar',
    label: `$${roundMoney(saleDollar).toFixed(2)} off`,
    price: roundMoney(dollarPrice),
    discount: roundMoney(listPrice - dollarPrice),
    fees: dollarFees,
    profit: dollarProfit,
    sellThroughPct: saleSellThroughPct,
    expected: dollarExpected,
    acrossListings: roundMoney(dollarExpected * saleListings),
    cannibalized: roundMoney(dollarProfitRaw - listedProfitRaw),
  };

  return {
    salePercent: roundMoney(salePercent),
    saleDollar: roundMoney(saleDollar),
    listedSellThroughPct,
    saleSellThroughPct,
    saleListings,
    asListed,
    percent,
    dollar,
    percentExtraExpected,
    dollarExtraExpected,
    percentExtraAcrossListings: roundMoney(percentExtraExpected * saleListings),
    dollarExtraAcrossListings: roundMoney(dollarExtraExpected * saleListings),
    breakEvenPercentSellThroughPct,
    breakEvenDollarSellThroughPct,
    salePriceCeiling,
    percentCeiling,
    dollarCeiling,
    percentPays: percentExtraExpected > 1e-9,
    dollarPays: dollarExtraExpected > 1e-9,
    percentBreaksEven: Math.abs(percentExtraExpected) <= 1e-9,
    dollarBreaksEven: Math.abs(dollarExtraExpected) <= 1e-9,
    winner: saleWinner(listedExpected, percentExpected, dollarExpected),
  };
}

export function shopSaleNote(comparison) {
  if (!comparison?.asListed || !comparison?.percent || !comparison?.dollar) {
    throw new Error('Shop-sale comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '−' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const pct = (value) => `${Number(value).toFixed(1)}%`;
  const listed = `A packed full-price sale leaves ${money(comparison.asListed.profit)}.`;
  const percentPacked = ` ${pct(comparison.salePercent)} off drops the ticket to ${money(comparison.percent.price)} and leaves ${money(comparison.percent.profit)} if this buyer would have paid full price (${money(comparison.percent.cannibalized)}).`;
  const dollarPacked = ` A ${money(comparison.saleDollar)} coupon leaves ${money(comparison.dollar.profit)} (${money(comparison.dollar.cannibalized)} vs full price).`;
  const expected = ` At ${pct(comparison.listedSellThroughPct)} vs ${pct(comparison.saleSellThroughPct)} sell-through the full-price path expects ${money(comparison.asListed.expected)} per listing, ${pct(comparison.salePercent)} off expects ${money(comparison.percent.expected)} (${money(comparison.percentExtraExpected)}), and ${money(comparison.saleDollar)} off expects ${money(comparison.dollar.expected)} (${money(comparison.dollarExtraExpected)}; ${money(comparison.dollarExtraAcrossListings)} across ${comparison.saleListings} listings).`;
  const percentCeiling = Number.isFinite(comparison.breakEvenPercentSellThroughPct)
    ? ` The percent sale has to convert about ${pct(comparison.breakEvenPercentSellThroughPct)} of listings before it matches staying full price.`
    : ' No finite sell-through can match staying full price when a packed percent-off sale leaves $0.00 or less.';
  const dollarCeiling = Number.isFinite(comparison.breakEvenDollarSellThroughPct)
    ? ` The dollar coupon has to convert about ${pct(comparison.breakEvenDollarSellThroughPct)}.`
    : ' No finite sell-through can match staying full price when a packed dollar-off sale leaves $0.00 or less.';
  const discountCeiling = Number.isFinite(comparison.percentCeiling) && Number.isFinite(comparison.dollarCeiling)
    ? ` At this conversion lift the sale has to stay at or below about ${pct(comparison.percentCeiling)} or ${money(comparison.dollarCeiling)} off.`
    : '';
  return `${listed}${percentPacked}${dollarPacked}${expected}${percentCeiling}${dollarCeiling}${discountCeiling}`;
}

// Illustrative free-shipping defaults: raise the $30 item to $32 and drop
// the $5 label. Absorbing the whole label ($35 item, $0 charged) is a tie
// on the same customer total — percentage fees sit on item + shipping.
export const FREE_SHIPPING_DEFAULTS = {
  freeShipPrice: 32,
  monthlyOrders: 40,
};

function liftToMatch(baseProfit, altProfit) {
  if (altProfit > baseProfit + 1e-9) {
    return { liftPercent: 0, extraPerOrder: 0, canWinWithVolume: true, alreadyAhead: true };
  }
  if (Math.abs(altProfit - baseProfit) <= 1e-9) {
    return { liftPercent: 0, extraPerOrder: 0, canWinWithVolume: true, alreadyAhead: false };
  }
  if (altProfit <= 1e-12) {
    return { liftPercent: null, extraPerOrder: null, canWinWithVolume: false, alreadyAhead: false };
  }
  const extraPerOrder = (baseProfit - altProfit) / altProfit;
  return {
    liftPercent: extraPerOrder * 100,
    extraPerOrder,
    canWinWithVolume: true,
    alreadyAhead: false,
  };
}

function freeShippingWinner(raisedProfit, chargedProfit) {
  if (raisedProfit > chargedProfit + 1e-9) return 'raised';
  if (chargedProfit > raisedProfit + 1e-9) return 'charged';
  return 'tie';
}

// Charge shipping vs free shipping at a typed item price. Eating the label
// (same item price, $0 charged) and absorbing it (item = old buyer total)
// are teaching rows: same customer total is a fee-stack tie.
export function compareFreeShipping(input = {}) {
  const chargedRaw = calculateOrder(input);
  const price = nonNegativeNumber(input.price, 'Price');
  const shippingCharged = nonNegativeNumber(input.shippingCharged, 'Shipping charged', 0);
  const freeShipPrice = nonNegativeNumber(
    input.freeShipPrice,
    'Free-shipping item price',
    FREE_SHIPPING_DEFAULTS.freeShipPrice,
  );
  const monthlyOrders = nonNegativeNumber(
    input.monthlyOrders,
    'Monthly orders',
    FREE_SHIPPING_DEFAULTS.monthlyOrders,
  );

  const eatLabelRaw = calculateOrder({ ...input, shippingCharged: 0 });
  const absorbPrice = price + shippingCharged;
  const absorbRaw = calculateOrder({ ...input, price: absorbPrice, shippingCharged: 0 });
  const raisedRaw = calculateOrder({ ...input, price: freeShipPrice, shippingCharged: 0 });
  const lift = liftToMatch(chargedRaw.profit, raisedRaw.profit);
  const extraOrdersNeeded = lift.extraPerOrder == null ? null : monthlyOrders * lift.extraPerOrder;

  const chargedProfit = roundMoney(chargedRaw.profit);
  const eatLabelProfit = roundMoney(eatLabelRaw.profit);
  const absorbProfit = roundMoney(absorbRaw.profit);
  const raisedProfit = roundMoney(raisedRaw.profit);
  const perOrderDelta = roundMoney(raisedRaw.profit - chargedRaw.profit);
  const eatLabelDelta = roundMoney(eatLabelRaw.profit - chargedRaw.profit);

  return {
    freeShipPrice: roundMoney(freeShipPrice),
    monthlyOrders,
    absorbPrice: roundMoney(absorbPrice),
    charged: {
      id: 'charged',
      label: 'Charge shipping',
      price: roundMoney(price),
      shippingCharged: roundMoney(shippingCharged),
      revenue: roundMoney(chargedRaw.revenue),
      profit: chargedProfit,
      monthly: roundMoney(monthlyOrders * chargedRaw.profit),
    },
    eatLabel: {
      id: 'eat_label',
      label: 'Free shipping, same item price',
      price: roundMoney(price),
      shippingCharged: 0,
      revenue: roundMoney(eatLabelRaw.revenue),
      profit: eatLabelProfit,
      monthly: roundMoney(monthlyOrders * eatLabelRaw.profit),
    },
    absorb: {
      id: 'absorb',
      label: 'Free shipping, same customer total',
      price: roundMoney(absorbPrice),
      shippingCharged: 0,
      revenue: roundMoney(absorbRaw.revenue),
      profit: absorbProfit,
      monthly: roundMoney(monthlyOrders * absorbRaw.profit),
    },
    raised: {
      id: 'raised',
      label: 'Free shipping at typed price',
      price: roundMoney(freeShipPrice),
      shippingCharged: 0,
      revenue: roundMoney(raisedRaw.revenue),
      profit: raisedProfit,
      monthly: roundMoney(monthlyOrders * raisedRaw.profit),
    },
    perOrderDelta,
    eatLabelDelta,
    liftPercent: lift.liftPercent == null ? null : roundMoney(lift.liftPercent),
    extraPerOrder: lift.extraPerOrder == null ? null : lift.extraPerOrder,
    extraOrdersNeeded: extraOrdersNeeded == null ? null : roundMoney(extraOrdersNeeded),
    canWinWithVolume: lift.canWinWithVolume,
    alreadyAhead: lift.alreadyAhead,
    winner: freeShippingWinner(raisedRaw.profit, chargedRaw.profit),
    monthlyCharged: roundMoney(monthlyOrders * chargedRaw.profit),
    monthlyRaised: roundMoney(monthlyOrders * raisedRaw.profit),
    monthlyEatLabel: roundMoney(monthlyOrders * eatLabelRaw.profit),
    monthlyDelta: roundMoney(monthlyOrders * (raisedRaw.profit - chargedRaw.profit)),
  };
}

export function freeShippingNote(comparison) {
  if (!comparison?.charged || !comparison?.raised || !comparison?.eatLabel || !comparison?.absorb) {
    throw new Error('Free-shipping comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '−' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const signed = (value) => {
    if (Math.abs(value) <= 1e-9) return '$0.00';
    return `${value < 0 ? '−' : '+'}$${Math.abs(value).toFixed(2)}`;
  };
  const charged = `Charging ${money(comparison.charged.shippingCharged)} shipping on a ${money(comparison.charged.price)} item leaves ${money(comparison.charged.profit)} per order.`;
  const eat = ` Free shipping at the same item price leaves ${money(comparison.eatLabel.profit)} (${signed(comparison.eatLabelDelta)}).`;
  const absorb = ` Moving the label into the item price (${money(comparison.absorb.price)} + $0.00) leaves ${money(comparison.absorb.profit)} — the same customer total is a tie.`;
  const raised = ` Free shipping at ${money(comparison.raised.price)} leaves ${money(comparison.raised.profit)} (${signed(comparison.perOrderDelta)} per order).`;
  let volume;
  if (comparison.alreadyAhead) {
    volume = ` Free shipping already keeps more per order, so it does not need extra volume.`;
  } else if (comparison.winner === 'tie') {
    volume = ` Same leftover per order — extra orders are a ranking question, not a fee-stack one.`;
  } else if (!comparison.canWinWithVolume) {
    volume = ` Free shipping is at or below $0.00 leftover, so no finite extra-order lift can match charging shipping.`;
  } else {
    volume = ` At ${comparison.monthlyOrders} orders/month, free shipping needs about ${comparison.extraOrdersNeeded.toFixed(1)} extra orders (${comparison.liftPercent.toFixed(1)}%) to match ${money(comparison.monthlyCharged)}.`;
  }
  return `${charged}${eat}${absorb}${raised}${volume}`;
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

const RENEWAL_SALES_SCENARIOS = [0, 1, 2, 5, 10, 20];

// Etsy charges the listing fee when the listing is published or auto-renews,
// not once per sale. The order calculator subtracts that fee from every order,
// which overstates cost on a listing that sells more than once and hides the
// fee entirely on a listing that sells nothing. This function keeps the same
// per-order stack, then allocates the listing fee across the sales expected
// in one renewal window. It does not decide whether auto-renew should stay on.
export function calculateListingRenewal(input = {}) {
  const listingFee = nonNegativeNumber(input.listingFee, 'Listing fee', 0.2);
  const renewalMonths = Number(input.renewalMonths ?? 4);
  if (!Number.isFinite(renewalMonths) || renewalMonths <= 0) {
    throw new Error('Renewal months must be greater than zero');
  }
  const expectedSales = nonNegativeNumber(input.expectedSales, 'Expected sales', 0);

  const withoutListing = calculateOrder({ ...input, listingFee: 0 });
  const withPerOrderListing = calculateOrder({ ...input, listingFee });
  const listingPerSale = expectedSales === 0 ? null : listingFee / expectedSales;
  const withAllocatedListing = listingPerSale === null
    ? null
    : calculateOrder({ ...input, listingFee: listingPerSale });
  const renewalsPerYear = 12 / renewalMonths;
  const annualListingCost = listingFee * renewalsPerYear;
  const salesToRecover = withoutListing.profit > 0 ? Math.ceil(listingFee / withoutListing.profit) : null;
  const periodProfitAfterListing = expectedSales * withoutListing.profit - listingFee;
  const annualSales = expectedSales * renewalsPerYear;
  const annualProfitAfterListing = annualSales * withoutListing.profit - annualListingCost;
  const overstatedInPeriod = expectedSales > 1 ? listingFee * (expectedSales - 1) : 0;

  return {
    listingFee,
    renewalMonths,
    expectedSales,
    renewalsPerYear,
    annualListingCost,
    listingPerSale,
    contributionExListing: withoutListing.profit,
    revenue: withoutListing.revenue,
    profitIfChargedEveryOrder: withPerOrderListing.profit,
    profitIfAllocated: withAllocatedListing ? withAllocatedListing.profit : null,
    salesToRecover,
    periodProfitAfterListing,
    annualProfitAfterListing,
    overstatedInPeriod,
    coversListing: periodProfitAfterListing >= 0,
    unpaidRenewal: expectedSales === 0,
    scenarios: RENEWAL_SALES_SCENARIOS.map((sales) => ({
      sales,
      listingPerSale: sales === 0 ? null : listingFee / sales,
      periodProfitAfterListing: sales * withoutListing.profit - listingFee,
      periodProfitIfListingPerOrder: sales * (withoutListing.profit - listingFee),
    })),
  };
}

export function listingRenewalNote(result) {
  if (!result || typeof result.listingFee !== 'number') {
    throw new Error('Listing-renewal comparison is missing');
  }
  const money = (value) => {
    const sign = value < 0 ? '−' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  if (result.unpaidRenewal) {
    return `Auto-renew still charges ${money(result.listingFee)} even if nothing sells. Treating the listing fee as a per-order cost hides that ${money(result.listingFee)} until an order is calculated. Annual listing cost at a ${result.renewalMonths}-month window is ${money(result.annualListingCost)}.`;
  }
  const leftover = `${result.expectedSales} sales in ${result.renewalMonths} months leave ${money(result.periodProfitAfterListing)} after the listing fee.`;
  const allocated = result.listingPerSale === null ? '' : ` Listing cost per sale is ${money(result.listingPerSale)}.`;
  const recover = result.salesToRecover === null
    ? ' This order does not recover the listing fee.'
    : result.salesToRecover === 1
      ? ' 1 sale recovers the listing fee from leftover contribution.'
      : ` ${result.salesToRecover} sales recover the listing fee from leftover contribution.`;
  const overstated = result.overstatedInPeriod > 0
    ? ` Charging the full listing fee on every order overstates listing cost by ${money(result.overstatedInPeriod)} across ${result.expectedSales} sales.`
    : '';
  return `${leftover}${allocated}${recover}${overstated}`;
}

/**
 * Illustrative third-party / carrier-account label when the
 * seller has not typed one. Edit it from a Pirate Ship, Shippo,
 * or USPS Click-N-Ship quote — not a published Etsy Shipping rate.
 *
 * Complementary to free shipping (what you charge the buyer) and
 * Star Seller (a faster label to stay on-time). This is where you
 * buy the already-sold tracked label.
 */
export const ETSY_LABELS_DEFAULTS = {
  etsyLabelCost: 6,
  thirdPartyLabelCost: 5.1,
  etsyLabelClaimRatePercent: 0.8,
  thirdPartyClaimRatePercent: 2.5,
  labelUploadMinutes: 4,
  labelUploadWage: 18,
  labelFeeRefundOnClaimPercent: 100,
  monthlyLabelShipments: 40,
};

function labelUploadTimeCost(minutes, hourlyWage) {
  return minutes * (hourlyWage / 60);
}

function etsyFeeTotal(sold) {
  return sold.fees.listing + sold.fees.transaction + sold.fees.payment + sold.fees.offsiteAd;
}

function etsyLabelPath({
  input,
  shippingCost,
  extraCost,
  claimRatePercent,
  feeRefundOnClaim,
}) {
  const materialCost = nonNegativeNumber(input.materialCost, 'Material cost', 0);
  const otherCost = nonNegativeNumber(input.otherCost, 'Other cost', 0);
  const sold = calculateOrder({
    ...input,
    shippingCost,
    otherCost: otherCost + extraCost,
  });
  const sunk = shippingCost + materialCost + otherCost + extraCost;
  const unrefundedFees = etsyFeeTotal(sold) * (1 - feeRefundOnClaim / 100);
  const claimProfit = -sunk - unrefundedFees;
  const claimFrac = claimRatePercent / 100;
  const expectedProfit = (1 - claimFrac) * sold.profit + claimFrac * claimProfit;
  return {
    sold,
    claimProfit,
    expectedProfit,
  };
}

function etsyLabelRow({
  id,
  label,
  labelCost,
  extraCost,
  claimRatePercent,
  path,
}) {
  return {
    id,
    label,
    labelCost: roundMoney(labelCost),
    extraCost: roundMoney(extraCost),
    claimRatePercent,
    completedProfit: roundMoney(path.sold.profit),
    soldExpectedProfit: path.sold.profit,
    claimProfit: roundMoney(path.claimProfit),
    expectedProfit: roundMoney(path.expectedProfit),
    rawExpectedProfit: path.expectedProfit,
    expectedProfitDelta: 0,
  };
}

/**
 * Same already-sold tracked shipment, three ways to buy the label.
 *
 *   - Etsy label — pay the Etsy Shipping quote. Tracking
 *     auto-uploads. Purchase Protection usually rides with an
 *     Etsy-purchased label, so the typed Etsy claim rate is the
 *     leftover item-not-received share after that coverage.
 *   - Third-party label — Pirate Ship, Shippo, or a carrier
 *     account. Postage is often cheaper. Tracking is uploaded
 *     by hand, so a typed upload-time cost sits on every box.
 *     The typed third-party claim rate is usually higher
 *     because Etsy Purchase Protection is thinner when the
 *     label was bought elsewhere.
 *   - Third-party, no extra time — same postage and claim rate
 *     with the upload minutes zeroed. Isolates whether the
 *     claim-rate gap, not the four minutes, is the leak.
 *
 * Complementary to free shipping (what you charge vs baking
 * postage into the list) and Star Seller (a faster label to
 * stay on-time). Label quotes, claim rates, and upload time
 * are inputs, not a carrier table or Etsy Purchase Protection
 * policy.
 */
export function compareEtsyLabels(input = {}) {
  nonNegativeNumber(input.price, 'Price');

  const typedShippingCost = nonNegativeNumber(input.shippingCost, 'Shipping cost', 0);
  const etsyLabelFallback = input.shippingCost === undefined
    || input.shippingCost === null
    || input.shippingCost === ''
    ? ETSY_LABELS_DEFAULTS.etsyLabelCost
    : typedShippingCost;
  const etsyLabelCost = nonNegativeNumber(
    input.etsyLabelCost,
    'Etsy label',
    etsyLabelFallback,
  );
  const thirdPartyLabelCost = nonNegativeNumber(
    input.thirdPartyLabelCost,
    'Third-party label',
    ETSY_LABELS_DEFAULTS.thirdPartyLabelCost,
  );
  const etsyClaimRate = rateAtMost100(
    input.etsyLabelClaimRatePercent,
    'Etsy label claim rate',
    ETSY_LABELS_DEFAULTS.etsyLabelClaimRatePercent,
  );
  const thirdPartyClaimRate = rateAtMost100(
    input.thirdPartyClaimRatePercent,
    'Third-party claim rate',
    ETSY_LABELS_DEFAULTS.thirdPartyClaimRatePercent,
  );
  const uploadMinutes = nonNegativeNumber(
    input.labelUploadMinutes,
    'Label upload minutes',
    ETSY_LABELS_DEFAULTS.labelUploadMinutes,
  );
  const uploadWage = nonNegativeNumber(
    input.labelUploadWage,
    'Label upload hourly wage',
    ETSY_LABELS_DEFAULTS.labelUploadWage,
  );
  const feeRefundOnClaim = rateAtMost100(
    input.labelFeeRefundOnClaimPercent,
    'Fee refund on label claim',
    ETSY_LABELS_DEFAULTS.labelFeeRefundOnClaimPercent,
  );
  const monthlyShipments = nonNegativeNumber(
    input.monthlyLabelShipments,
    'Monthly label shipments',
    ETSY_LABELS_DEFAULTS.monthlyLabelShipments,
  );
  if (monthlyShipments === 0) throw new Error('Monthly label shipments must be greater than zero');

  const uploadTimeCost = labelUploadTimeCost(uploadMinutes, uploadWage);
  const pathArgs = { input, feeRefundOnClaim };

  const etsyPath = etsyLabelPath({
    ...pathArgs,
    shippingCost: etsyLabelCost,
    extraCost: 0,
    claimRatePercent: etsyClaimRate,
  });
  const thirdPath = etsyLabelPath({
    ...pathArgs,
    shippingCost: thirdPartyLabelCost,
    extraCost: uploadTimeCost,
    claimRatePercent: thirdPartyClaimRate,
  });
  const postagePath = etsyLabelPath({
    ...pathArgs,
    shippingCost: thirdPartyLabelCost,
    extraCost: 0,
    claimRatePercent: thirdPartyClaimRate,
  });

  const etsy = etsyLabelRow({
    id: 'etsy',
    label: 'Etsy label',
    labelCost: etsyLabelCost,
    extraCost: 0,
    claimRatePercent: etsyClaimRate,
    path: etsyPath,
  });
  const third = etsyLabelRow({
    id: 'third_party',
    label: 'Third-party label',
    labelCost: thirdPartyLabelCost,
    extraCost: uploadTimeCost,
    claimRatePercent: thirdPartyClaimRate,
    path: thirdPath,
  });
  const postageOnly = etsyLabelRow({
    id: 'third_party_no_time',
    label: 'Third-party, no extra time',
    labelCost: thirdPartyLabelCost,
    extraCost: 0,
    claimRatePercent: thirdPartyClaimRate,
    path: postagePath,
  });
  etsy.expectedProfitDelta = 0;
  third.expectedProfitDelta = roundMoney(third.expectedProfit - etsy.expectedProfit);
  postageOnly.expectedProfitDelta = roundMoney(postageOnly.expectedProfit - etsy.expectedProfit);

  const rows = [etsy, third, postageOnly];
  // postageOnly is a diagnostic (time already sunk). The decision is
  // Etsy vs the timed third-party quote you would actually buy.
  const decisionGap = third.expectedProfit - etsy.expectedProfit;
  const winner = Math.abs(decisionGap) <= 1e-9
    ? 'tie'
    : decisionGap > 0 ? 'third_party' : 'etsy';

  const thirdGap = third.soldExpectedProfit - thirdPath.claimProfit;
  let breakEvenThirdPartyClaimRate = Infinity;
  if (thirdGap > 1e-12) {
    const rate = (third.soldExpectedProfit - etsy.rawExpectedProfit) / thirdGap * 100;
    breakEvenThirdPartyClaimRate = rate < -1e-9 || rate > 100 + 1e-9
      ? Infinity
      : Math.max(0, Math.min(100, rate));
  }

  const thirdAtLabel = (labelCost) => etsyLabelPath({
    ...pathArgs,
    shippingCost: labelCost,
    extraCost: uploadTimeCost,
    claimRatePercent: thirdPartyClaimRate,
  }).expectedProfit;
  const atZeroLabel = thirdAtLabel(0);
  const atTenLabel = thirdAtLabel(10);
  const labelSlope = (atTenLabel - atZeroLabel) / 10;
  let breakEvenThirdPartyLabelCost = Infinity;
  if (Math.abs(labelSlope) > 1e-12) {
    const needed = (etsy.rawExpectedProfit - atZeroLabel) / labelSlope;
    breakEvenThirdPartyLabelCost = needed < -1e-9 ? Infinity : needed;
  }

  const thirdAtMinutes = (minutes) => etsyLabelPath({
    ...pathArgs,
    shippingCost: thirdPartyLabelCost,
    extraCost: labelUploadTimeCost(minutes, uploadWage),
    claimRatePercent: thirdPartyClaimRate,
  }).expectedProfit;
  const atZeroMinutes = thirdAtMinutes(0);
  const atTenMinutes = thirdAtMinutes(10);
  const minuteSlope = (atTenMinutes - atZeroMinutes) / 10;
  let breakEvenUploadMinutes = Infinity;
  if (Math.abs(minuteSlope) > 1e-12) {
    const needed = (etsy.rawExpectedProfit - atZeroMinutes) / minuteSlope;
    breakEvenUploadMinutes = needed < -1e-9 ? Infinity : needed;
  }

  const extraKeptOnThird = third.expectedProfitDelta;
  const extraKeptOnPostageOnly = postageOnly.expectedProfitDelta;

  const result = {
    rows,
    etsy,
    third,
    postageOnly,
    winner,
    etsyLabelCost: roundMoney(etsyLabelCost),
    thirdPartyLabelCost: roundMoney(thirdPartyLabelCost),
    etsyClaimRate,
    thirdPartyClaimRate,
    uploadMinutes,
    uploadWage,
    uploadTimeCost: roundMoney(uploadTimeCost),
    feeRefundOnClaim,
    monthlyShipments,
    extraKeptOnThird: roundMoney(extraKeptOnThird),
    extraKeptOnPostageOnly: roundMoney(extraKeptOnPostageOnly),
    monthlyExtraOnThird: roundMoney(extraKeptOnThird * monthlyShipments),
    monthlyExtraOnPostageOnly: roundMoney(extraKeptOnPostageOnly * monthlyShipments),
    breakEvenThirdPartyClaimRate,
    breakEvenThirdPartyLabelCost,
    breakEvenUploadMinutes,
    usedDefaultEtsyLabel: input.etsyLabelCost === undefined
      || input.etsyLabelCost === null
      || input.etsyLabelCost === '',
    usedDefaultThirdPartyLabel: input.thirdPartyLabelCost === undefined
      || input.thirdPartyLabelCost === null
      || input.thirdPartyLabelCost === '',
  };
  result.summary = etsyLabelsNote(result);
  return result;
}

export function etsyLabelsNote(comparison) {
  if (!comparison?.etsy || !comparison?.third || !comparison?.postageOnly) {
    throw new Error('Label comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '−' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const { etsy, third, postageOnly } = comparison;
  const etsyLine = `The ${money(etsy.labelCost)} Etsy label at a ${etsy.claimRatePercent}% item-not-received claim rate expects ${money(etsy.expectedProfit)} after the typed claim mix — a claim on that path leaves ${money(etsy.claimProfit)}.`;
  const thirdGap = money(Math.abs(third.expectedProfit - etsy.expectedProfit));
  const thirdAhead = third.expectedProfit >= etsy.expectedProfit ? 'more' : 'less';
  const timeBit = third.extraCost > 1e-9
    ? ` after ${money(third.extraCost)} of upload time`
    : '';
  const thirdLine = ` A ${money(third.labelCost)} third-party label at a ${third.claimRatePercent}% claim rate${timeBit} expects ${money(third.expectedProfit)} — ${thirdGap} ${thirdAhead}.`;
  const postageGap = money(Math.abs(postageOnly.expectedProfit - etsy.expectedProfit));
  const postageAhead = postageOnly.expectedProfit >= etsy.expectedProfit ? 'more' : 'less';
  const postageLine = ` The same third-party postage with no extra time expects ${money(postageOnly.expectedProfit)} — ${postageGap} ${postageAhead}.`;
  const claimCeil = Number.isFinite(comparison.breakEvenThirdPartyClaimRate)
    ? ` Third-party claims have to stay at about ${comparison.breakEvenThirdPartyClaimRate.toFixed(1)}% before that path matches the Etsy label.`
    : ' No third-party claim rate on these labels can match the Etsy label.';
  const labelCeil = Number.isFinite(comparison.breakEvenThirdPartyLabelCost)
    ? ` The third-party quote has to stay at about ${money(comparison.breakEvenThirdPartyLabelCost)} before it matches the Etsy label.`
    : '';
  return `${etsyLine}${thirdLine}${postageLine}${claimCeil}${labelCeil}`;
}

export function etsyLabelsSummary(comparison) {
  return etsyLabelsNote(comparison);
}
