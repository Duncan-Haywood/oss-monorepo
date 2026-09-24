import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { calculateIncrease } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-spreadsheet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, tax, accounting, or financial advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('names no spreadsheet application or vendor', () => {
  // Generic-method comparison -- against "a spreadsheet" in the abstract,
  // not any named product -- so this page is exempt from the trademark
  // disclaimer clauses.mjs requires for a vs-<competitor> page (see
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT). That
  // exemption only holds while the page truly names no vendor.
  assert.doesNotMatch(html, /Google Sheets|Excel|Microsoft|Airtable|SiteLink|Storable/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-spreadsheet\.html">/);
});

test('has Open Graph title/description tags in this venture\'s tag style', () => {
  assert.match(html, /<meta property="og:title" content="[^"]+">/);
  assert.match(html, /<meta property="og:description" content="[^"]+">/);
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
  for (const question of schema.mainEntity) {
    const acceptedAnswer = question.acceptedAnswer;
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.?\/?vs-a-spreadsheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-spreadsheet\.html/);
});

test('the comparison page links back to the calculator and to the worked example', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/how-much-can-i-raise-storage-rent\.html"/);
});

// The worked example is the page's central claim -- including the "naive
// SUM formula overstates the move-out cost by 59%" figure, which is the
// whole point of the comparison. Recomputed here against the module the
// calculator itself runs, rather than restated as hand-typed constants, so
// a change to the shipped arithmetic makes this page's claim false (and
// this test red) instead of merely stale. Same inputs as index.html's own
// worked-example defaults.
test('the worked example matches what the shipped calculator computes', () => {
  const r = calculateIncrease({
    unitCount: 42,
    currentRent: 118,
    increasePercent: 15,
    streetRate: 149,
    ancillaryPerMonth: 12,
    baselineMoveOutPercent: 22,
    inducedMoveOutPercent: 6,
    vacantDays: 45,
    reletSharePercent: 100,
    turnoverCost: 45,
    concessionMonths: 1,
    horizonMonths: 12,
  });

  assert.ok(r.ok);
  assert.equal(r.newRent.toFixed(2), '135.70');
  assert.equal((r.rentIncrease * r.unitCount).toFixed(2), '743.40');
  assert.equal(r.keepValue.toFixed(2), '1772.40');
  assert.equal(r.moveOutCost.total.toFixed(2), '272.43');
  assert.equal(r.breakEvenPercent.toFixed(1), '60.8');
  assert.equal(Math.round(r.breakEvenMoveOuts), 26);

  const downtime = r.moveOutCost.items.find((i) => i.key === 'downtime').amount;
  const concession = r.moveOutCost.items.find((i) => i.key === 'concession').amount;
  const turnover = r.moveOutCost.items.find((i) => i.key === 'turnover').amount;
  const rateGap = r.moveOutCost.items.find((i) => i.key === 'rateGap').amount;
  const naiveTotal = downtime + concession + turnover; // drops the rate-gap credit entirely
  assert.equal(naiveTotal.toFixed(2), '432.03');
  assert.ok(rateGap < 0, 'the re-rent uplift should be a credit when street rate exceeds the raised rent');
  assert.equal(Math.round(((naiveTotal - r.moveOutCost.total) / r.moveOutCost.total) * 100), 59);

  for (const value of ['$743.40', '$1,772.40', '$272.43', '$159.60', '$432.03', '59%', '60.8%']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});
