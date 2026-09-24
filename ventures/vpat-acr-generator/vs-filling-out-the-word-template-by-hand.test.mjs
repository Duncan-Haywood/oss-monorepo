import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-filling-out-the-word-template-by-hand.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty clause and disclaims liability', () => {
  assert.match(html, /No warranty\./);
  assert.match(html, /accept no liability/);
});

test('carries the ITI trademark notice', () => {
  assert.match(html, /Information Technology Industry Council/);
  assert.match(html, /not affiliated with/i);
});

test('says the generator never assesses the product', () => {
  assert.match(html, /does not (test|scan)|never (scans|selects|decides|picks)|does not scan/i);
});

// This page compares against a generic method (ITI's own Word template),
// not a named competitor product or consultancy, so it names no company and
// is exempt from the trademark-comparison disclaimer clauses.mjs otherwise
// requires -- unlike vs-hiring-a-vpat-consultant.html, which names a paid
// service category but still names no specific firm.
test('names no competitor product or consultancy', () => {
  assert.doesNotMatch(html, /UsableNet|Level Access|Deque|TPGi|Bureau of Internet Accessibility/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-filling-out-the-word-template-by-hand\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/"@type":"FAQPage","mainEntity":\[([\s\S]*?)\]}<\/script>/);
  assert.ok(match, 'no FAQPage schema found');
  const names = [...match[1].matchAll(/"@type":"Question","name":"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(names.length >= 5, `expected several questions, got ${names.length}`);
  for (const name of names) {
    assert.ok(html.includes(`<h3>${name}</h3>`), `FAQ schema question "${name}" has no matching <h3> on the page`);
  }
});

test('the comparison page is linked from the tool page, and links back to it', () => {
  assert.match(indexHtml, /href="\.\/vs-filling-out-the-word-template-by-hand\.html"/);
  assert.match(html, /href="\.\/">/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-filling-out-the-word-template-by-hand\.html/);
});

// The worked example is this page's factual claim about the generator's own
// completeness rules -- if calc.mjs's criteria set or issue rules ever
// change, this page's numbers must be re-derived, not left stale.
test('the worked example matches buildReport run against the same scenario', async () => {
  const { buildReport, WCAG21_AA_CRITERIA } = await import('./calc.mjs');

  const rows = {};
  WCAG21_AA_CRITERIA.forEach((c, i) => {
    if (i < 40) rows[c.id] = { level: 'supports', remarks: '' };
  });
  rows['1.4.3'] = { level: 'partially-supports', remarks: '' };
  rows['2.4.7'] = { level: 'does-not-support', remarks: '' };
  rows['3.3.1'] = { level: 'partially-supports', remarks: '' };

  const report = buildReport({
    productName: 'Acme Reporting Suite',
    productVersion: '4.2',
    reportDate: '',
    vendorCompany: 'Acme Corp',
    vendorContact: 'access@acme.example',
    evaluationMethods: '',
    rows,
  });

  assert.equal(report.totalCriteria, 50);
  assert.equal(report.issues.length, 5);
  assert.equal(report.evaluatedCount, 41);
  assert.equal(report.counts['not-evaluated'], 9);

  const issueIds = report.issues.map((i) => i.criterionId).filter(Boolean);
  assert.deepEqual(issueIds.sort(), ['1.4.3', '2.4.7', '3.3.1'].sort());
  assert.ok(report.issues.some((i) => i.kind === 'header-required' && i.message.includes('Report date')));
  assert.ok(report.issues.some((i) => i.kind === 'header-required' && i.message.includes('Evaluation methods')));

  assert.match(html, /1\.4\.3 Contrast \(Minimum\): marked "Partially Supports" with no remarks/);
  assert.match(html, /2\.4\.7 Focus Visible: marked "Does Not Support" with no remarks/);
  assert.match(html, /3\.3\.1 Error Identification: marked "Partially Supports" with no remarks/);
  assert.match(html, /Report Date is blank/);
  assert.match(html, /Evaluation Methods Used is blank/);
  assert.match(html, /5 completeness issues/);
  assert.match(html, /41 of 50 criteria evaluated, 9 still "Not Evaluated"/);
});

test('pins the criteria total the page states in prose', async () => {
  const { WCAG21_AA_CRITERIA } = await import('./calc.mjs');
  assert.equal(WCAG21_AA_CRITERIA.length, 50);
  assert.match(html, /50 WCAG 2\.1/);
});
