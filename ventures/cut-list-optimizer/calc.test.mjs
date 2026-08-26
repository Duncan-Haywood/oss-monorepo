import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCuts, parseStock, optimizeCutList, formatCutPlan, compareStockLengths, formatStockComparison, sameStockLength } from './calc.mjs';

test('expands quantities and sorts cuts', () => assert.deepEqual(parseCuts('24 x 3\n30'), [30, 24, 24, 24]));
test('rejects malformed lines', () => assert.throws(() => parseCuts('twelve'), /Line 1/));
test('packs cuts with kerf and reports waste', () => {
  const result = optimizeCutList({ stockLength: 60, kerf: 1, cuts: [36, 20, 10] });
  assert.equal(result.bars.length, 2);
  assert.deepEqual(result.bars[0].cuts, [36, 20]);
  assert.equal(result.totalCuts, 66);
});
test('rejects a cut longer than stock', () => assert.throws(() => optimizeCutList({ stockLength: 10, kerf: 0, cuts: [12] }), /fit inside one stock length/));
test('rejects an empty cut list', () => assert.throws(() => optimizeCutList({ stockLength: 10, kerf: 0, cuts: [] }), /at least one/));
test('rejects non-finite stock and kerf values', () => {
  assert.throws(() => optimizeCutList({ stockLength: NaN, kerf: 0, cuts: [24] }), /Stock length.*positive/);
  assert.throws(() => optimizeCutList({ stockLength: Infinity, kerf: 0, cuts: [24] }), /Stock length.*positive/);
  assert.throws(() => optimizeCutList({ stockLength: 60, kerf: NaN, cuts: [24] }), /kerf.*finite/);
  assert.throws(() => optimizeCutList({ stockLength: 60, kerf: Infinity, cuts: [24] }), /kerf.*finite/);
});
test('rejects non-finite required cuts', () => {
  assert.throws(() => optimizeCutList({ stockLength: 60, kerf: 0, cuts: [NaN] }), /fit/);
  assert.throws(() => optimizeCutList({ stockLength: 60, kerf: 0, cuts: [Infinity] }), /fit/);
});
test('formats a plan for copying into a job ticket', () => {
  const result = optimizeCutList({ stockLength: 60, kerf: 1, cuts: [36, 20, 10] });
  assert.equal(formatCutPlan(result, { stockUnit: 'in', stockLength: 60, kerf: 1 }), 'Cut plan: 2 stock pieces\nStock length: 60.00 in\nKerf per cut: 1.00 in\nRequired material: 66.00 in\nOffcut after kerf allowance: 53.00 in\n\nStock 1: 36.00 + 20.00 in\n  3.00 in remaining after kerf allowance\nStock 2: 10.00 in\n  50.00 in remaining after kerf allowance');
});

test('an empty on-hand list is normal, an empty cut list is not', () => {
  assert.deepEqual(parseStock(''), []);
  assert.deepEqual(parseStock(undefined), []);
  assert.deepEqual(parseStock('36 x 2\n22'), [22, 36, 36]);
  assert.throws(() => parseCuts('  \n '), /at least one/);
});

test('on-hand offcuts are consumed before any new stock is bought', () => {
  const result = optimizeCutList({ stockLength: 96, kerf: 0, cuts: [40, 40], onHand: [50, 50] });
  assert.equal(result.purchased, 0);
  assert.equal(result.onHandUsed, 2);
  assert.deepEqual(result.bars.map(bar => bar.source), ['on-hand', 'on-hand']);
  assert.equal(result.purchasesAvoided, 1, 'both cuts would have shared one bought bar');
});

test('the shortest usable offcut is spent first, keeping long pieces whole', () => {
  const result = optimizeCutList({ stockLength: 96, kerf: 0, cuts: [20], onHand: [24, 90] });
  assert.equal(result.bars.length, 1);
  assert.equal(result.bars[0].length, 24);
});

test('an untouched offcut is neither consumed stock nor waste', () => {
  const bought = optimizeCutList({ stockLength: 96, kerf: 0, cuts: [30] });
  const withSpare = optimizeCutList({ stockLength: 96, kerf: 0, cuts: [30], onHand: [40, 80, 80] });
  assert.equal(withSpare.bars.length, 1);
  assert.equal(withSpare.totalStock, 40);
  assert.equal(withSpare.waste, 10);
  assert.equal(bought.waste, 66, 'without the offcut the same cut wastes a whole new bar');
});

test('with no on-hand stock the packing is unchanged and nothing is claimed as avoided', () => {
  const result = optimizeCutList({ stockLength: 60, kerf: 1, cuts: [36, 20, 10] });
  assert.equal(result.purchased, 2);
  assert.equal(result.onHandUsed, 0);
  assert.equal(result.purchasesAvoided, 0);
  assert.equal(result.savings, null);
  assert.equal(result.totalCost, null);
});

test('cost and savings price the plan when a stock price is given', () => {
  const result = optimizeCutList({ stockLength: 96, kerf: 0, cuts: [90, 90, 90], onHand: [92, 92], stockCost: 18 });
  assert.equal(result.purchased, 1);
  assert.equal(result.totalCost, 18);
  assert.equal(result.purchasesAvoided, 2);
  assert.equal(result.savings, 36);
});

