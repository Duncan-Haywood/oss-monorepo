import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY_PRESETS,
  INPUT_IDS,
  applyCategoryPreset,
  calculateSale,
  compareFreeShipping,
  hammerForTarget,
} from './calc.mjs';

const near = (actual, expected, tolerance = 0.0001) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

/** Whatnot's own published US $50 worked example: $4 commission + $1.75 processing = $5.75, $44.25 payout. */
const FIFTY = {
  salePrice: 50,
  shippingCharged: 0,
  taxCharged: 0,
  shippingCost: 0,
  itemCost: 0,
  otherCost: 0,
  commissionRate: 8,
  commissionCap: '',
  paymentRate: 2.9,
  paymentFixed: 0.3,
  lotsPerShow: 1,
  targetLeftover: 0,
};

test('Whatnot’s published $50 example is $4 commission + $1.75 processing', () => {
  const result = calculateSale(FIFTY);
  assert.equal(result.ok, true);
  near(result.commission, 4);
  near(result.processing, 1.75);
  near(result.fees, 5.75);
  near(result.payout, 44.25);
  near(result.takeRateOnHammer, 11.5);
});

test('processing is on checkout total, not just the hammer', () => {
  const result = calculateSale({ ...FIFTY, shippingCharged: 5, taxCharged: 4 });
  assert.equal(result.ok, true);
  near(result.checkoutTotal, 59);
  near(result.commission, 4);
  near(result.processing, 59 * 0.029 + 0.3);
  near(result.processingOnShippingAndTax, 9 * 0.029);
  assert.ok(result.notes.some(note => /shipping and tax/.test(note)));
});

test('a $20 TCG card with $5 buyer-paid shipping is not an 8% fee', () => {
  const result = calculateSale({
    ...FIFTY,
    salePrice: 20,
    shippingCharged: 5,
  });
  assert.equal(result.ok, true);
  near(result.commission, 1.6);
  near(result.processing, 25 * 0.029 + 0.3);
  near(result.fees, 1.6 + 0.725 + 0.3);
  near(result.takeRateOnHammer, (result.fees / 20) * 100);
  assert.ok(result.takeRateOnHammer > 13);
});

test('the $1,500 TCG cap zeros commission on the portion above it', () => {
  const result = calculateSale({
    ...FIFTY,
    salePrice: 2400,
    commissionRate: 8,
    commissionCap: 1500,
  });
  assert.equal(result.ok, true);
  near(result.commission, 1500 * 0.08);
  near(result.commissionOnCappedPortion, 900 * 0.08);
  // Headline 8% of $2,400 would have been $192; the cap keeps $72 of that.
  near(2400 * 0.08 - result.commission, 72);
});

test('a hammer at the cap is commissioned in full', () => {
  const result = calculateSale({ ...FIFTY, salePrice: 1500, commissionCap: 1500 });
  assert.equal(result.ok, true);
  near(result.commission, 120);
  near(result.commissionOnCappedPortion, 0);
});

test('coins preset is 4% with the same $1,500 cap', () => {
  const input = applyCategoryPreset({ ...FIFTY, salePrice: 2000 }, 'coins');
  assert.equal(input.commissionRate, 4);
  assert.equal(input.commissionCap, 1500);
  const result = calculateSale(input);
  near(result.commission, 60);
});

test('unknown preset is an error, not a silent default', () => {
  assert.throws(() => applyCategoryPreset(FIFTY, 'fanatics'), /Unknown category preset/);
});

test('giveaway zeros commission and still charges processing', () => {
  const result = calculateSale({ ...FIFTY, salePrice: 0, shippingCharged: 6, giveaway: true });
  assert.equal(result.ok, true);
  near(result.commission, 0);
  near(result.processing, 6 * 0.029 + 0.3);
  assert.ok(result.notes.some(note => /Giveaway/.test(note)));
});

test('leftover subtracts the label and what the lot cost you', () => {
  const result = calculateSale({
    ...FIFTY,
    itemCost: 18,
    shippingCharged: 5,
    shippingCost: 4.2,
    otherCost: 0.4,
  });
  assert.equal(result.ok, true);
  near(result.leftover, result.payout + 5 - 4.2 - 18 - 0.4);
});

test('a losing lot is flagged, not silently shown as a profit', () => {
  const result = calculateSale({ ...FIFTY, salePrice: 10, itemCost: 12 });
  assert.equal(result.ok, true);
  assert.ok(result.leftover < 0);
  assert.ok(result.notes.some(note => /loses money/.test(note)));
});

test('show leftover multiplies one lot by the show size', () => {
  const result = calculateSale({ ...FIFTY, lotsPerShow: 40, itemCost: 20 });
  assert.equal(result.ok, true);
  near(result.showLeftover, result.leftover * 40);
});

test('hammerForTarget inverts leftover on an uncapped lot', () => {
  const result = calculateSale({ ...FIFTY, itemCost: 20, targetLeftover: 10 });
  const hammer = result.hammerForTarget;
  assert.ok(hammer > 0);
  const check = calculateSale({ ...FIFTY, itemCost: 20, salePrice: hammer, targetLeftover: 10 });
  near(check.leftover, 10, 0.01);
});

test('hammerForTarget respects the $1,500 cap once the hammer crosses it', () => {
  const hammer = hammerForTarget({
    targetLeftover: 1600,
    shippingCharged: 0,
    taxCharged: 0,
    shippingCost: 0,
    itemCost: 0,
    otherCost: 0,
    commissionRate: 8,
    commissionCap: 1500,
    paymentRate: 2.9,
    paymentFixed: 0.3,
  });
  assert.ok(hammer > 1500);
  const check = calculateSale({
    ...FIFTY,
    salePrice: hammer,
    commissionCap: 1500,
    targetLeftover: 1600,
  });
  near(check.leftover, 1600, 0.05);
});

test('compareFreeShipping isolates the processing-on-postage cost', () => {
  const { charged, free, leftoverDelta } = compareFreeShipping({
    ...FIFTY,
    salePrice: 25,
    shippingCharged: 5,
    shippingCost: 5,
    itemCost: 8,
  });
  assert.equal(charged.ok, true);
  assert.equal(free.ok, true);
  assert.equal(free.shippingCharged, 0);
  // Free shipping drops processing on the $5 postage (2.9% of $5) and still pays the $5 label.
  near(leftoverDelta, free.leftover - charged.leftover);
  assert.ok(charged.processing > free.processing);
});

test('blank optional costs are zero, not an error', () => {
  const result = calculateSale({
    salePrice: 50,
    commissionRate: 8,
  });
  assert.equal(result.ok, true);
  near(result.paymentRate, 2.9);
  near(result.paymentFixed, 0.3);
  near(result.shippingCharged, 0);
});

test('a missing sale price is an error on that field', () => {
  const result = calculateSale({ commissionRate: 8 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.id === 'salePrice'));
});

test('combined rates at or above 100% are refused', () => {
  const result = calculateSale({ ...FIFTY, commissionRate: 80, paymentRate: 25 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => /below 100%/.test(error.message)));
});

test('every preset has a rate and a label a form can render', () => {
  for (const preset of Object.values(CATEGORY_PRESETS)) {
    assert.ok(preset.label);
    assert.ok(preset.commissionRate > 0);
    assert.ok(INPUT_IDS.includes('commissionRate'));
    assert.ok(INPUT_IDS.includes('commissionCap'));
  }
});
