import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSale, compareRegions, feeFor, priceForTargetPayout, REGIONS, BOOST_RATE, BOOST_RATES } from './calc.mjs';

test('US region: 0% selling fee, 3.3% + $0.45 processing on item + shipping', () => {
  const { sellingFee, processingFee, depopFee } = feeFor({ itemPrice: 50, buyerShipping: 5, region: 'us' });
  assert.equal(sellingFee, 0);
  assert.ok(Math.abs(processingFee - (55 * 0.033 + 0.45)) < 1e-9);
  assert.ok(Math.abs(depopFee - processingFee) < 1e-9);
});

test('UK region: 0% selling fee, 2.9% + £0.30 processing on item + shipping', () => {
  const { sellingFee, processingFee } = feeFor({ itemPrice: 40, buyerShipping: 0, region: 'uk' });
  assert.equal(sellingFee, 0);
  assert.ok(Math.abs(processingFee - (40 * 0.029 + 0.30)) < 1e-9);
});

test('rest-of-world region: flat 10% selling fee, no processing fee', () => {
  const { sellingFee, processingFee, depopFee } = feeFor({ itemPrice: 100, buyerShipping: 10, region: 'row' });
  assert.ok(Math.abs(sellingFee - 11) < 1e-9);
  assert.equal(processingFee, 0);
  assert.ok(Math.abs(depopFee - 11) < 1e-9);
});

test('an unrecognised region falls back to US', () => {
  const known = feeFor({ itemPrice: 30, buyerShipping: 0, region: 'us' });
  const fallback = feeFor({ itemPrice: 30, buyerShipping: 0, region: 'not-a-region' });
  assert.deepEqual(fallback, known);
});

test('a boosted sale adds 12% of the item price only, not shipping', () => {
  const plain = feeFor({ itemPrice: 50, buyerShipping: 10, region: 'us', boosted: false });
  const boosted = feeFor({ itemPrice: 50, buyerShipping: 10, region: 'us', boosted: true });
  assert.ok(Math.abs(boosted.boostFee - 50 * (BOOST_RATE / 100)) < 1e-9);
  assert.ok(Math.abs(boosted.depopFee - plain.depopFee - boosted.boostFee) < 1e-9);
});

test('zero item price and zero shipping charges no processing fixed fee', () => {
  const { processingFee } = feeFor({ itemPrice: 0, buyerShipping: 0, region: 'us' });
  assert.equal(processingFee, 0);
});

test('calculateSale rejects a missing item price', () => {
  const result = calculateSale({ itemPrice: '' });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].id, 'itemPrice');
});

test('calculateSale rejects a non-numeric field', () => {
  const result = calculateSale({ itemPrice: 'abc' });
  assert.equal(result.ok, false);
});

test('calculateSale: a plain US sale nets item + shipping minus processing fee minus label', () => {
  const result = calculateSale({ itemPrice: '60', buyerShipping: '0', labelCost: '5', region: 'us' });
  assert.equal(result.ok, true);
  const expectedFee = 60 * 0.033 + 0.45;
  assert.ok(Math.abs(result.payout - (60 - expectedFee - 5)) < 1e-9);
  assert.equal(result.currency, '$');
});

test('calculateSale reports profit relative to item and prep cost', () => {
  const result = calculateSale({ itemPrice: '60', itemCost: '20', otherCost: '2', region: 'us' });
  assert.ok(Math.abs(result.profit - (result.payout - 22)) < 1e-9);
});

test('calculateSale flags a loss with a note', () => {
  const result = calculateSale({ itemPrice: '5', itemCost: '20', region: 'us' });
  assert.ok(result.profit < 0);
  assert.ok(result.notes.some(n => n.includes('loses money')));
});

test('calculateSale always includes the buyer marketplace fee disclosure', () => {
  const result = calculateSale({ itemPrice: '30', region: 'us' });
  assert.ok(result.notes.some(n => n.includes('Marketplace fee')));
});

test('calculateSale notes the rest-of-world flat fee explicitly', () => {
  const result = calculateSale({ itemPrice: '30', region: 'row' });
  assert.ok(result.notes.some(n => n.includes('10% selling fee')));
});

test('priceForTargetPayout solves back to the same payout (US)', () => {
  const target = 41.03;
  const price = priceForTargetPayout(target, { buyerShipping: 4, labelCost: 3, region: 'us' });
  const check = calculateSale({ itemPrice: String(price), buyerShipping: '4', labelCost: '3', region: 'us' });
  assert.ok(Math.abs(check.payout - target) < 1e-6);
});

test('priceForTargetPayout solves back to the same payout (boosted, rest-of-world)', () => {
  const target = 25;
  const price = priceForTargetPayout(target, { buyerShipping: 2, labelCost: 1, region: 'row', boosted: true });
  const check = calculateSale({ itemPrice: String(price), buyerShipping: '2', labelCost: '1', region: 'row', boosted: true });
  assert.ok(Math.abs(check.payout - target) < 1e-6);
});

test('priceForTargetPayout returns null for a non-finite target', () => {
  assert.equal(priceForTargetPayout(NaN, { region: 'us' }), null);
});

test('compareRegions prices the same sale under all three schedules', () => {
  const result = compareRegions({ itemPrice: '80', buyerShipping: '8' });
  assert.equal(result.ok, true);
  assert.equal(Object.keys(result.results).sort().join(','), 'au,row,uk,us');
  assert.ok(['us', 'uk', 'au', 'row'].includes(result.bestRegion));
});

