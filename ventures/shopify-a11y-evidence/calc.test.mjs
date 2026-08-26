import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReport,
  reportAsText,
  compareReports,
  comparisonAsText,
  countByImpact,
  formatImpact,
} from './calc.mjs';

const beforeInput = {
  url: 'https://shop.test',
  testEngine: { name: 'axe-core', version: '4.10.0' },
  violations: [
    {
      id: 'color-contrast',
      impact: 'serious',
      help: 'Fix contrast',
      tags: ['wcag2aa', 'wcag143'],
      nodes: [{}, {}],
    },
    { id: 'image-alt', impact: 'critical', help: 'Add alt text', nodes: [{}] },
    { id: 'label', impact: 'serious', help: 'Label the field', nodes: [{}] },
  ],
  passes: [{}],
  incomplete: [{ id: 'aria-allowed-attr', impact: 'moderate', nodes: [{}] }],
};

const afterInput = {
  url: 'https://shop.test',
  testEngine: { name: 'axe-core', version: '4.10.0' },
  violations: [
    {
      id: 'color-contrast',
      impact: 'serious',
      help: 'Fix contrast',
      tags: ['wcag2aa', 'wcag143'],
      nodes: [{}],
    },
    { id: 'button-name', impact: 'critical', help: 'Name the button', nodes: [{}] },
  ],
  passes: [{}, {}, {}],
  incomplete: [],
};

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

test('keeps incomplete checks in the handoff record', () => {
  const report = buildReport({ incomplete: [{ id: 'aria-allowed-attr', impact: 'moderate', nodes: [{}] }] }, '2026-08-24');
  assert.equal(report.reviewItems[0].id, 'aria-allowed-attr');
  assert.match(reportAsText(report), /Items needing manual review/);
  assert.match(reportAsText(report), /aria-allowed-attr/);
});

test('rejects non-object paste', () => {
  assert.throws(() => buildReport(null), /valid axe-core JSON/);
  assert.throws(() => buildReport('nope'), /valid axe-core JSON/);
});

test('compareReports splits resolved, remaining, and new rules', () => {
  const before = buildReport(beforeInput, '2026-07-01');
  const after = buildReport(afterInput, '2026-08-25');
  const comparison = compareReports(before, after);
  assert.deepEqual(comparison.resolved.map((item) => item.id).sort(), ['image-alt', 'label']);
  assert.equal(comparison.remaining[0].id, 'color-contrast');
  assert.equal(comparison.remaining[0].beforeNodes, 2);
  assert.equal(comparison.remaining[0].nodeDelta, -1);
  assert.deepEqual(comparison.introduced.map((item) => item.id), ['button-name']);
  assert.equal(comparison.counts.nodeDelta, -2);
  const text = comparisonAsText(comparison);
  assert.match(text, /Resolved: 2/);
  assert.match(text, /New: 1/);
  assert.match(text, /2 fewer affected nodes/);
  assert.match(text, /2 → 1 nodes/);
  assert.match(text, /not a compliance determination/);
});

test('compareReports treats an unchanged pair as remaining only', () => {
  const report = buildReport(afterInput, '2026-08-25');
  const comparison = compareReports(report, report);
  assert.equal(comparison.counts.resolved, 0);
  assert.equal(comparison.counts.introduced, 0);
  assert.equal(comparison.counts.remaining, 2);
  assert.equal(comparison.counts.nodeDelta, 0);
  assert.match(comparisonAsText(comparison), /affected node count is unchanged/);
});

test('compareReports requires both records', () => {
  assert.throws(() => compareReports(null, buildReport(afterInput)), /before scan and an after scan/);
});

test('countByImpact and formatImpact stay readable', () => {
  assert.equal(formatImpact(countByImpact([])), 'none');
  assert.equal(
    formatImpact({ critical: 1, serious: 2, moderate: 0, minor: 0, unknown: 1 }),
    '1 critical, 2 serious, 1 unknown',
  );
});
