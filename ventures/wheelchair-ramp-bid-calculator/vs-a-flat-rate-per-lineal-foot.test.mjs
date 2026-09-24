import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-rate-per-lineal-foot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, legal, tax, financial, or engineering advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no vendor, competing calculator, or field-service platform', () => {
  // This page compares against a generic pricing habit (a flat rate per
  // lineal foot), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Distinct from this venture's own vs-jobber.html,
  // which names Jobber specifically.
  assert.doesNotMatch(html, /Jobber/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/wheelchair-ramp-bid-calculator\/vs-a-flat-rate-per-lineal-foot\.html">/);
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

test('the worked-example figures match calc.mjs on a 24-inch wood coupon and a 48-inch aluminum switchback', async () => {
  const {
    calculateBid,
    intermediateLandingCount,
    switchbackExtraLandings,
    suggestedHandrailLf,
    suggestedFootingCount,
    suggestedSurfaceKit,
  } = await import('./calc.mjs');

  const rates = {
    hoursTrip: 1.5, hoursPerHandrailLf: 0.12, hoursPerFooting: 0.35,
    hoursDemo: 2, hoursSite: 0.5, siteHours: 0.4,
    handrailPerLf: 18, footingEach: 35,
    demoFee: 275, mobilizationFee: 150, permitFee: 225,
    hourlyWage: 28, burdenRate: 32, travelAndEquipment: 85, overheadRate: 15, targetMargin: 25,
  };

  // The coupon: a 24-inch straight wood ramp with only the two required
  // landings -- the job a flat per-lineal-foot rate is usually set on.
  const coupon = calculateBid({
    ...rates,
    hoursPer100Sf: 3.2, deckingPerSf: 4.5, framingPerSf: 6,
    slope: 'ada_1_12', surface: 'wood', layout: 'straight',
    riseInches: 24, widthFeet: 4, landingSideFeet: 5, maxRiseBetweenLandings: 30,
    runPerRise: 12,
    handrailLf: 24 * 2 + 2 * 5, footingCount: 4 + 2 * 2 + Math.ceil(24 / 8) * 2,
    demoExistingStairs: false, includePermit: false,
  });

  // A 48-inch switchback on modular aluminum -- a rest landing, a turn
  // landing, demo, and permit -- using this venture's own suggested-kit
  // helpers for the added landings, handrail, footings, and surface cost.
  const riseInches = 48;
  const intermediate = intermediateLandingCount(riseInches, 30);
  const extraTurn = switchbackExtraLandings('switchback', intermediate);
  const landingCount = 2 + intermediate + extraTurn;
  const runFeet = riseInches * 12 / 12;
  const handrailLf = suggestedHandrailLf(riseInches, runFeet, landingCount, 5);
  const footingCount = suggestedFootingCount(runFeet, landingCount, 8);
  const kit = suggestedSurfaceKit('aluminum');
  const heavy = calculateBid({
    ...rates,
    hoursPer100Sf: kit.hoursPer100Sf, deckingPerSf: kit.deckingPerSf, framingPerSf: kit.framingPerSf,
    slope: 'ada_1_12', surface: 'aluminum', layout: 'switchback',
    riseInches, widthFeet: 4, landingSideFeet: 5, maxRiseBetweenLandings: 30, runPerRise: 12,
    handrailLf, footingCount, demoExistingStairs: true, includePermit: true,
  });

  assert.equal(coupon.totalCost.toFixed(2), '4601.99');
  assert.equal(coupon.price.toFixed(2), '6135.98');
  assert.equal(coupon.pricePerRunLf.toFixed(2), '255.67');

  assert.equal(heavy.runFeet, 48);
  assert.equal(heavy.landingCount, 3);
  assert.equal(heavy.handrailLf, 111);
  assert.equal(heavy.footingCount, 22);
  assert.equal(heavy.totalCost.toFixed(2), '13910.58');
  assert.equal(heavy.price.toFixed(2), '18547.43');

  const flatQuote = coupon.pricePerRunLf * heavy.runFeet;
  assert.equal(flatQuote.toFixed(2), '12271.96');
  assert.ok(flatQuote < heavy.totalCost, "the flat per-lf quote should price below the aluminum switchback's own break-even cost");
  assert.equal((heavy.totalCost - flatQuote).toFixed(2), '1638.61');
  assert.equal((heavy.price - flatQuote).toFixed(2), '6275.47');
  assert.equal((heavy.price / coupon.price).toFixed(2), '3.02');

  assert.match(html, /\$4,601\.99/);
  assert.match(html, /\$6,135\.98/);
  assert.match(html, /\$255\.67/);
  assert.match(html, /\$13,910\.58/);
  assert.match(html, /\$18,547\.43/);
  assert.match(html, /\$12,271\.96/);
  assert.match(html, /\$1,638\.61/);
  assert.match(html, /\$6,275\.47/);
  assert.match(html, /3\.02/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-rate-per-lineal-foot\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-rate-per-lineal-foot\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/how-much-to-charge-to-build-a-wheelchair-ramp\.html"/);
});
