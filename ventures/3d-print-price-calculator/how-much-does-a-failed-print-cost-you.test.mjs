import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { calculatePrice, DEFAULTS } from './calc.mjs';

const html = fs.readFileSync(new URL('./how-much-does-a-failed-print-cost-you.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or business advice/);
});

test('carries the best-effort hosting disclaimer', () => {
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/how-much-does-a-failed-print-cost-you\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ text', () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const faq = blocks.map((b) => JSON.parse(b)).find((p) => p['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD');
  assert.ok(faq.mainEntity.length >= 2);
  for (const qa of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${qa.name}</h3>`), `visible question missing: ${qa.name}`);
    assert.ok(html.includes(`<p>${qa.acceptedAnswer.text}</p>`), `visible answer missing for: ${qa.name}`);
  }
});

test('the guide page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/how-much-does-a-failed-print-cost-you\.html"/);
});

test('the guide page is listed in the sitemap', () => {
  assert.match(sitemap, /how-much-does-a-failed-print-cost-you\.html/);
});

test('the guide page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

// The central claim -- a failed print's cost moves onto the price of the
// part that succeeds, not onto the failed part itself -- is recomputed
// against the module the calculator itself runs, so a change to the shipped
// arithmetic makes this page's worked figures false (and this test red)
// instead of merely stale.
test('the low-failure-rate worked example matches what the shipped calculator computes', () => {
  const r = calculatePrice({ ...DEFAULTS, failureRatePercent: 5 });

  assert.equal(Math.round(r.failureMultiplier * 100) / 100, 1.05);
  assert.equal(Math.round(r.failureBufferCost * 100) / 100, 0.07);
  assert.equal(Math.round(r.totalCost * 100) / 100, 5.45);
  assert.equal(Math.round(r.breakEvenPrice * 100) / 100, 5.96);
  assert.equal(Math.round(r.suggestedPrice * 100) / 100, 9.64);

  for (const value of ['1.05', '$0.07', '$5.45', '$5.96', '$9.64']) {
    assert.ok(html.includes(value), `low-failure-rate figure missing from the page: ${value}`);
  }
});

test('the high-failure-rate worked example matches what the shipped calculator computes', () => {
  const r = calculatePrice({ ...DEFAULTS, failureRatePercent: 25 });

  assert.equal(Math.round(r.failureMultiplier * 100) / 100, 1.33);
  assert.equal(Math.round(r.failureBufferCost * 100) / 100, 0.43);
  assert.equal(Math.round(r.totalCost * 100) / 100, 5.81);
  assert.equal(Math.round(r.breakEvenPrice * 100) / 100, 6.35);
  assert.equal(Math.round(r.suggestedPrice * 100) / 100, 10.29);

  for (const value of ['1.33', '$0.43', '$5.81', '$6.35', '$10.29']) {
    assert.ok(html.includes(value), `high-failure-rate figure missing from the page: ${value}`);
  }
});

test('the page-stated delta between the two failure rates matches the calculator', () => {
  const low = calculatePrice({ ...DEFAULTS, failureRatePercent: 5 });
  const high = calculatePrice({ ...DEFAULTS, failureRatePercent: 25 });

  const suggestedPriceDelta = high.suggestedPrice - low.suggestedPrice;
  const failureBufferDelta = high.failureBufferCost - low.failureBufferCost;

  assert.equal(Math.round(suggestedPriceDelta * 100) / 100, 0.64);
  assert.equal(Math.round(failureBufferDelta * 100) / 100, 0.36);

  assert.ok(html.includes('$0.64'), 'suggested-price delta missing from the page');
  assert.ok(html.includes('$0.36'), 'failure-buffer delta missing from the page');
});