test('compareRegions: US pays more than rest-of-world on an identical mid-size sale', () => {
  const result = compareRegions({ itemPrice: '100', buyerShipping: '0' });
  assert.ok(result.results.us.payout > result.results.row.payout);
});

test('compareRegions surfaces the same errors calculateSale would', () => {
  const result = compareRegions({ itemPrice: 'abc' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test('REGIONS exposes exactly us, uk, au, row with the documented rates', () => {
  assert.deepEqual(Object.keys(REGIONS).sort(), ['au', 'row', 'uk', 'us']);
  assert.equal(REGIONS.us.processingRate, 3.3);
  assert.equal(REGIONS.us.processingFixed, 0.45);
  assert.equal(REGIONS.uk.processingRate, 2.9);
  assert.equal(REGIONS.uk.processingFixed, 0.30);
  assert.equal(REGIONS.row.sellingRate, 10);
});

// Quality round 108 (portfolio/quality/audits/2026-11-26-depop-fee-calculator.json):
// four hand-seeded bugs survived the suite above. Each test below kills one.
test('feeFor charges the fixed processing fee on a shipping-only sale', () => {
  // US: 5 x 3.3% + 0.45 = 0.615
  const { processingFee } = feeFor({ itemPrice: 0, buyerShipping: 5, region: 'us' });
  assert.ok(Math.abs(processingFee - 0.615) < 1e-9);
});

test('effective rate is the fee over item price plus shipping, not item price alone', () => {
  // US $22 + $8: fee 30 x 3.3% + 0.45 = 1.44; 1.44 / 30 = 4.8%
  const result = calculateSale({ itemPrice: '22', buyerShipping: '8', region: 'us' });
  assert.ok(Math.abs(result.effectiveRate - 4.8) < 1e-9);
});

test('priceForTargetPayout returns null when no non-negative price reaches the target', () => {
  // $50 of buyer shipping alone already pays out more than a $0 target.
  assert.equal(priceForTargetPayout(0, { buyerShipping: 50, region: 'us' }), null);
});

test('compareRegions names the region that keeps the most of a $100 sale', () => {
  // US 3.75 fee, UK 3.20 (2.9 + 0.30), AU 2.90 (2.6 + 0.30), rest of world 10.00: AU keeps the most.
  const result = compareRegions({ itemPrice: '100' });
  assert.equal(result.bestRegion, 'au');
});

// Quality fix (portfolio/quality/audits/2026-11-26-depop-fee-calculator.json,
// defects 0, 1 and 6): Australia moved to 0% + processing on 22 July 2026,
// rest-of-world processing is charged but not modelled, boost is 8% outside
// the US and UK, and rest-of-world amounts carry no dollar sign. Expected
// values are recomputed by hand from the rates in README "Sources".
test('Australia: 0% selling fee, 2.6% + A$0.30 processing (A$50 sale -> A$1.60)', () => {
  const result = calculateSale({ itemPrice: '50', region: 'au' });
  assert.equal(result.sellingFee, 0);
  assert.ok(Math.abs(result.depopFee - 1.6) < 1e-9);
  assert.ok(Math.abs(result.payout - 48.4) < 1e-9);
  assert.equal(result.currency, 'A$');
});

test('Australia: processing applies to item plus buyer-paid shipping', () => {
  // (40 + 10) x 2.6% + 0.30 = 1.60
  const { processingFee } = feeFor({ itemPrice: 40, buyerShipping: 10, region: 'au' });
  assert.ok(Math.abs(processingFee - 1.6) < 1e-9);
});

test('rest of world: the note says processing is charged and not included, and no $ sign', () => {
  const result = calculateSale({ itemPrice: '50', region: 'row' });
  assert.equal(result.currency, '');
  assert.ok(result.notes.some(n => /processing fee is NOT included/.test(n)));
  assert.ok(!result.notes.some(n => n.includes('no separate processing fee')));
});

test('boost is 12% in the US and UK and 8% in Australia and elsewhere', () => {
  assert.deepEqual({ ...BOOST_RATES }, { us: 12, uk: 12, au: 8, row: 8 });
  // UK GBP50 boosted: 50 x 12% = 6.00; AU A$50 boosted: 50 x 8% = 4.00; ROW 50: 4.00
  assert.ok(Math.abs(feeFor({ itemPrice: 50, region: 'uk', boosted: true }).boostFee - 6) < 1e-9);
  assert.ok(Math.abs(feeFor({ itemPrice: 50, region: 'au', boosted: true }).boostFee - 4) < 1e-9);
  assert.ok(Math.abs(feeFor({ itemPrice: 50, region: 'row', boosted: true }).boostFee - 4) < 1e-9);
});

test('priceForTargetPayout uses the regional boost rate (Australia, boosted)', () => {
  const price = priceForTargetPayout(30, { buyerShipping: 5, labelCost: 2, region: 'au', boosted: true });
  const check = calculateSale({ itemPrice: String(price), buyerShipping: '5', labelCost: '2', region: 'au', boosted: true });
  assert.ok(Math.abs(check.payout - 30) < 1e-6);
  // by hand: (30 - 5 x 0.974 + 0.30 + 2) / (1 - 0.026 - 0.08) = 27.43 / 0.894
  assert.ok(Math.abs(price - 27.43 / 0.894) < 1e-9);
});

test('compareRegions never names rest of world best: its payout leaves out processing', () => {
  // $1 sale: US fee 0.483, UK 0.329, AU 0.326, ROW 0.10 before its unmodelled processing.
  const result = compareRegions({ itemPrice: '1' });
  assert.ok(result.results.row.payout > result.results.au.payout);
  assert.equal(result.bestRegion, 'au');
});
