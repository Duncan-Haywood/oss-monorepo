import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-2495-furnace-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not HVAC, construction, legal, tax, or financial advice/i);
});

// This page compares against a generic pricing habit (a flat "$2,495
// installed" furnace special), not a named competitor, so it is listed in
// platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
// carrying a "not affiliated" clause -- there is no company to disclaim a
// relationship with. Distinct from this venture's own vs-servicetitan.html,
// which does name a product and carries its own "not affiliated" clause.
test('names no vendor or competing product', () => {
  assert.doesNotMatch(html, /ServiceTitan/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-2495-furnace-special\.html">/);
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
  assert.match(indexHtml, /href="\.?\/?vs-a-flat-2495-furnace-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-2495-furnace-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-to-replace-a-furnace\.html"/);
});

// The worked-example figures are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's presets, suggested kits, or
// shipped index.html shop-rate defaults ever change, this page's numbers
// must be re-derived, not left stale.
test('the worked-example figures match calc.mjs run against JOB_PRESETS[0] and JOB_PRESETS[2] at the shipped default shop rates', async () => {
  const {
    calculateBid, JOB_PRESETS, suggestedCapacityKit, suggestedEquipmentKit, suggestedLocationKit,
  } = await import('./calc.mjs');

  // This calculator's own shipped index.html shop-rate defaults.
  const shopRates = {
    hoursTrip: 1,
    hoursPerExtraDuctFoot: 0.12,
    hoursCoil: 2.25,
    hoursGas: 1.5,
    hoursHaul: 0.75,
    hoursThermostat: 0.6,
    siteHours: 0.75,
    coilCost: 920,
    gasCost: 220,
    ductPerFoot: 12,
    haulFee: 125,
    thermostatCost: 260,
    permitFee: 175,
    hourlyWage: 52,
    burdenRate: 34,
    travelAndEquipment: 155,
    overheadRate: 18,
    targetMargin: 35,
  };

  function job(preset) {
    return calculateBid({
      ...shopRates,
      ...preset,
      ...suggestedCapacityKit(preset.capacity),
      ...suggestedEquipmentKit(preset.equipment),
      ...suggestedLocationKit(preset.location),
    });
  }

  // JOB_PRESETS[0]: the 60k 80% AFUE basement swap -- the job a flat
  // $2,495 furnace special is named for.
  const basementSwap = job(JOB_PRESETS[0]);
  assert.equal(basementSwap.totalCost.toFixed(2), '2608.58');
  assert.equal(basementSwap.price.toFixed(2), '4013.20');

  // JOB_PRESETS[2]: the 100k 96% condensing attic changeout with a
  // matching coil, gas upsize, haul-away, and thermostat -- where the
  // flat special loses badly.
  const atticChangeout = job(JOB_PRESETS[2]);
  assert.equal(atticChangeout.totalCost.toFixed(2), '7111.30');
  assert.equal(atticChangeout.price.toFixed(2), '10940.47');

  const flat = 2495;

  assert.ok(flat < basementSwap.totalCost, 'the flat special should already undercut the basement swap\'s own walk-away cost');
  assert.equal((basementSwap.totalCost - flat).toFixed(2), '113.58');
  assert.equal((basementSwap.price - flat).toFixed(2), '1518.20');

  assert.ok(flat < atticChangeout.totalCost, 'the flat special should undercut the attic changeout\'s own walk-away cost');
  assert.equal((atticChangeout.totalCost - flat).toFixed(2), '4616.30');
  assert.equal((atticChangeout.price - flat).toFixed(2), '8445.47');

  assert.match(html, /\$2,608\.58/);
  assert.match(html, /\$4,013\.20/);
  assert.match(html, /\$7,111\.30/);
  assert.match(html, /\$10,940\.47/);
  assert.match(html, /\$113\.58/);
  assert.match(html, /\$1,518\.20/);
  assert.match(html, /\$4,616\.30/);
  assert.match(html, /\$8,445\.47/);
});
