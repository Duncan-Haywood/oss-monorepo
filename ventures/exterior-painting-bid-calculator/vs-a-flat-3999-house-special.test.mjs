import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { calculateBid, JOB_PRESETS, suggestedJobHours } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-flat-3999-house-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not construction, painting, lead-paint, building-code, legal, tax, or financial advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('names no specific painting company -- this is the generic-method exemption clauses.mjs grants it', () => {
  // Distinct from vs-paintscout.html, which does name a product and carries
  // its own "not affiliated with PaintScout" clause. This page compares
  // against a pricing pattern ("a flat $3,999 house special"), not a company.
  assert.doesNotMatch(html, /PaintScout|Jobber|Housecall|Angi|Thumbtack/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-3999-house-special\.html">/);
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

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-3999-house-special\.html"|href="vs-a-flat-3999-house-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-3999-house-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-to-paint-the-exterior-of-a-house\.html"/);
});

// The page states four dollar figures as this calculator's own arithmetic on
// its own built-in presets ("1-story ranch" / "2-story colonial"). Pin them
// against calc.mjs directly, the same defaults the ranch and colonial presets
// ship with on index.html, so a future change to the pricing model or the
// preset defaults cannot leave this page quietly wrong.
const SHOP_DEFAULTS = {
  includedElevationSf: 1600,
  includedStories: 1,
  includedTrimFeet: 80,
  hoursBaseSetup: 6,
  hoursPer100Sf: 2.4,
  hoursPerExtraStory: 6,
  hoursScrapePer100: 1.8,
  hoursPrimePer100: 0.8,
  hoursTrimPer10Feet: 0.7,
  hoursPerShutter: 0.2,
  hoursOccupied: 2,
  hoursHardAccess: 5,
  siteHours: 1,
  finishCoats: 2,
  paintCoverage: 350,
  paintCostPerGallon: 48,
  primerCostPerGallon: 38,
  caulkPer10TrimFeet: 3.5,
  hourlyWage: 36,
  burdenRate: 32,
  travelAndEquipment: 85,
  overheadRate: 16,
  targetMargin: 28,
};

function priceOf(label) {
  const preset = JOB_PRESETS.find((item) => item.label === label);
  assert.ok(preset, `no JOB_PRESETS entry labelled "${label}"`);
  const input = { ...SHOP_DEFAULTS, ...suggestedJobHours(preset.jobType), ...preset };
  return calculateBid(input);
}

test('the ranch worked example matches calc.mjs at the shop-rate defaults', () => {
  const r = priceOf('1-story ranch, 1,800 sf, 2-coat repaint (the $3,999 special)');
  assert.equal(r.price.toFixed(2), '1940.12');
  assert.equal(r.breakEvenPrice.toFixed(2), '1396.89');
  assert.match(html, /\$1,940\.12/);
  assert.match(html, /\$1,396\.89/);
});

test('the colonial worked example matches calc.mjs at the shop-rate defaults, and undercuts the flat special’s breakeven', () => {
  const r = priceOf('2-story colonial, 2,800 sf, extra trim, occupied, hard access');
  assert.equal(r.price.toFixed(2), '6286.96');
  assert.equal(r.breakEvenPrice.toFixed(2), '4526.61');
  assert.ok(r.breakEvenPrice > 3999, 'the whole claim of this page is that $3,999 falls short of walk-away cost on this preset');
  assert.equal((r.breakEvenPrice - 3999).toFixed(2), '527.61');
  assert.match(html, /\$6,286\.96/);
  assert.match(html, /\$4,526\.61/);
  assert.match(html, /\$527\.61/);
});
