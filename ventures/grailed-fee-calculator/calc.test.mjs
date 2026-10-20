import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSale,
  compareSchedules,
  cliffFor,
  commissionFor,
  feeFor,
  priceForTargetPayout,
  SCHEDULES,
  TIER_THRESHOLD,
  MIN_COMMISSION,
} from './calc.mjs';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} vs ${b}`);

test('a $100 domestic sale: 6% commission + 3.49% + $0.49 processing', () => {
  const { commission, processingFee, grailedFee } = feeFor({ itemPrice: 100 });
  near(commission, 6);
  near(processingFee, 100 * 0.0349 + 0.49);
  near(grailedFee, commission + processingFee);
});

test('a $200 sale is the 9% tier, matching the published $174.53 worked example', () => {
  const r = calculateSale({ itemPrice: 200 });
  near(r.commission, 18);
  assert.equal(r.payout.toFixed(2), '174.53');
});

test('the minimum commission applies to a small sale', () => {
  near(commissionFor(10), MIN_COMMISSION);
  near(commissionFor(33.17), 33.17 * 0.06 > MIN_COMMISSION ? 33.17 * 0.06 : MIN_COMMISSION);
  near(commissionFor(50), 3);
});

test('the tier is a step: the whole sale moves to 9% at $120', () => {
  near(commissionFor(TIER_THRESHOLD - 0.01), (TIER_THRESHOLD - 0.01) * 0.06);
  near(commissionFor(TIER_THRESHOLD), TIER_THRESHOLD * 0.09);
});

test('buyer-paid shipping counts toward both the tier and the processing base', () => {
  // $100 item + $25 shipping crosses $120 even though the item alone is under it.
  const withShip = feeFor({ itemPrice: 100, buyerShipping: 25 });
  near(withShip.commission, 125 * 0.09);
  near(withShip.processingFee, 125 * 0.0349 + 0.49);
});

test('legacy schedule is a flat 9% with no minimum', () => {
  near(feeFor({ itemPrice: 50, schedule: 'legacy' }).commission, 4.5);
  near(feeFor({ itemPrice: 10, schedule: 'legacy' }).commission, 0.9);
});

test('international buyer raises processing to 4.99% + $0.49 and leaves commission alone', () => {
  const dom = feeFor({ itemPrice: 100, schedule: 'us' });
  const intl = feeFor({ itemPrice: 100, schedule: 'intl' });
  near(intl.commission, dom.commission);
  near(intl.processingFee, 100 * 0.0499 + 0.49);
});

test('an unknown schedule falls back to the current domestic one', () => {
  assert.deepEqual(feeFor({ itemPrice: 80, schedule: 'x' }), feeFor({ itemPrice: 80, schedule: 'us' }));
});

test('a zero sale charges nothing, not a lone $0.49', () => {
  assert.equal(feeFor({ itemPrice: 0 }).grailedFee, 0);
});

test('the cliff: $120 pays less than $119.99, and about $124.10 pays the same', () => {
  const below = calculateSale({ itemPrice: 119.99 });
  const at = calculateSale({ itemPrice: 120 });
  assert.ok(at.payout < below.payout);
  const cliff = cliffFor();
  near(cliff.payoutBelow, below.payout);
  near(cliff.payoutAt, at.payout);
  assert.equal(cliff.recoverPrice.toFixed(2), '124.10');
  near(calculateSale({ itemPrice: cliff.recoverPrice }).payout, below.payout);
  near(cliff.loss, below.payout - at.payout);
});

test('the cliff moves down by the shipping you collect, and the payout gap is unchanged', () => {
  const plain = cliffFor();
  const shipped = cliffFor({ buyerShipping: 12 });
  near(shipped.priceBelow, plain.priceBelow - 12);
  near(shipped.loss, plain.loss + 0 * 12, 'loss in dollars differs only through the processing base');
});

test('no cliff on the flat schedule, or when shipping alone clears $120', () => {
  assert.equal(cliffFor({ schedule: 'legacy' }), null);
  assert.equal(cliffFor({ buyerShipping: 125 }), null);
});

test('priceForTargetPayout inverts the payout in every regime', () => {
  for (const price of [20, 45, 80, 119.99, 125, 190, 400]) {
    const payout = calculateSale({ itemPrice: price, buyerShipping: 0, labelCost: 7 }).payout;
    const solved = priceForTargetPayout(payout, { labelCost: 7 });
    // The smallest qualifying price can be lower than `price` only inside the
    // dead zone above $120, where it must still net at least `payout`.
    assert.ok(solved <= price + 1e-9, `${price}: solved ${solved}`);
    assert.ok(calculateSale({ itemPrice: solved, labelCost: 7 }).payout >= payout - 1e-9, `${price} not reached`);
  }
});

test('a target inside the dead zone is reached below $120, not above it', () => {
  // $106 payout sits between the $120 payout ($104.52) and the $119.99 one ($108.11).
  const price = priceForTargetPayout(106);
  assert.ok(price < TIER_THRESHOLD, `got ${price}`);
  assert.ok(calculateSale({ itemPrice: price }).payout >= 106 - 1e-9);
});

test('a target above the dead zone is solved on the 9% side', () => {
  const price = priceForTargetPayout(150);
  assert.ok(price >= TIER_THRESHOLD);
  near(calculateSale({ itemPrice: price }).payout, 150);
});

test('profit and the target price use item cost and prep cost', () => {
  const r = calculateSale({ itemPrice: 150, labelCost: 9, itemCost: 60, otherCost: 2, targetProfit: 60 });
  near(r.profit, r.payout - 62);
  near(calculateSale({ itemPrice: r.priceForTarget, labelCost: 9, itemCost: 60, otherCost: 2 }).profit, 60);
});

test('required and malformed fields are reported, not guessed', () => {
  const missing = calculateSale({ itemPrice: '' });
  assert.equal(missing.ok, false);
  assert.equal(missing.errors[0].id, 'itemPrice');
  const bad = calculateSale({ itemPrice: 50, itemCost: -4, labelCost: 'abc' });
  assert.deepEqual(bad.errors.map(e => e.id).sort(), ['itemCost', 'labelCost']);
});

test('notes flag the step, the minimum, and the flat legacy view', () => {
  assert.ok(calculateSale({ itemPrice: 121 }).notes.some(n => /over the \$120 step/.test(n)));
  assert.ok(calculateSale({ itemPrice: 15 }).notes.some(n => /minimum/.test(n)));
  assert.ok(calculateSale({ itemPrice: 50, schedule: 'legacy' }).notes.some(n => /old flat 9%/.test(n)));
});

test('compareSchedules prices all three and names the best payout', () => {
  const c = compareSchedules({ itemPrice: 80 });
  assert.deepEqual(Object.keys(c.results), Object.keys(SCHEDULES));
  assert.equal(c.bestSchedule, 'us');
  // Under $120 the tiered commission beats the old flat 9%.
  assert.ok(c.results.us.payout > c.results.legacy.payout);
  // At $200 they agree.
  const high = compareSchedules({ itemPrice: 200 });
  near(high.results.us.payout, high.results.legacy.payout);
});

test('compareSchedules passes validation errors through', () => {
  assert.equal(compareSchedules({ itemPrice: '' }).ok, false);
});
