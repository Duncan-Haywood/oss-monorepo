// Unit tests for lighthouse.mjs's report handling. Lighthouse itself is not a
// repo dependency, so these feed it hand-made reports in its JSON shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, mergeRuns } from './lighthouse.mjs';

function report({ perf = 0.85, fcp = 3300, lcp = 3340, tbt = 20, cls = 0.003, failing = [] } = {}) {
  const audits = {
    'first-contentful-paint': { numericValue: fcp },
    'largest-contentful-paint': { numericValue: lcp },
    'total-blocking-time': { numericValue: tbt },
    'cumulative-layout-shift': { numericValue: cls },
    'color-contrast': { score: failing.includes('color-contrast') ? 0 : 1 },
    'image-alt': { score: null },
  };
  return {
    categories: {
      performance: { score: perf }, accessibility: { score: failing.length ? 0.9 : 1, auditRefs: [
        { id: 'color-contrast', weight: 7 }, { id: 'image-alt', weight: 10 }] },
      'best-practices': { score: 1 }, seo: { score: 1 },
    },
    audits,
  };
}

test('summarize reports FCP and TBT, not just LCP', () => {
  const r = summarize(report({ fcp: 1591.4, tbt: 751.2 }), '/wall-framing-takeoff/');
  assert.equal(r.fcp, 1591);
  assert.equal(r.tbt, 751);
  assert.equal(r.lcp, 3340);
  assert.equal(r.perf, 85);
  assert.equal(r.cls, '0.003');
  assert.deepEqual(r.fails, []);
});

test('summarize lists weighted accessibility audits that fail, skipping not-applicable ones', () => {
  assert.deepEqual(summarize(report({ failing: ['color-contrast'] }), '/x/').fails, ['color-contrast']);
});

test('mergeRuns takes the median of each number and keeps the TBT spread', () => {
  const rows = [
    summarize(report({ perf: 0.81, tbt: 751, fcp: 1591 }), '/p/'),
    summarize(report({ perf: 0.78, tbt: 934, fcp: 1619 }), '/p/'),
    summarize(report({ perf: 0.84, tbt: 605, fcp: 1564, failing: ['color-contrast'] }), '/p/'),
  ];
  const m = mergeRuns(rows);
  assert.equal(m.perf, 81);
  assert.equal(m.tbt, 751);
  assert.equal(m.fcp, 1591);
  assert.equal(m.tbtRange, '605-934');
  assert.equal(m.runs, 3);
  assert.deepEqual(m.fails, ['color-contrast']);
});

test('mergeRuns averages the middle pair for an even count and ignores errored runs', () => {
  const m = mergeRuns([
    summarize(report({ tbt: 100 }), '/p/'), { page: '/p/', error: 'chrome did not start' }, summarize(report({ tbt: 200 }), '/p/'),
  ]);
  assert.equal(m.tbt, 150);
  assert.equal(m.runs, 2);
});

test('mergeRuns passes a lone error through', () => {
  assert.equal(mergeRuns([{ page: '/p/', error: 'boom' }]).error, 'boom');
});

test('longtask.mjs: blocking time counts only the part of each task over 50 ms', async () => {
  const { blocking, median } = await import('./longtask.mjs');
  assert.equal(blocking([[0, 40], [100, 120], [400, 50.5]]), 70.5);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});
