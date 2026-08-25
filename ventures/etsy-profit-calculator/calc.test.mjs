import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrder, priceForMargin, compareFreeShipping } from './calc.mjs';

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

test('moving shipping into the item price is a per-order tie', () => {
  const input = { price: 30, shippingCharged: 5, listingFee: 0.2, transactionRate: 6.5, paymentRate: 3, paymentFixed: 0.25, shippingCost: 6, materialCost: 4 };
  const result = compareFreeShipping(input);
  assert.equal(result.winnerPerOrder, 'tie');
  assert.equal(result.absorbPrice, 35);
  assert.ok(Math.abs(result.raised.profit - result.charged.profit) < 1e-9);
  assert.equal(result.liftPercent, 0);
  assert.equal(result.extraOrdersNeeded, 0);
});

test('cutting the customer total to hit a free-shipping price needs a sales lift', () => {
  const input = {
    price: 32,
    shippingCharged: 6,
    listingFee: 0.2,
    transactionRate: 6.5,
    paymentRate: 3,
    paymentFixed: 0.25,
    shippingCost: 6,
    materialCost: 4,
    freeShipPrice: 35,
    monthlyOrders: 40,
  };
  const result = compareFreeShipping(input);
  assert.equal(result.winnerPerOrder, 'charged');
  assert.equal(result.charged.revenue, 38);
  assert.equal(result.raised.revenue, 35);
  assert.ok(result.perOrderDelta < 0);
  assert.ok(result.liftPercent > 12 && result.liftPercent < 13);
  assert.ok(result.extraOrdersNeeded > 5 && result.extraOrdersNeeded < 5.2);
  assert.equal(result.monthlyCharged, 40 * result.charged.profit);
  assert.equal(result.canWinWithVolume, true);
});

test('keeping the item price and eating the label loses more than raising the price', () => {
  const result = compareFreeShipping({ price: 32, shippingCharged: 6, shippingCost: 6, materialCost: 4, freeShipPrice: 35 });
  assert.ok(result.eatLabel.profit < result.raised.profit);
  assert.ok(result.eatLabelDelta < result.perOrderDelta);
});

test('a losing free-shipping price cannot catch up when it is at or below zero profit', () => {
  const result = compareFreeShipping({
    price: 20,
    shippingCharged: 10,
    listingFee: 0.2,
    transactionRate: 6.5,
    paymentRate: 3,
    paymentFixed: 0.25,
    shippingCost: 12,
    materialCost: 8,
    freeShipPrice: 10,
    monthlyOrders: 20,
  });
  assert.ok(result.raised.profit <= 0);
  assert.equal(result.canWinWithVolume, false);
  assert.equal(result.extraOrdersNeeded, null);
});

test('rejects a negative free-shipping price or monthly order count', () => {
  assert.throws(() => compareFreeShipping({ price: 30, freeShipPrice: -1 }), /Free-shipping item price/);
  assert.throws(() => compareFreeShipping({ price: 30, monthlyOrders: -4 }), /Monthly orders/);
});
