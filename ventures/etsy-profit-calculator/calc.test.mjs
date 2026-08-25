import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrder, priceForMargin } from './calc.mjs';

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
});

test('finds the item price for a target margin', () => {
  const input = { shippingCharged: 5, listingFee: .2, paymentFixed: .25, transactionRate: 6.5, paymentRate: 3, shippingCost: 6, materialCost: 4 };
  const price = priceForMargin(input, 50);
  assert.ok(Math.abs(calculateOrder({ ...input, price }).margin - 50) < 0.000001);
});

test('rejects impossible target margins', () => {
  assert.throws(() => priceForMargin({ transactionRate: 60, paymentRate: 40 }, 1), /not possible/);
});
