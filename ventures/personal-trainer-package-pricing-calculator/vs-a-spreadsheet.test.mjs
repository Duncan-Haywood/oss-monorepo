import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { comparePricing } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-spreadsheet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, or financial advice/i);
});

test('states nothing is uploaded', () => {
  assert.match(html, /<strong>Nothing leaves your browser\.<\/strong>/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-spreadsheet\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ text', () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const faq = blocks.map((b) => JSON.parse(b)).find((p) => p['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD');
  assert.ok(faq.mainEntity.length >= 2);
  for (const qa of faq.mainEntity) {
    assert.ok(html.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(html.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-spreadsheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-spreadsheet\.html/);
});

// The worked example is the page's central claim -- that a package
// discounted deeper than the no-show rate, with makeup owed, AND a flat
// venue fee that erodes the discounted rate more than the full rate,
// together pay a worse net effective hourly rate than pay-per-session.
// Recomputed here against the module the calculator itself runs, rather
// than restated as hand-typed constants, so a change to the shipped
// arithmetic makes this page's claim false (and this test red) instead of
// merely stale.
test('the worked example matches what the shipped calculator computes', () => {
  const r = comparePricing({
    ratePerSession: 75,
    packageSessions: 10,
    packagePrice: 580,
    noShowRate: 10,
    makeupOwed: true,
    sessionMinutes: 60,
    venueModel: 'flat',
    venueFlatFee: 12,
  });

  assert.equal(r.discountPercent, 22.67);
  assert.equal(r.single.gross, 675);
  assert.equal(r.single.net, 567);
  assert.equal(r.single.hours, 9);
  assert.equal(r.single.effectiveHourly, 63);

  assert.equal(r.package.gross, 580);
  assert.equal(r.package.net, 460);
  assert.equal(r.package.hours, 10);
  assert.equal(r.package.effectiveHourly, 46);

  // The reversal the page exists to show: the package looks cheaper on
  // billings and still pays worse net per hour actually worked.
  assert.ok(r.package.net < r.single.net);
  assert.ok(r.package.effectiveHourly < r.single.effectiveHourly);
  assert.ok(r.findings.some((f) => f.id === 'discount-exceeds-noshow-rate'));
  assert.ok(r.findings.some((f) => f.id === 'flat-fee-erodes-package-more'));

  for (const value of ['$675.00', '$580.00', '$108.00', '$120.00', '$567.00', '$460.00', '9.00', '10.00', '$63.00/hr', '$46.00/hr']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});
