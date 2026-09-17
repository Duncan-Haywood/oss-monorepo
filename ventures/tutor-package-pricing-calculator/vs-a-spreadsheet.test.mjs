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

// The worked example is the page's central claim -- that a package discounted
// deeper than the no-show rate, with a makeup owed, pays a WORSE effective
// hourly rate than pay-per-session even though its revenue line looks safer.
// Recomputed here against the module the calculator itself runs, rather than
// restated as hand-typed constants, so a change to the shipped arithmetic
// makes this page's claim false (and this test red) instead of merely stale.
test('the worked example matches what the shipped calculator computes', () => {
  const r = comparePricing({
    singleSessionPrice: 60,
    packageSessions: 10,
    packagePrice: 450,
    noShowRate: 10,
    makeupOwed: true,
    sessionMinutes: 60,
    prepMinutes: 15,
    travelMinutes: 0,
    targetHourlyRate: 40,
  });

  assert.equal(r.single.revenue, 540);
  assert.equal(r.single.hours, 11.25);
  assert.equal(r.single.effectiveHourly, 48);

  assert.equal(r.package.revenue, 450);
  assert.equal(r.package.hours, 12.5);
  assert.equal(r.package.effectiveHourly, 36);

  // The reversal the page exists to show: the package looks cheaper on
  // revenue and still pays worse per hour actually worked.
  assert.ok(r.package.revenue < r.single.revenue);
  assert.ok(r.package.effectiveHourly < r.single.effectiveHourly);

  for (const value of ['$540.00', '11.25', '$48.00/hr', '$450.00', '12.50', '$36.00/hr']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});
