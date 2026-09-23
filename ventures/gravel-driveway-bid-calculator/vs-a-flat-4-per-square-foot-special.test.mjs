import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-4-per-square-foot-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not excavation, civil, drainage, construction, legal, tax, or financial advice/);
});

test('names no vendor or competing product', () => {
  // This page compares against a generic pricing habit (a flat $4-a-square-foot
  // special), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Distinct from this venture's own vs-jobber.html, which
  // does name a product and carries its own "not affiliated" clause.
  assert.doesNotMatch(html, /Jobber/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-4-per-square-foot-special\.html">/);
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
  const { calculateBid, suggestedStoneKit, suggestedPrepKit, suggestedDeliveryKit } = await import('./calc.mjs');

  const shared = {
    hourlyWage: 24,
    burdenRate: 28,
    travelAndEquipment: 55,
    otherCost: 0,
    overheadRate: 15,
    targetMargin: 20,
    proposedPrice: null,
  };

  function buildJob({ stone, prep, delivery, ...rest }) {
    const stoneKit = suggestedStoneKit(stone);
    const prepKit = suggestedPrepKit(prep);
    const deliveryKit = suggestedDeliveryKit(delivery);
    return {
      ...shared,
      stone,
      prep,
      delivery,
      ...rest,
      ...stoneKit,
      ...prepKit,
      ...deliveryKit,
    };
  }

  // The 600 sq ft ready-grade, quarry-pickup job -- the profile a flat
  // $4-a-square-foot special is probably learned from.
  const cheap = calculateBid(buildJob({
    stone: 'crusher-run', prep: 'none', delivery: 'pickup',
    lengthFt: 50, widthFt: 12, depthIn: 4, compactionPercent: 25,
    slope: false, fabric: false, apron: false, culvert: false,
  }));
  assert.equal(cheap.areaSqFt, 600);
  assert.equal(cheap.totalHours.toFixed(1), '3.2');
  assert.equal(cheap.totalCost.toFixed(2), '623.52');
  assert.equal(cheap.price.toFixed(2), '779.40');
  assert.equal(cheap.pricePerSqFt.toFixed(2), '1.30');

  // A smaller drive, but excavate-and-haul, delivered recycled stone, a
  // sloped site, fabric, an apron, and a culvert.
  const hard = calculateBid(buildJob({
    stone: 'recycled', prep: 'excavate-haul', delivery: 'delivered',
    lengthFt: 40, widthFt: 10, depthIn: 8, compactionPercent: 30,
    slope: true, fabric: true, apron: true, culvert: true,
  }));
  assert.equal(hard.areaSqFt, 400);
  assert.equal(hard.totalHours.toFixed(1), '11.2');
  assert.equal(hard.totalCost.toFixed(2), '2788.78');
  assert.equal(hard.price.toFixed(2), '3485.97');
  assert.equal(hard.pricePerSqFt.toFixed(2), '8.71');

  // The flat $4-a-square-foot rate applied to the hard job's own area.
  const flatPriceOnHardArea = 4 * hard.areaSqFt;
  assert.equal(flatPriceOnHardArea.toFixed(2), '1600.00');
  assert.ok(
    flatPriceOnHardArea < hard.totalCost,
    'the flat-rate price should quote below the hard job\'s own break-even cost',
  );
  assert.equal((hard.totalCost - flatPriceOnHardArea).toFixed(2), '1188.78');
  assert.equal((hard.price - flatPriceOnHardArea).toFixed(2), '1885.97');

  assert.match(html, /\$779\.40/);
  assert.match(html, /\$1\.30/);
  assert.match(html, /\$2,788\.78/);
  assert.match(html, /\$3,485\.97/);
  assert.match(html, /\$8\.71/);
  assert.match(html, /\$1,600\.00/);
  assert.match(html, /\$1,188\.78/);
  assert.match(html, /\$1,885\.97/);
  assert.match(html, /3\.2 crew-hours/);
  assert.match(html, /11\.2 crew-hours/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.?\/?vs-a-flat-4-per-square-foot-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-4-per-square-foot-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-for-a-gravel-driveway\.html"/);
});
