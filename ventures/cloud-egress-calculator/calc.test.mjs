import test from 'node:test';
import assert from 'node:assert/strict';
import { scenarioCost, compareScenarios } from './calc.mjs';

test('calculates storage, request, and egress charges', () => {
  const result = scenarioCost({ storageGb: 500, requestsMillion: 2, egressGb: 100, storageRate: .02, requestRate: .4, egressRate: .01 });
  assert.deepEqual(result, { storage: 10, requests: .8, egress: 1, total: 11.8 });
});

test('compares scenarios and reports savings', () => {
  const result = compareScenarios({
    first: { storageGb: 1000, egressGb: 500, storageRate: .023, egressRate: .09 },
    second: { storageGb: 1000, egressGb: 500, storageRate: .006, egressRate: 0 },
  });
  assert.equal(result.cheaper, 'second');
  assert.equal(result.savings, 62);
});

test('rejects invalid inputs', () => {
  assert.throws(() => scenarioCost({ storageGb: -1 }), /Storage/);
  assert.throws(() => scenarioCost({ storageGb: 'unknown' }), /Storage/);
  assert.throws(() => scenarioCost({ storageGb: Number.NaN }), /Storage/);
  assert.throws(() => scenarioCost({ storageGb: Infinity }), /Storage/);
});

test('defaults optional usage dimensions to zero', () => {
  assert.deepEqual(scenarioCost({ storageGb: 10, storageRate: .02 }), {
    storage: .2, requests: 0, egress: 0, total: .2,
  });
});
