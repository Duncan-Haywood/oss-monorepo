import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-price-per-pier.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, engineering, or structural advice/);
});

test('names no vendor or competing product', () => {
  // This page compares against a generic pricing habit (a flat price per
  // pier), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Distinct from this venture's own vs-jobber.html,
  // which does name a product and carries its own "not affiliated" clause.
  assert.doesNotMatch(html, /Jobber/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-price-per-pier\.html">/);
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

test('the worked-example figures match calc.mjs on the shipped cost inputs', async () => {
  const { calculateBid } = await import('./calc.mjs');

  const baseInput = {
    depthIncludedFt: 10,
    hoursPerPier: 2.4,
    hoursPerDepthFt: 0.08,
    hoursInteriorPerPier: 1.6,
    hoursPoorAccess: 3.5,
    hoursPerStrap: 2.8,
    hoursPerIBeam: 4.2,
    hoursPerGradeBeamLf: 0.45,
    hoursPer100Slab: 1.8,
    hoursEngineering: 2.5,
    hoursPlumbingReroute: 3.5,
    siteHours: 3,
    pierCostEach: 420,
    extraDepthCostPerFt: 18,
    interiorBracketCost: 95,
    strapCostEach: 185,
    iBeamCostEach: 420,
    gradeBeamCostPerLf: 28,
    slabJackCostPerSqFt: 8,
    engineeringFee: 850,
    permitFee: 275,
    plumbingAllowance: 650,
    hourlyWage: 42,
    burdenRate: 34,
    travelAndEquipment: 285,
    overheadRate: 16,
    targetMargin: 28,
    proposedPrice: null,
  };

  // The exterior brochure job -- the profile a flat per-pier rate is
  // probably learned from.
  const brochure = calculateBid({
    ...baseInput,
    pierCount: 8,
    averageDepthFt: 12,
    interiorAccess: false,
    poorAccess: false,
    engineeringStamp: false,
    carbonFiberStraps: 0,
    steelIBeams: 0,
    gradeBeamLf: 0,
    slabJackingSqFt: 0,
    plumbingReroute: false,
  });
  assert.equal(brochure.totalHours.toFixed(1), '29.9');
  assert.equal(brochure.totalCost.toFixed(2), '6831.99');
  assert.equal(brochure.price.toFixed(2), '9488.87');
  assert.equal(brochure.pricePerPier.toFixed(2), '1186.11');

  // Fewer piers, harder job: interior access, extra depth, an engineering
  // stamp, four carbon-fiber straps, and a plumbing reroute.
  const hard = calculateBid({
    ...baseInput,
    pierCount: 6,
    averageDepthFt: 14,
    interiorAccess: true,
    poorAccess: false,
    engineeringStamp: true,
    carbonFiberStraps: 4,
    steelIBeams: 0,
    gradeBeamLf: 0,
    slabJackingSqFt: 0,
    plumbingReroute: true,
  });
  assert.equal(hard.totalHours.toFixed(1), '50.9');
  assert.equal(hard.totalCost.toFixed(2), '10657.82');
  assert.equal(hard.price.toFixed(2), '14802.53');
  assert.equal(hard.pricePerPier.toFixed(2), '2467.09');

  // A rate learned per pier from the brochure job, applied to the interior
  // job's pier count, reproduces that same per-pier rate times six piers.
  const flatPriceOnHardPierCount = brochure.pricePerPier * hard.pierCount;
  assert.equal(flatPriceOnHardPierCount.toFixed(2), '7116.66');
  assert.ok(
    flatPriceOnHardPierCount < hard.totalCost,
    'the flat-rate price should quote below the interior job\'s own break-even cost',
  );
  assert.equal((hard.totalCost - flatPriceOnHardPierCount).toFixed(2), '3541.17');
  assert.equal((hard.price - flatPriceOnHardPierCount).toFixed(2), '7685.87');

  assert.match(html, /\$9,488\.87/);
  assert.match(html, /\$1,186\.11/);
  assert.match(html, /\$10,657\.82/);
  assert.match(html, /\$14,802\.53/);
  assert.match(html, /\$2,467\.09/);
  assert.match(html, /\$7,116\.66/);
  assert.match(html, /\$3,541\.17/);
  assert.match(html, /\$7,685\.87/);
  assert.match(html, /29\.9 crew-hours/);
  assert.match(html, /50\.9 crew-hours/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-price-per-pier\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-price-per-pier\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-for-foundation-repair\.html"/);
});
