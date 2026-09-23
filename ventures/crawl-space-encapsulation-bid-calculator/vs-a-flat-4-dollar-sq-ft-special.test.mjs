import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-4-dollar-sq-ft-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not waterproofing, structural, construction, radon, mold, building-code, legal, tax, or financial advice/i);
});

// This page compares against a generic pricing habit (a flat "$4 / sq ft
// encapsulation special"), not a named competitor, so it is listed in
// platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
// carrying a "not affiliated" clause -- there is no company to disclaim a
// relationship with. Distinct from this venture's own vs-quoteiq.html, which
// does name a product and carries its own "not affiliated" clause.
test('names no vendor or competing product', () => {
  assert.doesNotMatch(html, /QuoteIQ/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-4-dollar-sq-ft-special\.html">/);
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
  assert.match(indexHtml, /href="vs-a-flat-4-dollar-sq-ft-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-4-dollar-sq-ft-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-for-crawl-space-encapsulation\.html"/);
});

// The worked-example figures are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's presets, suggested kits, or
// shipped index.html shop-rate defaults ever change, this page's numbers
// must be re-derived, not left stale.
test('the worked-example figures match calc.mjs run against JOB_PRESETS[0] and JOB_PRESETS[2] at the shipped default shop rates', async () => {
  const {
    calculateBid, JOB_PRESETS, suggestedScopeKit, suggestedAccessKit, suggestedInsulationKit, suggestedExtraKit,
  } = await import('./calc.mjs');

  // This calculator's own shipped index.html shop-rate defaults.
  const shopRates = {
    hourlyWage: 32,
    burdenRate: 30,
    travelAndEquipment: 95,
    otherCost: 0,
    overheadRate: 15,
    targetMargin: 20,
    proposedPrice: null,
  };

  function job(preset) {
    return calculateBid({
      ...preset,
      ...suggestedScopeKit(preset.scope),
      ...suggestedAccessKit(preset.access),
      ...suggestedInsulationKit(preset.insulation),
      ...suggestedExtraKit(),
      ...shopRates,
    });
  }

  // JOB_PRESETS[0]: "Dry ranch, hatch, 6-mil liner-only (the cheap special)"
  // -- the job a flat $4/sq ft encapsulation special is named for.
  const dryRanch = job(JOB_PRESETS[0]);
  assert.equal(dryRanch.floorSqFt, 1120);
  assert.equal(dryRanch.totalCost.toFixed(2), '1962.79');
  assert.equal(dryRanch.price.toFixed(2), '2453.49');
  assert.equal(dryRanch.pricePerSqFt.toFixed(2), '2.19');

  // JOB_PRESETS[2]: "Wet tight crawl, 20-mil, 90-pint, rim foam, clean-out
  // (where the special loses)".
  const wetTight = job(JOB_PRESETS[2]);
  assert.equal(wetTight.floorSqFt, 864);
  assert.equal(wetTight.totalCost.toFixed(2), '9264.20');
  assert.equal(wetTight.price.toFixed(2), '11580.24');

  const flatDryRanch = dryRanch.floorSqFt * 4;
  const flatWetTight = wetTight.floorSqFt * 4;
  assert.equal(flatDryRanch.toFixed(2), '4480.00');
  assert.equal(flatWetTight.toFixed(2), '3456.00');

  assert.ok(flatDryRanch > dryRanch.totalCost, 'the flat special should overcharge the dry ranch relative to its own walk-away cost');
  assert.equal((flatDryRanch - dryRanch.totalCost).toFixed(2), '2517.21');
  assert.equal((flatDryRanch - dryRanch.price).toFixed(2), '2026.51');

  assert.ok(flatWetTight < wetTight.totalCost, 'the flat special should undercut the wet tight crawl\'s own walk-away cost');
  assert.equal((wetTight.totalCost - flatWetTight).toFixed(2), '5808.20');
  assert.equal((wetTight.price - flatWetTight).toFixed(2), '8124.24');

  assert.match(html, /\$1,962\.79/);
  assert.match(html, /\$2,453\.49/);
  assert.match(html, /\$9,264\.20/);
  assert.match(html, /\$11,580\.24/);
  assert.match(html, /\$4,480\.00/);
  assert.match(html, /\$3,456\.00/);
  assert.match(html, /\$2,517\.21/);
  assert.match(html, /\$2,026\.51/);
  assert.match(html, /\$5,808\.20/);
  assert.match(html, /\$8,124\.24/);
});
