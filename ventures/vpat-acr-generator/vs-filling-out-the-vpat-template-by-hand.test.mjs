import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { buildReport, WCAG21_AA_CRITERIA } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-filling-out-the-vpat-template-by-hand.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, compliance, or accessibility-audit advice/i);
});

test('carries the "nothing leaves your browser" notice and the VPAT trademark note', () => {
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /VPAT&reg; is a registered trademark/);
});

test('names no vendor or competing product', () => {
  // This page compares against the manual habit of typing into ITI's own
  // published template, not a named competitor -- distinct from this
  // venture's own vs-hiring-a-vpat-consultant.html, which discusses paid
  // consulting engagements generically but still names no specific firm.
  // Registered as disclaimer-exempt in clauses.mjs on that basis.
  assert.doesNotMatch(html, /accessibe|userway|level access|deque|evinced/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-filling-out-the-vpat-template-by-hand\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('the worked example figures match calc.mjs for the five-gap scenario', () => {
  assert.equal(WCAG21_AA_CRITERIA.length, 50);

  const rows = {};
  WCAG21_AA_CRITERIA.slice(0, 42).forEach((c) => { rows[c.id] = { level: 'supports' }; });
  WCAG21_AA_CRITERIA.slice(42, 47).forEach((c, i) => {
    rows[c.id] = { level: 'partially-supports', remarks: i < 2 ? 'explained' : '' };
  });
  WCAG21_AA_CRITERIA.slice(47, 49).forEach((c, i) => {
    rows[c.id] = { level: 'does-not-support', remarks: i < 1 ? 'explained' : '' };
  });
  rows[WCAG21_AA_CRITERIA[49].id] = { level: 'not-applicable' };

  const report = buildReport({
    productName: 'Acme App',
    reportDate: '',
    evaluationMethods: 'Manual testing',
    rows,
  });

  assert.deepEqual(report.counts, {
    supports: 42,
    'partially-supports': 5,
    'does-not-support': 2,
    'not-applicable': 1,
    'not-evaluated': 0,
  });
  assert.equal(report.issues.length, 5);
  assert.equal(report.issues.filter((i) => i.kind === 'remarks-required').length, 4);
  assert.equal(report.issues.filter((i) => i.kind === 'header-required').length, 1);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-filling-out-the-vpat-template-by-hand\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-filling-out-the-vpat-template-by-hand\.html/);
});

test('the comparison page links back to the calculator and to the procurement guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/why-procurement-rejects-a-vpat\.html"/);
});
