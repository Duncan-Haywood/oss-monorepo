import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-400-a-zone-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, legal, tax, financial, or engineering advice/i);
});

// This page compares against a generic pricing method (a flat per-zone
// rate), not a named competitor, so it names no company and carries no
// affiliation disclaimer -- unlike vs-aspire.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /Aspire/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-400-a-zone-special\.html">/);
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

// The three worked-example rows are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs ever changes, this page's
// numbers must be re-derived, not left stale. The "easy" job matches
// index.html's own shipped default form values exactly, so a reader who
// opens the calculator with nothing changed sees this page's own first row.
test('the worked-example table figures match calc.mjs run against the stated jobs', async () => {
  const { calculateBid, flatFeeGap, suggestedControllerKit, suggestedBackflowKit, suggestedSoilKit } = await import('./calc.mjs');

  const shop = {
    hoursTrip: 1.5, hoursPerZone: 1.6, hoursTrenchPerFoot: 0.045, hoursExtraHead: 0.12, siteHours: 0.75,
    hoursDrip: 3.2, hoursRain: 0.6, hoursMaster: 1.1,
    valveCost: 42, headCost: 9.5, pipeCostPerFoot: 1.15, dripCost: 285, rainCost: 55, masterCost: 95, permitFee: 0,
    hourlyWage: 38, burdenRate: 32, travelAndEquipment: 85, overheadRate: 15, targetMargin: 30,
    proposedPrice: null,
  };

  function job({ controller, backflow, soil, zones, headsPerZone, trenchFeet, addDrip = false, addRain = false, addMaster = false }) {
    const input = {
      ...shop,
      ...suggestedControllerKit(controller),
      ...suggestedBackflowKit(backflow),
      ...suggestedSoilKit(soil),
      controller, backflow, soil, zones, headsPerZone, trenchFeet, addDrip, addRain, addMaster,
    };
    return calculateBid(input);
  }

  const easy = job({ controller: 'six', backflow: 'pvb', soil: 'dirt', zones: 6, headsPerZone: 6, trenchFeet: 180 });
  const mid = job({ controller: 'twelve', backflow: 'rpz1', soil: 'dirt', zones: 8, headsPerZone: 8, trenchFeet: 280, addRain: true });
  const hard = job({ controller: 'wifi', backflow: 'rpz15', soil: 'rock', zones: 10, headsPerZone: 10, trenchFeet: 420, addDrip: true, addRain: true, addMaster: true });

  assert.equal(easy.totalCost.toFixed(2), '2699.17');
  assert.equal(mid.totalCost.toFixed(2), '4352.71');
  assert.equal(hard.totalCost.toFixed(2), '8098.17');

  assert.equal(flatFeeGap(400, easy).flatFee.toFixed(2), '2400.00');
  assert.equal(flatFeeGap(400, easy).shortfall.toFixed(2), '299.17');
  assert.equal(flatFeeGap(400, mid).flatFee.toFixed(2), '3200.00');
  assert.equal(flatFeeGap(400, mid).shortfall.toFixed(2), '1152.71');
  assert.equal(flatFeeGap(400, hard).flatFee.toFixed(2), '4000.00');
  assert.equal(flatFeeGap(400, hard).shortfall.toFixed(2), '4098.17');

  assert.match(html, /\$2,400\.00/);
  assert.match(html, /\$2,699\.17/);
  assert.match(html, /\$4,352\.71/);
  assert.match(html, /\$8,098\.17/);
  assert.match(html, /\$299\.17/);
  assert.match(html, /\$1,152\.71/);
  assert.match(html, /\$4,098\.17/);
});
