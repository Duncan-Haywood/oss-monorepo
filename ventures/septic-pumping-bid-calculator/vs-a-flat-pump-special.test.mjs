import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-pump-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not septic, environmental, construction, legal, tax, or financial advice/i);
});

test('carries the "nothing leaves your browser" privacy line', () => {
  assert.match(html, /Nothing leaves your browser/);
});

test('names no vendor, competing calculator, or field-service platform', () => {
  // This page compares against a generic pricing habit (a flat pump
  // special), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Distinct from this venture's own vs-servicecore.html,
  // which names a real product.
  assert.doesNotMatch(html, /ServiceCore/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-pump-special\.html">/);
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

test('the worked-example figures match calc.mjs on the shipped brochure and two-tank presets', async () => {
  const { calculateBid } = await import('./calc.mjs');

  const rates = () => ({
    includedGallons: 1000, includedHoseFeet: 50, hoursBasePump: 1,
    hoursPerExtra100Gal: 0.15, hoursBuriedLid: 1.25, hoursPerHoseFoot: 0.01,
    hoursPerExtraTank: 0.75, hoursBaffles: 0.75, hoursPerRiser: 0.6,
    hoursInspection: 0.5, hoursAfterHours: 0.5, siteHours: 0.75,
    dumpTripFee: 80, disposalPerGallon: 0.08, baffleKitCost: 85,
    riserCostEach: 145, afterHoursFee: 125, permitFee: 45,
    hourlyWage: 38, burdenRate: 32, travelAndEquipment: 55,
    overheadRate: 16, targetMargin: 28,
  });

  // Exposed lid, single tank at the included gallons and hose run --
  // the job a flat pump special is usually priced against.
  const brochure = {
    ...rates(),
    tankGallons: 1000, extraTankGallons: 0, extraTankCount: 0,
    hoseFeet: 40, access: 'exposed', replaceBaffles: false, riserCount: 0,
    inspectionReport: false, afterHours: false,
  };
  // Same base stop, but a buried lid, a second tank, baffles, two risers,
  // an inspection report, and a longer hose run -- using this venture's
  // own shipped two-tank preset (heavier dump-ticket rates included).
  const twoTank = {
    ...rates(),
    tankGallons: 1250, extraTankGallons: 750, extraTankCount: 2,
    hoseFeet: 150, access: 'buried', replaceBaffles: true, riserCount: 2,
    inspectionReport: true, afterHours: false,
    dumpTripFee: 95, disposalPerGallon: 0.09, hoursBuriedLid: 1.25,
  };

  const brochureResult = calculateBid(brochure);
  assert.equal(brochureResult.totalGallons, 1000);
  assert.equal(brochureResult.totalCost.toFixed(2), '351.22');
  assert.equal(brochureResult.price.toFixed(2), '487.81');

  const twoTankResult = calculateBid(twoTank);
  assert.equal(twoTankResult.totalGallons, 2000);
  assert.equal(twoTankResult.totalCost.toFixed(2), '1419.85');
  assert.equal(twoTankResult.price.toFixed(2), '1972.02');

  assert.ok(twoTankResult.totalCost / brochureResult.totalCost > 4);
  assert.ok(brochureResult.price < twoTankResult.totalCost, "the pump special's price should quote below the two-tank job's own break-even cost");
  assert.equal((twoTankResult.totalCost - brochureResult.price).toFixed(2), '932.04');
  assert.equal((twoTankResult.price - brochureResult.price).toFixed(2), '1484.21');
  assert.equal((twoTankResult.price / brochureResult.price).toFixed(2), '4.04');

  assert.match(html, /\$351\.22/);
  assert.match(html, /\$487\.81/);
  assert.match(html, /\$1,419\.85/);
  assert.match(html, /\$1,972\.02/);
  assert.match(html, /\$932\.04/);
  assert.match(html, /\$1,484\.21/);
  assert.match(html, /4\.04/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.?\/?vs-a-flat-pump-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-pump-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-to-pump-a-septic-tank\.html"/);
});
