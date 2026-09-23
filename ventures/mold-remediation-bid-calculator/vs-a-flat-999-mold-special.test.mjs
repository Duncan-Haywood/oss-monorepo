import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-999-mold-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, environmental, legal, tax, or financial advice/);
});

// This page compares against a generic pricing habit (a flat "$999" mold
// special), not a named competitor, so it is listed in
// platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
// carrying a "not affiliated" clause -- there is no company to disclaim a
// relationship with. Distinct from this venture's own vs-xactimate.html,
// which does name a product and carries its own "not affiliated" clause.
test('names no vendor or competing product', () => {
  assert.doesNotMatch(html, /Xactimate/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-999-mold-special\.html">/);
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
  assert.match(indexHtml, /href="\.?\/?vs-a-flat-999-mold-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-999-mold-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-for-mold-remediation\.html"/);
});

// The worked-example figures are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's presets or shipped
// index.html shop-rate defaults ever change, this page's numbers must be
// re-derived, not left stale.
test('the worked-example figures match calc.mjs run against JOB_PRESETS[0] and JOB_PRESETS[2] at the shipped default shop rates', async () => {
  const { calculateBid, JOB_PRESETS, suggestedJobHours } = await import('./calc.mjs');

  // This calculator's own shipped index.html shop-rate defaults.
  const shopRates = {
    includedAffectedSqFt: 80,
    includedContainmentZones: 1,
    hoursPerExtra100SqFt: 1.5,
    hoursPerExtraZone: 2.5,
    hoursPer100DemoSqFt: 3,
    hoursPerDryoutDay: 0.75,
    hoursClearance: 1.5,
    hoursHvac: 3.5,
    hoursDumpster: 1.5,
    hoursOccupied: 2,
    siteHours: 1.5,
    hepaDaily: 125,
    dehumidifierDaily: 65,
    containmentKit: 185,
    extraZoneKit: 95,
    demoDisposalPerSqFt: 2.4,
    antimicrobialPerSqFt: 0.85,
    encapsulantPerSqFt: 0.65,
    clearanceFee: 425,
    hvacCleanCost: 550,
    dumpsterFee: 525,
    hourlyWage: 45,
    burdenRate: 36,
    travelAndEquipment: 145,
    overheadRate: 18,
    targetMargin: 30,
    proposedPrice: null,
  };

  function job(preset) {
    return calculateBid({
      ...shopRates,
      ...preset,
      ...suggestedJobHours(preset.jobType),
    });
  }

  // JOB_PRESETS[0]: the 80 sq ft closet -- the job a flat $999 mold
  // special is named for.
  const closet = job(JOB_PRESETS[0]);
  assert.equal(closet.totalCost.toFixed(2), '1206.55');
  assert.equal(closet.price.toFixed(2), '1723.64');

  // JOB_PRESETS[2]: the 800 sq ft finished basement with two containment
  // zones, four dry-out days, demo, clearance, HVAC, a dumpster, and an
  // occupied home -- where the flat special loses badly.
  const basement = job(JOB_PRESETS[2]);
  assert.equal(basement.totalCost.toFixed(2), '8080.40');
  assert.equal(basement.price.toFixed(2), '11543.43');

  const flat = 999;

  assert.ok(flat < closet.totalCost, 'the flat special should already undercut the closet\'s own walk-away cost');
  assert.equal((closet.totalCost - flat).toFixed(2), '207.55');
  assert.equal((closet.price - flat).toFixed(2), '724.64');

  assert.ok(flat < basement.totalCost, 'the flat special should undercut the basement\'s own walk-away cost');
  assert.equal((basement.totalCost - flat).toFixed(2), '7081.40');
  assert.equal((basement.price - flat).toFixed(2), '10544.43');

  assert.match(html, /\$1,206\.55/);
  assert.match(html, /\$1,723\.64/);
  assert.match(html, /\$8,080\.40/);
  assert.match(html, /\$11,543\.43/);
  assert.match(html, /\$207\.55/);
  assert.match(html, /\$724\.64/);
  assert.match(html, /\$7,081\.40/);
  assert.match(html, /\$10,544\.43/);
});
