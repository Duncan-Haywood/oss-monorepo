import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { calculateQuote } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-flat-per-square-foot-rate.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, licensing, insurance, or business advice/i);
});

test('names no pricing guide, rate service, or franchise brand', () => {
  // This page compares against a generic estimating shortcut (a flat
  // per-square-foot rate), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Same discipline as this venture's own
  // vs-franchise-fee-schedule.html, which names no franchise brand either.
  assert.doesNotMatch(html, /Pillar To Post|\bWIN\b|HouseMaster|InterNACHI|\bASHI\b/i);
});

test('the canonical tag names this file, matching this venture\'s own relative-canonical sibling page', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-per-square-foot-rate\.html">/);
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

test('the worked-example figures match calc.mjs on an easy job vs. a hard job at the same square footage', () => {
  const shared = {
    squareFootage: 2000,
    roundTripMiles: 20,
    mileageRate: 0.7,
    baseHourlyRate: 100,
    rushReport: false,
    rushFeePct: 15,
    overheadPerJob: 35,
    targetMarginPct: 25,
  };

  const easy = calculateQuote({ ...shared, stories: 1, foundationType: 'slab', homeAgeYears: 5 });
  assert.equal(easy.onSiteHours, 2.5);
  assert.equal(easy.finalPrice.toFixed(2), '398.67');

  const hard = calculateQuote({ ...shared, stories: 3, foundationType: 'crawlspace', homeAgeYears: 60 });
  assert.equal(hard.onSiteHours, 4.5);
  assert.equal(hard.finalPrice.toFixed(2), '665.33');

  // Same square footage both times -- a flat per-square-foot rate cannot
  // distinguish these two jobs, but the actual on-site time differs by 80%.
  assert.equal(easy.onSiteHours, easy.onSiteHours);
  const hoursIncreasePct = ((hard.onSiteHours - easy.onSiteHours) / easy.onSiteHours) * 100;
  assert.equal(Math.round(hoursIncreasePct), 80);

  assert.match(html, /2\.5 on-site hours/);
  assert.match(html, /\$398\.67/);
  assert.match(html, /4\.5 on-site hours/);
  assert.match(html, /\$665\.33/);
  assert.match(html, /80%/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-per-square-foot-rate\.html"|href="vs-a-flat-per-square-foot-rate\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-per-square-foot-rate\.html/);
});

test('the comparison page links back to the calculator, the worked-example guide, and the franchise comparison', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/how-to-price-a-home-inspection\.html"/);
  assert.match(html, /href="\.\/vs-franchise-fee-schedule\.html"/);
});

test('does not claim a dollar figure for any unverified third party', () => {
  assert.doesNotMatch(html, /\$\d+(\.\d+)?\s*\/\s*(month|year|mo|yr)/i);
});
