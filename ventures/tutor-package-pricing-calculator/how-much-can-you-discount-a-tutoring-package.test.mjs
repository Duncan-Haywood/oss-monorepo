import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { comparePricing } from './calc.mjs';

const html = fs.readFileSync(new URL('./how-much-can-you-discount-a-tutoring-package.html', import.meta.url), 'utf8');
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
  assert.match(html, /<link rel="canonical" href="\.\/how-much-can-you-discount-a-tutoring-package\.html">/);
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

test('the guide page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/how-much-can-you-discount-a-tutoring-package\.html"/);
});

test('the guide page is listed in the sitemap', () => {
  assert.match(sitemap, /how-much-can-you-discount-a-tutoring-package\.html/);
});

// The central claim -- a discount held at or below the no-show rate still
// costs hourly pay, just not revenue -- is recomputed against the module the
// calculator itself runs, so a change to the shipped arithmetic makes this
// page's claim false (and this test red) instead of merely stale.
test('the steeper-discount worked example matches what the shipped calculator computes', () => {
  const r = comparePricing({
    singleSessionPrice: 60,
    packageSessions: 10,
    packagePrice: 450,
    noShowRate: 10,
    makeupOwed: true,
    sessionMinutes: 60,
  });

  assert.equal(r.single.revenue, 540);
  assert.equal(r.single.hours, 9);
  assert.equal(r.single.effectiveHourly, 60);

  assert.equal(r.package.revenue, 450);
  assert.equal(r.package.hours, 10);
  assert.equal(r.package.effectiveHourly, 45);

  assert.equal(r.revenueDelta, -90);
  assert.equal(r.hourlyDelta, -15);

  for (const value of ['$540.00', '9.00', '$60.00/hr', '$450.00', '10.00', '$45.00/hr', '$90.00', '$15.00']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});

// The page's sharper point: matching the discount to the no-show rate fixes
// revenue but leaves the hourly gap almost untouched.
test('the matched-discount worked example matches what the shipped calculator computes', () => {
  const r = comparePricing({
    singleSessionPrice: 60,
    packageSessions: 10,
    packagePrice: 540,
    noShowRate: 10,
    makeupOwed: true,
    sessionMinutes: 60,
  });

  assert.equal(r.discountPercent, 10);
  assert.equal(r.single.revenue, 540);
  assert.equal(r.single.effectiveHourly, 60);

  assert.equal(r.package.revenue, 540);
  assert.equal(r.package.hours, 10);
  assert.equal(r.package.effectiveHourly, 54);

  assert.equal(r.revenueDelta, 0);
  assert.equal(r.hourlyDelta, -6);
  assert.ok(!r.findings.some((f) => f.id === 'discount-exceeds-noshow-rate'));

  for (const value of ['$54.00/hr', '$6.00']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});
