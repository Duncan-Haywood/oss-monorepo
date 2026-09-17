import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { calculateBid, JOB_PRESETS, suggestedPanelCost, suggestedServiceKit } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-flat-panel-upgrade-price.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not electrical, construction, legal, tax, or financial advice/i);
});

test('names no company or product, so no trademark disclaimer is owed', () => {
  // This is the generic-method half of the venture's comparison surface: it
  // argues against a *pricing method* (a flat price, a per-amp rate), not
  // against a competitor. `clauses.mjs` exempts it from the trademark
  // sentence on exactly that basis, so the claim has to stay true.
  assert.match(html, /names no company or product/);
  assert.doesNotMatch(html, /ServiceTitan|Housecall|Jobber|Workiz/i);
});

test('the canonical tag names this file', () => {
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/example\.invalid\/electrical-panel-upgrade-bid-calculator\/vs-a-flat-panel-upgrade-price\.html">/,
  );
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
  assert.match(indexHtml, /href="\.\/vs-a-flat-panel-upgrade-price\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-panel-upgrade-price\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-to-upgrade-an-electrical-panel\.html"/);
});

// The page's whole argument is a set of numbers. If a preset, a default rate,
// or the arithmetic changes, these figures go stale silently -- a marketing
// page quietly asserting a break-even the calculator no longer computes. So
// recompute them here from `calc.mjs` itself rather than trusting the prose.
const PAGE_DEFAULTS = {
  hoursPanelSwap: 4, hoursServiceChange: 6, hoursFinishedAccess: 3, hoursPerFeederFoot: 0.15,
  hoursPerCircuit: 0.35, hoursPerAfci: 0.2, hoursMeterSocket: 3, hoursGrounding: 2.5,
  hoursTemporaryPower: 2, hoursUtilityCoordination: 1.5, siteHours: 2, breakerCostEach: 12,
  afciCostEach: 48, meterSocketCost: 320, groundRodKit: 95, tempPowerCost: 175, permitFee: 185,
  utilityFee: 250, hourlyWage: 52, burdenRate: 34, travelAndEquipment: 165, overheadRate: 18,
  targetMargin: 30,
};

function bidForPreset(preset) {
  const kit = suggestedServiceKit(preset.service);
  const { panelCost } = suggestedPanelCost(preset.panelStyle, preset.newAmps);
  return calculateBid({
    ...PAGE_DEFAULTS,
    ...preset,
    panelCost,
    seCablePerFoot: kit.seCablePerFoot,
    mastKitCost: kit.mastKitCost,
    hoursUnderground: kit.hoursUnderground,
  });
}

const money = (n) => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

test('every figure in the worked table is what calc.mjs actually computes', () => {
  const [brochure, overhead200, underground200, class400] = JOB_PRESETS.map(bidForPreset);

  for (const value of [brochure.breakEvenPrice, brochure.price, overhead200.breakEvenPrice,
    overhead200.price, underground200.breakEvenPrice, underground200.price]) {
    assert.ok(html.includes(money(value)), `${money(value)} is not on the page`);
  }

  // The flat-quote gaps the table asserts, recomputed against a $2,500 quote.
  const FLAT = 2500;
  assert.ok(html.includes(money(FLAT - brochure.breakEvenPrice)), 'brochure surplus over cost is stale');
  assert.ok(html.includes(money(brochure.price - FLAT)), 'brochure margin given up is stale');
  assert.ok(html.includes(money(overhead200.breakEvenPrice - FLAT)), 'overhead 200A shortfall is stale');
  assert.ok(html.includes(money(underground200.breakEvenPrice - FLAT)), 'underground 200A shortfall is stale');

  // The per-amp inversion is the page's sharpest claim, so assert the
  // direction as well as the two figures: the far larger job really is
  // cheaper per amp of new service, which is why a per-amp rate misleads.
  assert.ok(class400.pricePerNewAmp < brochure.pricePerNewAmp,
    'the 400A class change is no longer cheaper per amp than the 100A swap -- the page\'s argument has inverted');
  assert.ok(html.includes(`$${brochure.pricePerNewAmp.toFixed(2)} per amp`), 'brochure per-amp figure is stale');
  assert.ok(html.includes(`$${class400.pricePerNewAmp.toFixed(2)} per amp`), '400A per-amp figure is stale');

  // Carrying the small job's per-amp rate onto the underground 200A job.
  const carried = brochure.pricePerNewAmp * underground200.newAmps;
  assert.ok(html.includes(money(underground200.breakEvenPrice - carried).replace('.00', '')) ||
    html.includes(money(underground200.breakEvenPrice - carried)),
  'the carried per-amp shortfall is stale');
});
