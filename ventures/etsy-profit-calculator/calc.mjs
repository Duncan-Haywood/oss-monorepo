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
