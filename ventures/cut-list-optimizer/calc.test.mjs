import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCuts, optimizeCutList } from './calc.mjs';

test('expands quantities and sorts cuts', () => assert.deepEqual(parseCuts('12 x 2\n24'), [24, 12, 12]));
test('rejects malformed lines', () => assert.throws(() => parseCuts('twenty four'), /Line 1/));
test('packs cuts with kerf and reports waste', () => {
  const result = optimizeCutList({ stockLength: 60, kerf: 1, cuts: [36, 20, 10] });
  assert.equal(result.bars.length, 2);
  assert.equal(result.totalCuts, 66);
  assert.equal(result.waste, 53);
});
test('rejects a cut longer than stock', () => assert.throws(() => optimizeCutList({ stockLength: 10, kerf: 0, cuts: [11] }), /fit/));
