import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrder, priceForMargin, compareOffsiteAdRates, maxAffordableOffsiteRate } from './calc.mjs';

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

test('max affordable offsite rate is zero when the order already loses money', () => {
  const cap = maxAffordableOffsiteRate({
    price: 8, shippingCharged: 0, listingFee: 0.2, transactionRate: 6.5,
    paymentRate: 3, paymentFixed: 0.25, shippingCost: 6, materialCost: 5,
  });
  assert.equal(cap, 0);
});

test('rejects a non-numeric minimum profit for the offsite-ads cap', () => {
  assert.throws(() => maxAffordableOffsiteRate(tightListing, 'nope'), /Minimum profit/);
});
