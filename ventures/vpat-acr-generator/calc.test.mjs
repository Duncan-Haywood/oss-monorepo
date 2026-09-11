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

// --- accessibility of the generated form ---------------------------------
//
// Found by `browser_checks.py --checks contrast` on 2026-09-11, the first
// axe run over this venture after it graduated: 100 critical `select-name`
// violations on one page -- every conformance dropdown and every remarks
// field is built in JavaScript and none carried a name. A screen reader
// announced all 100 as "combo box" and nothing else, so the criterion being
// answered was unknowable.
//
// It matters more here than it would anywhere else in the catalogue. This
// product exists to help a vendor document their own accessibility
// conformance for a Section 508 or enterprise procurement response; a tool
// that fails WCAG 4.1.2 Name, Role, Value while collecting a WCAG 4.1.2
// answer is both unusable for part of its own audience and a poor argument
// for itself.
//
// The test reads index.html as text rather than booting a DOM, because the
// defect was a missing attribute on an element built in a loop, and that is
// visible in the source. It is deliberately not a substitute for the axe run
// -- it is the cheap guard that fires in `node --test` in every session,
// where the browser sweep takes 40 minutes and is run rarely.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');

test('every generated form control is given an accessible name', () => {
  // The controls are created in one loop each, so one assertion per control
  // type covers all 50 rows -- and would have caught the original defect.
  assert.match(
    INDEX,
    /select\.setAttribute\(\s*'aria-label'/,
    'the conformance-level select is built without an accessible name; a '
      + 'screen reader announces it as "combo box" with no criterion',
  );
  assert.match(
    INDEX,
    /textarea\.setAttribute\(\s*'aria-label'/,
    'the remarks textarea is built without an accessible name; its '
      + 'placeholder is identical on all 50 rows and disappears once typed in',
  );
});

test('the accessible name identifies which criterion the control belongs to', () => {
  // A constant name on all 50 rows would satisfy axe and still leave the
  // control useless: "Conformance level" x50 says nothing about which one.
  for (const snippet of [
    /aria-label',\s*`Conformance level for \$\{c\.id\} \$\{c\.name\}`/,
    /aria-label',\s*`Remarks and explanations for \$\{c\.id\} \$\{c\.name\}`/,
  ]) {
    assert.match(INDEX, snippet);
  }
});

test('criterion-keyed controls are never looked up with a CSS selector', () => {
  // THE defect this venture shipped with, found by `browser_checks.py
  // --checks sweep` on 2026-09-11:
  //
  //   pageerror: Failed to execute 'querySelector' on 'Document':
  //   '#level-1.1.1' is not a valid selector.
  //
  // `c.id` is a WCAG criterion number ("1.1.1"), so `id="level-1.1.1"` is a
  // legal id attribute but not a legal CSS selector -- the dots parse as
  // class selectors and the leading digit is invalid in an identifier.
  // `querySelector` throws rather than returning null, so `currentInput()`
  // threw on the first row and **every button on the page was dead**. The
  // product was completely non-functional in a browser while passing all 18
  // of its unit tests, because the tests import calc.mjs and never load the
  // page.
  //
  // That is the gap worth naming: this venture's logic was always correct.
  // What shipped broken was the only part a user actually touches.
  for (const m of INDEX.matchAll(/querySelector\(\s*`#\$\{?[^`]*`/g)) {
    assert.fail(
      `index.html builds a CSS selector from an interpolated id: ${m[0]} -- `
        + 'criterion ids contain dots and a leading digit, so this throws a '
        + 'SyntaxError at runtime. Use getElementById.',
    );
  }
  // And the positive half: the lookups exist and use the safe API.
  assert.match(INDEX, /getElementById\(`level-\$\{c\.id\}`\)/);
  assert.match(INDEX, /getElementById\(`remarks-\$\{c\.id\}`\)/);
});

test('the ids this page generates are valid ids but invalid CSS selectors', () => {
  // Asserts the premise rather than restating it, so the test above cannot
  // outlive the reason for it. Uses the platform's own selector parser via
  // the same error `querySelector` raises, without needing a DOM: the CSS
  // identifier grammar forbids an unescaped leading digit and treats an
  // unescaped dot as a class separator.
  const INVALID_CSS_ID = /^#[A-Za-z_-][A-Za-z0-9_-]*$/;
  for (const c of WCAG21_AA_CRITERIA) {
    assert.ok(
      !INVALID_CSS_ID.test(`#level-${c.id}`),
      `#level-${c.id} unexpectedly looks like a valid selector; if criterion `
        + 'ids ever stop containing dots, simplify this guard rather than '
        + 'leaving it asserting something that is no longer true',
    );
  }
});
