import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import {
  calculateBid, JOB_PRESETS,
  suggestedSizeKit, suggestedFuelKit, suggestedChimneyKit, suggestedAccessKit,
} from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-flat-2499-installed-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not construction, legal, tax, financial, or engineering advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('names no specific hearth-shop software -- this is the generic-method exemption clauses.mjs grants it', () => {
  // Distinct from vs-jobber.html, which does name a product and carries
  // its own "not affiliated with Jobber" clause. This page compares
  // against a pricing pattern ("a flat $2,499 installed special"), not a
  // company or a competing calculator.
  assert.doesNotMatch(html, /Jobber|Housecall|Angi|Thumbtack/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-2499-installed-special\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-a-flat-2499-installed-special\.html"|href="vs-a-flat-2499-installed-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-2499-installed-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-to-install-a-fireplace-insert\.html"/);
});

// The page states four dollar figures as this calculator's own arithmetic on
// its own built-in presets (the small-gas job the special is named for, and
// the large-wood job it gets misapplied to). Pin them against calc.mjs
// directly, applying the same size/fuel/chimney/access kits the browser
// applies when a preset is picked from index.html's "Starting job" select,
// on top of index.html's own shop-rate defaults, so a future change to the
// pricing model, a preset, or a default cannot leave this page quietly wrong.
const SHOP_DEFAULTS = {
  hoursTrip: 1.5,
  hoursSet: 3.5,
  hoursSetPremium: 0,
  hoursAccess: 0,
  hoursChimney: 8,
  hoursPerLinerFoot: 0.18,
  hoursHearth: 2.5,
  hoursGasLine: 2.2,
  hoursCircuit: 1.8,
  hoursSurround: 2,
  hoursDamper: 0.8,
  hoursTearOut: 1.5,
  siteHours: 0.5,
  unitCost: 1850,
  unitCostMultiplier: 1,
  linerKit: 280,
  linerPerFoot: 28,
  rebuildMaterial: 2200,
  hearthCost: 380,
  gasLineCost: 420,
  circuitCost: 340,
  surroundCost: 520,
  damperCost: 95,
  dumpFee: 85,
  permitFee: 125,
  hourlyWage: 48,
  burdenRate: 34,
  travelAndEquipment: 145,
  overheadRate: 18,
  targetMargin: 32,
};

function priceOf(label) {
  const preset = JOB_PRESETS.find((item) => item.label === label);
  assert.ok(preset, `no JOB_PRESETS entry labelled "${label}"`);
  const input = {
    ...SHOP_DEFAULTS,
    ...preset,
    ...suggestedSizeKit(preset.size),
    ...suggestedFuelKit(preset.fuel),
    ...suggestedChimneyKit(preset.chimney),
    ...suggestedAccessKit(preset.access),
  };
  return calculateBid(input);
}

test('the small-gas worked example matches calc.mjs at the shop-rate defaults, and undercuts its own named job', () => {
  const r = priceOf('Small gas insert, existing stub, no liner, one story (the $2,499 installed special)');
  assert.equal(r.price.toFixed(2), '4607.62');
  assert.equal(r.breakEvenPrice.toFixed(2), '3133.18');
  assert.ok(r.breakEvenPrice > 2499, 'the whole claim of this page is that $2,499 falls short of walk-away cost on the special\'s own named job');
  assert.equal((r.breakEvenPrice - 2499).toFixed(2), '634.18');
  assert.match(html, /\$4,607\.62/);
  assert.match(html, /\$3,133\.18/);
  assert.match(html, /\$634\.18/);
});

test('the large-wood worked example matches calc.mjs at the shop-rate defaults, and undercuts the flat special’s breakeven', () => {
  const r = priceOf('Large wood insert, 30 ft liner, new hearth, surround, damper, 2nd-story stack');
  assert.equal(r.price.toFixed(2), '14882.94');
  assert.equal(r.breakEvenPrice.toFixed(2), '10120.40');
  assert.ok(r.breakEvenPrice > 2499, 'the whole claim of this page is that $2,499 falls short of walk-away cost on this preset');
  assert.equal((r.breakEvenPrice - 2499).toFixed(2), '7621.40');
  assert.match(html, /\$14,882\.94/);
  assert.match(html, /\$10,120\.40/);
  assert.match(html, /\$7,621\.40/);
});
