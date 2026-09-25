import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { planCashflow } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-treating-materials-as-cash-out-on-day-one.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/subcontractor-cashflow-planner\/vs-treating-materials-as-cash-out-on-day-one\.html">/);
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

test('the FAQPage JSON-LD answers are verbatim on the page (word for word)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-treating-materials-as-cash-out-on-day-one\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-treating-materials-as-cash-out-on-day-one\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('names no specific spreadsheet, ERP, or accounting product', () => {
  const text = html.replace(/<[^>]+>/g, ' ');
  for (const word of ['QuickBooks', 'Billd', 'Excel', 'Google Sheets']) {
    assert.ok(!text.includes(word), `unexpected specific-product reference: ${word}`);
  }
});

test('adds no third-party script, font, or stylesheet', () => {
  assert.equal(/<script[^>]+src=/i.test(html), false);
  assert.equal(/@import|fonts\.googleapis|cdn\./i.test(html), false);
});

test('the illustrative dollar figures on the page match calc.mjs, not a hand-typed guess', () => {
  const DEFAULTS = {
    invoice: 10000, materials: 2500, weeklyBurn: 700, terms: 30,
    retention: 10, delay: 14, retentionRelease: 60, startingCash: 5000,
  };

  const naive = planCashflow(DEFAULTS);
  assert.equal(naive.cashNeeded, 6900);
  assert.equal(naive.gap, 1900);
  assert.equal(naive.expectedCashDay, 44);

  const net30 = planCashflow({ ...DEFAULTS, supplierTerms: 30 });
  assert.equal(net30.cashNeeded, 6900, 'a net-30 account due before the client pays changes nothing');
  assert.equal(net30.gap, 1900);
  assert.equal(net30.runsShortDay, 30);

  const net45 = planCashflow({ ...DEFAULTS, supplierTerms: 45 });
  assert.equal(net45.cashNeeded, 4400, 'a net-45 account due after the client pays erases the materials line');
  assert.equal(net45.gap, 0);
  assert.equal(net45.runsShortDay, null);

  // Every number quoted on the page, verbatim.
  assert.match(html, /\$6,900/);
  assert.match(html, /\$1,900/);
  assert.match(html, /\$4,400/);
  assert.match(html, /day 44/);
  assert.match(html, /day 30/);
  assert.match(html, /day 45/);
});
