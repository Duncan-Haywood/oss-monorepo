import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { calculateReturn, round2 } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-spreadsheet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, accounting, or financial advice/i);
});

test('carries the nothing-leaves-your-browser disclaimer', () => {
  assert.match(html, /<strong>Nothing leaves your browser\.<\/strong>/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-spreadsheet\.html">/);
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

test('the comparison page is linked from the tool page, and so is the previously-orphaned ExpressIFTA page', () => {
  assert.match(indexHtml, /href="\.\/vs-a-spreadsheet\.html"/);
  assert.match(indexHtml, /href="\.\/vs-expressifta\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-spreadsheet\.html/);
});

test('the comparison page links back to the checker', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('the page is clear that nothing is uploaded', () => {
  assert.match(html, /never uploaded/);
});

test('no unverifiable price or vendor claim is made -- this page names no competing product', () => {
  assert.doesNotMatch(html, /affiliated with/i);
});

test('the fleet-MPG worked example matches calc.mjs -- fleet-wide vs per-jurisdiction Indiana', () => {
  const rows = [
    { jurisdiction: 'IL', totalMiles: 8400, taxPaidGallons: 1420, taxRate: 0.627, surchargeRate: 0 },
    { jurisdiction: 'IN', totalMiles: 6150, taxPaidGallons: 380, taxRate: 0.34, surchargeRate: 0.62 },
    { jurisdiction: 'KY', totalMiles: 4820, taxPaidGallons: 910, taxRate: 0.216, surchargeRate: 0.102 },
    { jurisdiction: 'OH', totalMiles: 7310, taxPaidGallons: 1180, taxRate: 0.47, surchargeRate: 0 },
    { jurisdiction: 'MI', totalMiles: 2640, taxPaidGallons: 0, taxRate: 0.313, surchargeRate: 0 },
  ];
  const r = calculateReturn({ rows, interestAnnualPercent: 0, monthsLate: 0 });
  assert.equal(r.mpg, 7.54);
  const indiana = r.lines.find((l) => l.jurisdiction === 'IN');
  assert.equal(indiana.taxableGallons, 815.65);
  assert.equal(indiana.rowTotal, 653.82);
  assert.equal(r.taxDue, -91.53);
  assert.equal(r.surchargeDue, 570.9);
  assert.equal(r.subtotal, 479.37);

  // The "wrong" per-jurisdiction MPG this page claims for Indiana.
  const wrongMpg = round2(6150 / 380);
  assert.equal(wrongMpg, 16.18);
  const wrongTaxableGallons = round2(6150 / wrongMpg);
  assert.equal(wrongTaxableGallons, 380.1);
  const wrongNet = round2(wrongTaxableGallons - 380);
  const wrongTax = round2(wrongNet * 0.34);
  const wrongSurcharge = round2(wrongTaxableGallons * 0.62);
  const wrongTotal = round2(wrongTax + wrongSurcharge);
  assert.equal(wrongTotal, 235.69);
  assert.equal(round2(indiana.rowTotal - wrongTotal), 418.13);

  // The "wrong" surcharge-netted-against-net-gallons total this page claims.
  const wrongIN = round2(indiana.netTaxableGallons * 0.62);
  const kentucky = r.lines.find((l) => l.jurisdiction === 'KY');
  const wrongKY = round2(kentucky.netTaxableGallons * 0.102);
  const wrongSubtotal = round2(r.taxDue + wrongIN + wrongKY);
  assert.equal(wrongSubtotal, 150.95);
  assert.equal(round2(r.subtotal - wrongSubtotal), 328.42);

  for (const figure of ['7.54', '815.65', '$653.82', '16.18', '380.1', '$235.69', '$418.13', '$91.53', '$570.90', '$479.37', '$150.95', '$328.42']) {
    assert.ok(html.includes(figure), `figure ${figure} not found on the page`);
  }
});
