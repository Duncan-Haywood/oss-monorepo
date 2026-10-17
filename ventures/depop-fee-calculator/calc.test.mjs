import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSale, compareRegions, feeFor, priceForTargetPayout, REGIONS, BOOST_RATE } from './calc.mjs';

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
  assert.ok(result.notes.some(n => n.includes('flat 10%')));
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
  assert.equal(Object.keys(result.results).sort().join(','), 'row,uk,us');
  assert.ok(['us', 'uk', 'row'].includes(result.bestRegion));
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

test('REGIONS exposes exactly us, uk, row with the documented rates', () => {
  assert.deepEqual(Object.keys(REGIONS).sort(), ['row', 'uk', 'us']);
  assert.equal(REGIONS.us.processingRate, 3.3);
  assert.equal(REGIONS.us.processingFixed, 0.45);
  assert.equal(REGIONS.uk.processingRate, 2.9);
  assert.equal(REGIONS.uk.processingFixed, 0.30);
  assert.equal(REGIONS.row.sellingRate, 10);
});
