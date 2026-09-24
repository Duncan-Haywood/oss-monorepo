import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-400-a-zone-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, engineering, or business advice/i);
});

// This page compares against a generic pricing method (a flat per-zone
// rate), not a named competitor, so it names no company and carries no
// affiliation disclaimer -- unlike vs-aspire.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /Aspire|ServiceTitan|Jobber|ServiceMonster|Angi|HomeAdvisor/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/irrigation-install-bid-calculator\/vs-a-flat-400-a-zone-special\.html">/);
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
  assert.match(indexHtml, /href="\.?\/?vs-a-flat-400-a-zone-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-400-a-zone-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/how-much-to-charge-to-install-a-sprinkler-system\.html"/);
});

// The worked-example table figures are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs ever changes, this page's
// numbers must be re-derived, not left stale. The "easy" job matches
// index.html's own shipped default form values exactly, so a reader who
// opens the calculator with nothing changed sees this page's own first row.
test('the worked-example table figures match calc.mjs run against the stated jobs', async () => {
  const { calculateBid, suggestedControllerKit, suggestedBackflowKit, suggestedSoilKit, JOB_PRESETS } = await import('./calc.mjs');

  const shop = {
    hoursTrip: 1.5, hoursPerZone: 1.6, hoursExtraHead: 0.12, hoursTrenchPerFoot: 0.045,
    hoursDrip: 3.2, hoursRain: 0.6, hoursMaster: 1.1, siteHours: 0.75,
    valveCost: 42, headCost: 9.5, pipeCostPerFoot: 1.15,
    dripCost: 285, rainCost: 55, masterCost: 95, permitFee: 0,
    hourlyWage: 38, burdenRate: 32, travelAndEquipment: 85, overheadRate: 15, targetMargin: 30,
    proposedPrice: null,
  };

  function fullInput(preset) {
    return {
      ...shop,
      controller: preset.controller, backflow: preset.backflow, soil: preset.soil,
      zones: preset.zones, headsPerZone: preset.headsPerZone, trenchFeet: preset.trenchFeet,
      addDrip: preset.addDrip, addRain: preset.addRain, addMaster: preset.addMaster,
      ...suggestedControllerKit(preset.controller),
      ...suggestedBackflowKit(preset.backflow),
      ...suggestedSoilKit(preset.soil),
    };
  }

  // JOB_PRESETS[0] is the "$400/zone special" brochure job -- 6-zone spray,
  // 3/4-inch PVB, dirt, 180 ft trench -- and matches index.html's shipped
  // defaults. JOB_PRESETS[3] carries the identical 6 zones but a 1-inch RPZ,
  // clay soil, and a drip conversion, so a flat per-zone rate cannot tell it
  // apart from the brochure job. JOB_PRESETS[2] is the 10-zone rock job with
  // every extra.
  const easy = calculateBid(fullInput(JOB_PRESETS[0]));
  const sameZones = calculateBid(fullInput(JOB_PRESETS[3]));
  const hard = calculateBid(fullInput(JOB_PRESETS[2]));

  assert.equal(easy.zones, 6);
  assert.equal(sameZones.zones, 6);
  assert.equal(hard.zones, 10);

  assert.equal(easy.breakEvenPrice.toFixed(2), '2699.17');
  assert.equal(sameZones.breakEvenPrice.toFixed(2), '4121.60');
  assert.equal(hard.breakEvenPrice.toFixed(2), '8098.17');

  const flatRate = 400;
  const easyFlat = flatRate * easy.zones;
  const sameZonesFlat = flatRate * sameZones.zones;
  const hardFlat = flatRate * hard.zones;

  assert.equal(easyFlat, 2400);
  assert.equal(sameZonesFlat, 2400);
  assert.equal(hardFlat, 4000);

  assert.equal((easy.breakEvenPrice - easyFlat).toFixed(2), '299.17');
  assert.equal((sameZones.breakEvenPrice - sameZonesFlat).toFixed(2), '1721.60');
  assert.equal((hard.breakEvenPrice - hardFlat).toFixed(2), '4098.17');
  assert.equal((sameZones.breakEvenPrice - easy.breakEvenPrice).toFixed(2), '1422.42');

  assert.match(html, /\$2,699\.17/);
  assert.match(html, /\$2,400\.00/);
  assert.match(html, /\$299\.17/);
  assert.match(html, /\$4,121\.60/);
  assert.match(html, /\$1,721\.60/);
  assert.match(html, /\$8,098\.17/);
  assert.match(html, /\$4,000\.00/);
  assert.match(html, /\$4,098\.17/);
  assert.match(html, /\$1,422\.42/);
});
