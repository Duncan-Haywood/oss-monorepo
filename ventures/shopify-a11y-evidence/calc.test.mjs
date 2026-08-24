import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, reportAsText } from './calc.mjs';

test('summarises axe violations and node counts', () => {
  const report = buildReport({ url: 'https://shop.test', testEngine: { name: 'axe-core' }, violations: [{ id: 'color-contrast', impact: 'serious', help: 'Fix contrast', nodes: [{}, {}] }], passes: [{}], incomplete: [{}, {}] }, '2026-08-24');
  assert.deepEqual(report.counts, { violations: 1, nodes: 2, passes: 1, incomplete: 2 });
  assert.match(reportAsText(report), /color-contrast/);
  assert.match(reportAsText(report), /2026-08-24/);
});

test('accepts a clean result without inventing compliance', () => {
  const report = buildReport({ violations: [] });
  assert.equal(report.counts.violations, 0);
  assert.match(reportAsText(report), /Manual review is still required/);
});
