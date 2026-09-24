// A guide page (deliberately not named vs-*.html -- COMPARISON_FILE_PATTERN
// in platform/pages/build.mjs would then count it as a comparison page, and
// this venture already carries a generic-method page in vs-flat-day-rate.html
// and a named-product one in vs-honeybook.html). vs-flat-day-rate.html
// mentions the scheduling check in one FAQ answer; this page gives it a full
// worked example, the same depth-vs-mention split as the merged
// 3d-print-price-calculator guide page relative to its own vs-* sibling.

import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./why-a-priced-booking-can-still-be-impossible.html', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the guide page carries the no-warranty clause', () => {
  assert.match(html, /No warranty\.<\/strong> This page and the linked calculator produce planning estimates/);
});

test('the guide page frames the difference as a different check, never as a fault', () => {
  for (const word of ['scam', 'ripoff', 'rip-off', 'overpriced', 'useless', 'broken']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(html), `the guide page uses "${word}"`);
  }
});

test('the guide page carries the privacy line and is listed in the venture sitemap', () => {
  assert.match(html, /Nothing leaves your browser/);
  assert.match(sitemap, /why-a-priced-booking-can-still-be-impossible\.html/);
});

test('the guide page is linked from index.html, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/why-a-priced-booking-can-still-be-impossible\.html"|href="why-a-priced-booking-can-still-be-impossible\.html"/);
});

test('the guide page links back to the calculator', () => {
  assert.match(html, /href="\.\/"/, 'no link back to the calculator');
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

// The central claim -- a booking that clears its revenue minimum by a wide
// margin can still need more artists than are booked -- is recomputed
// against the module the calculator itself runs, so a change to the
// shipped scheduling arithmetic makes this page's worked figures fail
// rather than merely go stale.
test('the worked example matches what the shipped calculator computes', async () => {
  const { calculateQuote, DEFAULTS } = await import('./calc.mjs');

  const r = calculateQuote({
    ...DEFAULTS,
    brideCount: 1,
    fullServiceCount: 6,
    hairOnlyCount: 0,
    makeupOnlyCount: 0,
    kidsCount: 0,
    artistsBooked: 1,
  });

  assert.equal(r.totalHeadcount, 7);
  assert.equal(r.serviceRevenue, 1125);
  assert.equal(r.belowRevenueMinimum, false);
  assert.equal(r.belowHeadcountMinimum, false);
  assert.equal(r.totalServiceMinutes, 520);
  assert.equal(r.capacityMinutes, 240);
  assert.equal(r.minutesShort, 280);
  assert.equal(r.additionalArtistsNeeded, 2);
  assert.equal(r.assistantChargeRevenue, 300);
  assert.equal(r.assistantPayoutCost, 250);
  assert.equal(r.assistantMarkup, 50);

  for (const value of [
    '$1,125.00', '$500.00', '520 minutes', '240 minutes', '280 minutes',
    '$300.00', '$250.00', '$50.00',
  ]) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});
