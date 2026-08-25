import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCuts, optimizeCutList, formatCutPlan, compareStockLengths, formatStockComparison, sameStockLength } from './calc.mjs';

test('expands quantities and sorts cuts', () => assert.deepEqual(parseCuts('12 x 2\n24'), [24, 12, 12]));
test('rejects malformed lines', () => assert.throws(() => parseCuts('twenty four'), /Line 1/));
test('packs cuts with kerf and reports waste', () => {
  const result = optimizeCutList({ stockLength: 60, kerf: 1, cuts: [36, 20, 10] });
  assert.equal(result.bars.length, 2);
  assert.equal(result.totalCuts, 66);
  assert.equal(result.waste, 53);
});
test('rejects a cut longer than stock', () => assert.throws(() => optimizeCutList({ stockLength: 10, kerf: 0, cuts: [11] }), /fit/));
test('rejects an empty cut list', () => assert.throws(() => optimizeCutList({ stockLength: 10, kerf: 0, cuts: [] }), /at least one/));
test('formats a plan for copying into a job ticket', () => {
  const result = optimizeCutList({ stockLength: 60, kerf: 1, cuts: [36, 20, 10] });
  assert.equal(formatCutPlan(result, { stockUnit: 'in', stockLength: 60, kerf: 1 }), 'Cut plan: 2 stock pieces\nStock length: 60.00 in\nKerf per cut: 1.00 in\nRequired material: 66.00 in\nOffcut after kerf allowance: 53.00 in\n\nStock 1: 36.00 + 20.00 in\n  3.00 in remaining after kerf allowance\nStock 2: 10.00 in\n  50.00 in remaining after kerf allowance');
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
