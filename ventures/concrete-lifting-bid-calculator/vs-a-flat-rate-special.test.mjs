import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-rate-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, legal, tax, financial, or engineering advice/i);
});

// This page compares against a generic pricing habit (a flat "$X/sq ft" or
// "$X/hole" special), not a named competitor, so it is listed in
// platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
// carrying a "not affiliated" clause -- there is no company to disclaim a
// relationship with. Distinct from this venture's own vs-quoteiq.html, which
// does name a product and carries its own "not affiliated" clause.
test('names no vendor or competing product', () => {
  assert.doesNotMatch(html, /QuoteIQ/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/concrete-lifting-bid-calculator\/vs-a-flat-rate-special\.html">/);
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
  assert.match(indexHtml, /href="vs-a-flat-rate-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-rate-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-for-concrete-lifting\.html"/);
});

// The worked-example figures are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's presets or shipped defaults
// ever change, this page's numbers must be re-derived, not left stale.
test('the worked-example figures match calc.mjs run against the shipped default job and the backyard/extras preset', async () => {
  const { calculateBid, voidCubicFeet, suggestedMethodKit, suggestedAccessKit } = await import('./calc.mjs');

  // Costs the page holds constant across both jobs -- this calculator's own
  // shipped index.html defaults, not numbers invented for this page.
  const baseCosts = {
    hoursTrip: 1.2,
    hoursPerExtraHole: 0.35,
    hoursSeal: 1.1,
    hoursInterior: 2.2,
    siteHours: 0.4,
    extraHoleCost: 45,
    sealCost: 180,
    interiorKit: 240,
    mobilizationFee: 175,
    permitFee: 0,
    hourlyWage: 42,
    burdenRate: 32,
    travelAndEquipment: 95,
    overheadRate: 16,
    targetMargin: 30,
    proposedPrice: null,
  };

  function job({ method, access, slabSqFt, voidInches, extraHoles, addSeal }) {
    const methodKit = suggestedMethodKit(method);
    const accessKit = suggestedAccessKit(access);
    return calculateBid({
      method, access, slabSqFt, voidInches, extraHoles, addSeal,
      hoursLift: methodKit.hoursLift,
      hoursPerCf: methodKit.hoursPerCf,
      materialPerCf: methodKit.materialPerCf,
      hoursAccess: accessKit.hoursAccess,
      ...baseCosts,
    });
  }

  // This calculator's own shipped index.html default job: 80 sq ft, 1-inch
  // void, mudjacking, street-side, no extras -- and JOB_PRESETS[0]
  // ("the $4.50/sf special").
  const sidewalk = job({ method: 'mud', access: 'drive', slabSqFt: 80, voidInches: 1, extraHoles: 0, addSeal: false });
  assert.equal(voidCubicFeet(80, 1).toFixed(2), '6.67');
  assert.equal(sidewalk.volumeCf.toFixed(2), '6.67');
  assert.equal(sidewalk.totalCost.toFixed(2), '628.44');
  assert.equal(sidewalk.price.toFixed(2), '897.77');
  assert.equal(sidewalk.pricePerSqFt.toFixed(2), '11.22');

  // This calculator's own JOB_PRESETS[2]: a larger backyard polyjack job
  // with extras -- 400 sq ft, 4-inch void, polyurethane, backyard access,
  // 6 extra holes, joint seal.
  const backyard = job({ method: 'poly', access: 'yard', slabSqFt: 400, voidInches: 4, extraHoles: 6, addSeal: true });
  assert.equal(voidCubicFeet(400, 4).toFixed(2), '133.33');
  assert.equal(backyard.volumeCf.toFixed(2), '133.33');
  assert.equal(backyard.totalCost.toFixed(2), '9493.96');
  assert.equal(backyard.price.toFixed(2), '13562.80');

  // A rate learned per square foot from the sidewalk, applied to the
  // backyard driveway's own square footage, undercuts both the driveway's
  // own break-even/walk-away cost and its price at the calculator's target
  // margin.
  const flatRateAppliedToBackyard = sidewalk.pricePerSqFt * backyard.slabSqFt;
  assert.equal(flatRateAppliedToBackyard.toFixed(2), '4488.87');
  assert.ok(
    flatRateAppliedToBackyard < backyard.totalCost,
    'the flat-rate quote should undercut the backyard job\'s own walk-away cost',
  );
  assert.equal((backyard.totalCost - flatRateAppliedToBackyard).toFixed(2), '5005.09');
  assert.equal((backyard.price - flatRateAppliedToBackyard).toFixed(2), '9073.93');

  assert.match(html, /\$628\.44/);
  assert.match(html, /\$897\.77/);
  assert.match(html, /\$11\.22/);
  assert.match(html, /\$9,493\.96/);
  assert.match(html, /\$13,562\.80/);
  assert.match(html, /\$4,488\.87/);
  assert.match(html, /\$5,005\.09/);
  assert.match(html, /\$9,073\.93/);
  assert.match(html, /6\.67 cu ft/);
  assert.match(html, /133\.33 cu ft/);
});
