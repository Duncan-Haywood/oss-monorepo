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

const RENEWAL_SALES_SCENARIOS = [0, 1, 2, 5, 10, 20];

// Etsy charges the listing fee when the listing is published or auto-renews,
// not once per sale. The order calculator subtracts that fee from every order,
// which overstates cost on a listing that sells more than once and hides the
// fee entirely on a listing that sells nothing. This function keeps the same
// per-order stack, then allocates the listing fee across the sales expected
// in one renewal window. It does not decide whether auto-renew should stay on.
export function calculateListingRenewal(input) {
  const listingFee = Number(input.listingFee ?? 0.2);
  if (!Number.isFinite(listingFee) || listingFee < 0) throw new Error('Listing fee must be a non-negative number');
  const renewalMonths = Number(input.renewalMonths ?? 4);
  if (!Number.isFinite(renewalMonths) || renewalMonths <= 0) throw new Error('Renewal months must be greater than zero');
  const expectedSales = Number(input.expectedSales ?? 0);
  if (!Number.isFinite(expectedSales) || expectedSales < 0) throw new Error('Expected sales must be a non-negative number');

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
