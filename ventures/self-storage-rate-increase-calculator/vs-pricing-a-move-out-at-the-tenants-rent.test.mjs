import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { calculateIncrease, rentOnlyMoveOutCost } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-pricing-a-move-out-at-the-tenants-rent.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

const DEFAULTS = {
  unitCount: 42, currentRent: 118, increasePercent: 15, streetRate: 149,
  ancillaryPerMonth: 12, baselineMoveOutPercent: 22, inducedMoveOutPercent: 6,
  vacantDays: 45, reletSharePercent: 100, turnoverCost: 45, concessionMonths: 1,
  horizonMonths: 12,
};

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, accounting, or financial advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no vendor or competing product', () => {
  // This page compares against a generic mental model (pricing a move-out at
  // the tenant's rent), not a named competitor -- distinct from this
  // venture's own vs-sitelink.html, which names SiteLink/Storable and
  // carries its own "not affiliated" clause. It is registered as
  // disclaimer-exempt in clauses.mjs on that basis, so it must never pick up
  // a product name.
  assert.doesNotMatch(html, /SiteLink|Storable/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-pricing-a-move-out-at-the-tenants-rent\.html">/);
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
    assert.ok(html.includes(question.acceptedAnswer.text), `answer not found verbatim on the page: ${question.acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the worked-example figures match calc.mjs exactly', () => {
  const r = calculateIncrease(DEFAULTS);
  assert.equal(r.ok, true);
  assert.equal(r.newRent.toFixed(2), '135.70');

  const rentOnly = rentOnlyMoveOutCost({
    newRent: r.newRent,
    ancillaryPerMonth: DEFAULTS.ancillaryPerMonth,
    horizonMonths: DEFAULTS.horizonMonths,
  });
  assert.equal(rentOnly.toFixed(2), '1772.40');
  assert.equal(r.moveOutCost.total.toFixed(2), '272.43');
  assert.equal(r.breakEvenPercent.toFixed(1), '60.8');
  assert.equal(r.marginOfSafetyPoints.toFixed(1), '54.8');

  const totalGainIfNoneLeave = r.rentIncrease * DEFAULTS.unitCount * DEFAULTS.horizonMonths;
  assert.equal(totalGainIfNoneLeave.toFixed(2), '8920.80');
  const naiveBreakEvenMoveOuts = totalGainIfNoneLeave / rentOnly;
  assert.equal(naiveBreakEvenMoveOuts.toFixed(2), '5.03');
  const naiveBreakEvenPercent = (naiveBreakEvenMoveOuts / DEFAULTS.unitCount) * 100;
  assert.equal(naiveBreakEvenPercent.toFixed(1), '12.0');
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.?\/?vs-pricing-a-move-out-at-the-tenants-rent\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-pricing-a-move-out-at-the-tenants-rent\.html/);
});

test('the comparison page links back to the calculator and to the worked example', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/how-much-can-i-raise-storage-rent\.html"/);
});
