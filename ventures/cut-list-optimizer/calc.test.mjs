import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCuts, optimizeCutList, formatCutPlan } from './calc.mjs';

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
