import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare } from './share.mjs';

test('round-trips the base fields and scenario rows through a share link', () => {
  const input = {
    jobs: '20',
    revenue: '500',
    baseFixed: '0',
    baseVariable: '120',
    scenarios: [['Bulk supplier', 100, 90], ['Subcontractor', 0, 115]],
  };
  const hash = encodeShare(input);
  const decoded = decodeShare(hash);
  assert.equal(decoded.jobs, 20);
  assert.equal(decoded.revenue, 500);
  assert.equal(decoded.baseFixed, 0);
  assert.equal(decoded.baseVariable, 120);
  assert.deepEqual(decoded.scenarios, [['Bulk supplier', 100, 90], ['Subcontractor', 0, 115]]);
});

test('accepts a leading "#" the same as a bare fragment', () => {
  const hash = encodeShare({ jobs: '10', revenue: '1', baseFixed: '1', baseVariable: '1', scenarios: [] });
  assert.deepEqual(decodeShare(`#${hash}`), decodeShare(hash));
});

test('drops a scenario missing a usable fixed or variable cost rather than passing it through broken', () => {
  const decoded = decodeShare(encodeShare({
    scenarios: [['Bad row', 'not-a-number', 90], ['Good row', 100, 90]],
  }));
  assert.deepEqual(decoded.scenarios, [['Good row', 100, 90]]);
});

test('caps scenarios at three, matching the form\'s own limit', () => {
  const decoded = decodeShare(encodeShare({
    scenarios: [['a', 1, 1], ['b', 2, 2], ['c', 3, 3], ['d', 4, 4]],
  }));
  assert.equal(decoded.scenarios.length, 3);
});

test('returns null for garbage input rather than throwing', () => {
  assert.equal(decodeShare(''), null);
  assert.equal(decodeShare(null), null);
  assert.equal(decodeShare('not json'), null);
  assert.equal(decodeShare(encodeURIComponent(JSON.stringify([1, 2, 3]))), null);
  assert.equal(decodeShare(encodeURIComponent(JSON.stringify({ unrelated: 'field' }))), null);
});

test('a negative or non-finite base field is dropped, not carried through as-is', () => {
  const decoded = decodeShare(encodeShare({ jobs: '-5', revenue: 'NaN', baseFixed: '10', baseVariable: '1', scenarios: [] }));
  assert.equal('jobs' in decoded, false);
  assert.equal('revenue' in decoded, false);
  assert.equal(decoded.baseFixed, 10);
});
