// A guide page (deliberately not named vs-*.html -- COMPARISON_FILE_PATTERN
// in platform/pages/build.mjs would then count it as a generic-method
// comparison page, and this venture already carries its one-page budget in
// vs-doing-it-by-hand.html and vs-spreadsheet.html). It explains a distinct
// angle neither of those covers: overtime is a per-workweek calculation,
// not a per-pay-period one, and summing a biweekly period's hours before
// applying the 40-hour threshold gets a different, wrong total.

import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./why-overtime-resets-every-workweek.html', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the guide page carries the no-warranty clause', () => {
  assert.match(html, /No warranty\.<\/strong> This page and the linked calculator apply the federal FLSA 40-hour workweek threshold/);
});

test('the guide page carries the privacy line and is listed in the venture sitemap', () => {
  assert.match(html, /Nothing leaves your browser/);
  assert.match(sitemap, /why-overtime-resets-every-workweek\.html/);
});

test('the guide page is linked from index.html, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/why-overtime-resets-every-workweek\.html"|href="why-overtime-resets-every-workweek\.html"/);
});

test('the guide page links back to the calculator', () => {
  assert.match(html, /href="\.\/"/);
});

test('the guide page is indexable and describes itself for a crawler', () => {
  assert.match(html, /<meta name="robots" content="index,follow">/);
  assert.match(html, /<meta name="description" content="[^"]{80,}">/);
  assert.match(html, /<title>[^<]+<\/title>/);
});

test('the guide page carries valid FAQPage JSON-LD matching its visible text', () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const parsed = blocks.map((b) => JSON.parse(b));
  const faq = parsed.find((p) => p['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD');
  assert.ok(faq.mainEntity.length >= 3);
  for (const qa of faq.mainEntity) {
    assert.ok(html.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(html.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

test('the guide page states the federal-only caveat', () => {
  assert.match(html, /federal FLSA/);
});

// The central claim -- summing a biweekly period's hours before applying
// the 40-hour threshold gets a different total than applying the threshold
// to each workweek separately -- is recomputed against the module the
// calculator itself runs, so a change to the shipped arithmetic makes this
// page's worked figures fail rather than merely go stale.
test('the worked example matches what the shipped calculator computes, both ways', async () => {
  const { computeSingleRateOvertime } = await import('./calc.mjs');

  const week1 = computeSingleRateOvertime({ hourlyRate: 20, hoursWorked: 35 });
  const week2 = computeSingleRateOvertime({ hourlyRate: 20, hoursWorked: 45 });
  const correctTotal = Math.round((week1.totalPay + week2.totalPay + Number.EPSILON) * 100) / 100;

  assert.equal(week1.totalPay, 700);
  assert.equal(week2.overtimeHours, 5);
  assert.equal(week2.totalPay, 950);
  assert.equal(correctTotal, 1650);

  const naive = computeSingleRateOvertime({ hourlyRate: 20, hoursWorked: 35 + 45 });
  assert.equal(naive.overtimeHours, 40);
  assert.equal(naive.totalPay, 2000);

  const overpayment = Math.round((naive.totalPay - correctTotal + Number.EPSILON) * 100) / 100;
  assert.equal(overpayment, 350);

  for (const value of ['$700.00', '$950.00', '$1,650.00', '$2,000.00', '$350.00']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});