test('a cut only an offcut can hold is placed there, and is refused once they are gone', () => {
  const fits = optimizeCutList({ stockLength: 40, kerf: 0, cuts: [50], onHand: [60] });
  assert.equal(fits.bars[0].source, 'on-hand');
  assert.equal(fits.purchasesAvoided, 0, 'no all-new baseline exists to compare against');
  assert.throws(() => optimizeCutList({ stockLength: 40, kerf: 0, cuts: [50, 50], onHand: [60] }), /No on-hand piece is long enough/);
});

test('the ticket export names the on-hand pieces, the buy count, and the money', () => {
  const result = optimizeCutList({ stockLength: 96, kerf: 0, cuts: [90, 90], onHand: [92], stockCost: 18 });
  const plan = formatCutPlan(result, { stockUnit: 'in', stockLength: 96, kerf: 0, currency: '$' });
  assert.match(plan, /From your on-hand stock: 1/);
  assert.match(plan, /To buy: 1/);
  assert.match(plan, /Material cost: \$18\.00/);
  assert.match(plan, /avoided buying 1 piece \(\$18\.00\)/);
  assert.match(plan, /From your rack \(92\.00 in\): 90\.00 in/);
  assert.match(plan, /New piece 1: 90\.00 in/);
});

test('a 1/8 inch kerf is not rounded to 0.13 on the ticket', () => {
  const result = optimizeCutList({ stockLength: 96, kerf: 0.125, cuts: [40, 40] });
  assert.match(formatCutPlan(result, { stockUnit: 'in', kerf: 0.125 }), /Kerf per cut: 0\.125 in/);
  assert.match(formatCutPlan(result, { stockUnit: 'in', kerf: 0.25 }), /Kerf per cut: 0\.25 in/);
  assert.match(formatCutPlan(result, { stockUnit: 'in', kerf: 0 }), /Kerf per cut: 0\.00 in/);
});

test('calculates linear-stock material cost from the pieces bought', () => {
  const result = optimizeCutList({ stockLength: 60, kerf: 1, cuts: [36, 20, 10], stockCost: 12.5 });
  assert.equal(result.totalCost, 25);
  assert.match(formatCutPlan(result, { stockUnit: 'in', stockLength: 60, kerf: 1 }), /Material cost: \$25\.00 \(2 × \$12\.50\)/);
});

test('does not report a cost when no stock price is supplied', () => {
  const result = optimizeCutList({ stockLength: 60, kerf: 1, cuts: [36] });
  assert.equal(result.totalCost, null);
  assert.throws(() => optimizeCutList({ stockLength: 60, kerf: 1, cuts: [36], stockCost: -1 }), /non-negative/);
});

test('treats equal stock lengths as the same sold size', () => {
  assert.equal(sameStockLength(96, 96), true);
  assert.equal(sameStockLength(96, 120), false);
});

test('ranks sold lengths by purchased footage among sizes that fit', () => {
  // Three 30in pieces fit one 8 ft stick (90 < 96) and one 12 ft stick.
  // Same handling; the shorter sold length is the one to buy.
  const comparison = compareStockLengths({
    cuts: parseCuts('30 x 3'),
    kerf: 0,
    unit: 'in',
    current: 96,
  });
  const eight = comparison.rows.find((row) => row.id === '8ft');
  const twelve = comparison.rows.find((row) => row.id === '12ft');
  assert.equal(eight.fits && twelve.fits, true);
  assert.equal(eight.bars, 1);
  assert.equal(twelve.bars, 1);
  assert.ok(eight.buyLength < twelve.buyLength);
  assert.equal(comparison.winner.id, '8ft');
  assert.equal(eight.current, true);
});

test('a length that cannot take the longest cut loses to one that can', () => {
  const comparison = compareStockLengths({
    cuts: parseCuts('110 x 2'),
    kerf: 0,
    unit: 'in',
    current: 96,
  });
  const eight = comparison.rows.find((row) => row.id === '8ft');
  const ten = comparison.rows.find((row) => row.id === '10ft');
  assert.equal(eight.fits, false);
  assert.equal(ten.fits, true);
  assert.equal(comparison.winner.id, '10ft');
});

test('includes a custom current length that is not in the catalog', () => {
  const comparison = compareStockLengths({
    cuts: parseCuts('20 x 2'),
    kerf: 0,
    unit: 'in',
    current: 72,
  });
  const custom = comparison.rows.find((row) => row.id === 'current');
  assert.ok(custom);
  assert.equal(custom.length, 72);
  assert.equal(custom.current, true);
  assert.equal(custom.fits, true);
});

test('formats a stock comparison for a shop note', () => {
  const comparison = compareStockLengths({
    cuts: parseCuts('30 x 3'),
    kerf: 0,
    unit: 'in',
    current: 96,
  });
  const text = formatStockComparison(comparison);
  assert.match(text, /Stock length comparison \(in\)/);
  assert.match(text, /8 ft \(the length on the form\)/);
  assert.match(text, /← buy this/);
  assert.match(text, /does not fit 96\.00 in stock|10 ft/);
});
