import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WCAG21_AA_CRITERIA,
  CONFORMANCE_LEVELS,
  buildReport,
  reportAsText,
  isDraftEmpty,
} from './calc.mjs';

test('WCAG21_AA_CRITERIA has the full 50-criterion WCAG 2.1 A/AA set, no duplicates', () => {
  assert.equal(WCAG21_AA_CRITERIA.length, 50);
  const ids = WCAG21_AA_CRITERIA.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate criterion ids');
  for (const c of WCAG21_AA_CRITERIA) {
    assert.match(c.id, /^\d\.\d{1,2}\.\d{1,2}$/);
    assert.ok(['A', 'AA'].includes(c.wcagLevel), `${c.id} must be Level A or AA`);
    assert.ok(c.name.length > 0);
  }
});

test('CONFORMANCE_LEVELS has exactly the four standard VPAT values plus Not Evaluated', () => {
  const ids = CONFORMANCE_LEVELS.map((l) => l.id);
  assert.deepEqual(ids, ['supports', 'partially-supports', 'does-not-support', 'not-applicable', 'not-evaluated']);
});

test('buildReport defaults every unanswered criterion to not-evaluated, not dropped', () => {
  const report = buildReport({});
  assert.equal(report.criteria.length, 50);
  assert.equal(report.counts['not-evaluated'], 50);
  assert.equal(report.evaluatedCount, 0);
});

test('buildReport records a supplied level and remarks verbatim', () => {
  const report = buildReport({
    rows: { '1.1.1': { level: 'supports', remarks: 'All images carry descriptive alt text.' } },
  });
  const row = report.criteria.find((c) => c.id === '1.1.1');
  assert.equal(row.level, 'supports');
  assert.equal(row.levelLabel, 'Supports');
  assert.equal(row.remarks, 'All images carry descriptive alt text.');
  assert.equal(report.counts.supports, 1);
  assert.equal(report.evaluatedCount, 1);
});

test('buildReport rejects an out-of-vocabulary level rather than trusting stale/pasted data', () => {
  const report = buildReport({ rows: { '1.1.1': { level: 'mostly-fine', remarks: 'x' } } });
  const row = report.criteria.find((c) => c.id === '1.1.1');
  assert.equal(row.level, 'not-evaluated', 'an invalid level id falls back to the honest default');
});

test('buildReport flags a Partially Supports row with empty remarks', () => {
  const report = buildReport({ rows: { '1.4.3': { level: 'partially-supports', remarks: '' } } });
  const issue = report.issues.find((i) => i.criterionId === '1.4.3');
  assert.ok(issue, 'expected a remarks-required issue for 1.4.3');
  assert.equal(issue.kind, 'remarks-required');
});

test('buildReport flags a Does Not Support row with only whitespace remarks', () => {
  const report = buildReport({ rows: { '2.1.1': { level: 'does-not-support', remarks: '   ' } } });
  const issue = report.issues.find((i) => i.criterionId === '2.1.1');
  assert.ok(issue, 'whitespace-only remarks must not count as present');
});

test('buildReport does not require remarks on Supports, Not Applicable, or Not Evaluated rows', () => {
  const report = buildReport({
    rows: {
      '1.1.1': { level: 'supports', remarks: '' },
      '1.2.4': { level: 'not-applicable', remarks: '' },
      '2.1.1': { level: 'not-evaluated', remarks: '' },
    },
  });
  const flagged = report.issues.map((i) => i.criterionId);
  assert.ok(!flagged.includes('1.1.1'));
  assert.ok(!flagged.includes('1.2.4'));
  assert.ok(!flagged.includes('2.1.1'));
});

test('buildReport flags missing required header fields by name', () => {
  const report = buildReport({});
  const messages = report.issues.filter((i) => i.kind === 'header-required').map((i) => i.message);
  assert.ok(messages.some((m) => m.startsWith('Product name')));
  assert.ok(messages.some((m) => m.startsWith('Report date')));
  assert.ok(messages.some((m) => m.startsWith('Evaluation methods used')));
});

test('buildReport does not flag header fields once supplied', () => {
  const report = buildReport({
    productName: 'Widgetizer',
    reportDate: '2026-09-11',
    evaluationMethods: 'Manual keyboard and screen reader testing (NVDA, VoiceOver) plus automated axe-core scan.',
  });
  const headerIssues = report.issues.filter((i) => i.kind === 'header-required');
  assert.equal(headerIssues.length, 0);
});

test('vendorCompany and vendorContact are not required header fields (Not Applicable is a legitimate answer for some vendors)', () => {
  const report = buildReport({
    productName: 'Widgetizer',
    reportDate: '2026-09-11',
    evaluationMethods: 'Manual review',
  });
  assert.ok(!report.issues.some((i) => i.message.startsWith('Vendor company')));
});

test('isDraftEmpty is true for a fresh report and false once anything is entered', () => {
  assert.equal(isDraftEmpty(buildReport({})), true);
  assert.equal(isDraftEmpty(buildReport({ rows: { '1.1.1': { level: 'supports' } } })), false);
  assert.equal(isDraftEmpty(buildReport({ rows: { '1.1.1': { remarks: 'noted' } } })), false);
});

test('reportAsText names the format, states the self-assessment disclaimer, and lists every criterion', () => {
  const report = buildReport({
    productName: 'Widgetizer',
    productVersion: '4.2',
    reportDate: '2026-09-11',
    vendorCompany: 'Example Corp',
    evaluationMethods: 'Manual + automated testing',
    rows: { '1.1.1': { level: 'supports', remarks: 'Alt text present throughout.' } },
  });
  const text = reportAsText(report);
  assert.match(text, /VPAT.{0,5}2\.5/);
  assert.match(text, /Widgetizer/);
  assert.match(text, /4\.2/);
  assert.match(text, /1\.1\.1 Non-text Content \(WCAG Level A\) -- Supports/);
  assert.match(text, /Alt text present throughout\./);
  assert.match(text, /not an independent audit/i);
  assert.match(text, /vendor named above is responsible/i);
  // Every one of the 50 criterion ids must appear, in order, so nothing was
  // silently dropped from the printed document.
  for (const c of WCAG21_AA_CRITERIA) {
    assert.match(text, new RegExp(c.id.replace(/\./g, '\\.') + ' '));
  }
});

test('reportAsText reports zero completeness issues once the form is fully answered with remarks where required', () => {
  const rows = {};
  for (const c of WCAG21_AA_CRITERIA) rows[c.id] = { level: 'supports', remarks: '' };
  const report = buildReport({
    productName: 'Widgetizer',
    reportDate: '2026-09-11',
    evaluationMethods: 'Manual + automated testing',
    rows,
  });
  const text = reportAsText(report);
  assert.match(text, /No completeness issues found/);
});

test('reportAsText surfaces a nonzero issue count for an incomplete report', () => {
  const report = buildReport({ rows: { '1.4.3': { level: 'partially-supports', remarks: '' } } });
  const text = reportAsText(report);
  assert.match(text, /completeness issue\(s\) before this is submission-ready/);
  assert.match(text, /1\.4\.3 Contrast \(Minimum\)/);
});
