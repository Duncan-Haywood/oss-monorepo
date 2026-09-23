import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { calculateBid, JOB_PRESETS, suggestedProfileKit, suggestedStoryKit } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-flat-4-50-per-foot-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, tax, financial, or engineering advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('names no specific gutter company or CRM -- this is the generic-method exemption clauses.mjs grants it', () => {
  // Distinct from vs-jobnimbus.html, which does name a product and carries
  // its own "not affiliated" clause. This page compares against a pricing
  // pattern ("a flat $4.50-a-foot special"), not a company or product.
  assert.doesNotMatch(html, /JobNimbus|Jobber|Housecall|Angi|Thumbtack/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-4-50-per-foot-special\.html">/);
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
  assert.match(indexHtml, /href="vs-a-flat-4-50-per-foot-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-4-50-per-foot-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-to-install-gutters\.html"/);
});

// The page states dollar figures as this calculator's own arithmetic on its
// own built-in JOB_PRESETS entries ("1-story ranch" / "2-story colonial").
// Pin them against calc.mjs directly, the same defaults index.html ships
// with, so a future change to the pricing model or the preset defaults
// cannot leave this page quietly wrong.
const SHOP_DEFAULTS = {
  hoursTrip: 1.25,
  hoursPerGutterFoot: 0.035,
  hoursInsideMiter: 0.5,
  hoursOutsideMiter: 0.3,
  hoursPerExtraDownspout: 0.65,
  hoursPerExtraDownspoutFoot: 0.08,
  hoursPerFasciaFoot: 0.22,
  hoursPerTearOffFoot: 0.018,
  hoursPerSteepFoot: 0.012,
  siteHours: 0.75,
  downspoutOutletCost: 38,
  downspoutPerFoot: 4.2,
  insideMiterCost: 18,
  outsideMiterCost: 12,
  fasciaPerFoot: 8.5,
  tearOffDumpPerFoot: 0.85,
  hangerPerFoot: 1.1,
  permitFee: 0,
  hourlyWage: 38,
  burdenRate: 32,
  travelAndEquipment: 95,
  overheadRate: 16,
  targetMargin: 32,
};

function priceOf(label) {
  const preset = JOB_PRESETS.find((item) => item.label === label);
  assert.ok(preset, `no JOB_PRESETS entry labelled "${label}"`);
  const input = {
    ...SHOP_DEFAULTS,
    ...suggestedProfileKit(preset.profile),
    ...suggestedStoryKit(preset.stories),
    ...preset,
  };
  return calculateBid(input);
}

test('the ranch worked example matches calc.mjs at the shop-rate defaults, and the $4.50/ft rate undercuts even the job it was written for', () => {
  const r = priceOf('1-story ranch, 140 ft of 5" aluminum, 4 outside miters, first 2 downs included (the $4.50/ft special)');
  assert.equal(r.price.toFixed(2), '1749.03');
  assert.equal(r.breakEvenPrice.toFixed(2), '1189.34');
  const flatRevenue = 4.5 * r.gutterFeet;
  assert.equal(flatRevenue.toFixed(2), '630.00');
  assert.ok(flatRevenue < r.breakEvenPrice, 'the whole claim of this page is that $4.50/ft falls short of walk-away cost even on its own brochure job');
  assert.equal((r.breakEvenPrice - flatRevenue).toFixed(2), '559.34');
  assert.match(html, /\$1,749\.03/);
  assert.match(html, /\$1,189\.34/);
  assert.match(html, /\$630\.00/);
  assert.match(html, /\$559\.34/);
});

test('the colonial worked example matches calc.mjs at the shop-rate defaults, and undercuts the flat special’s breakeven by far more', () => {
  const r = priceOf('2-story colonial, 220 ft of 6" aluminum, 2 inside miters, 4 downs, 40 ft fascia, tear-off');
  assert.equal(r.price.toFixed(2), '6782.18');
  assert.equal(r.breakEvenPrice.toFixed(2), '4611.88');
  const flatRevenue = 4.5 * r.gutterFeet;
  assert.equal(flatRevenue.toFixed(2), '990.00');
  assert.ok(flatRevenue < r.breakEvenPrice, 'the whole claim of this page is that $4.50/ft falls far short of walk-away cost on the bigger job');
  assert.equal((r.breakEvenPrice - flatRevenue).toFixed(2), '3621.88');
  assert.match(html, /\$6,782\.18/);
  assert.match(html, /\$4,611\.88/);
  assert.match(html, /\$990\.00/);
  assert.match(html, /\$3,621\.88/);
});
