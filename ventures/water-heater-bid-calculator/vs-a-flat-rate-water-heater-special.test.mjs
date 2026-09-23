import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-rate-water-heater-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not plumbing, electrical, engineering, code, legal, tax, or financial advice/i);
});

test('names no competitor product or company', () => {
  // This page compares against a generic pricing habit (a flat installed
  // special), not a named competitor, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Same discipline as the sibling ventures' generic-method
  // pages, and distinct from this venture's own vs-servicetitan.html, which
  // names a competitor and carries a trademark disclaimer.
  assert.doesNotMatch(html, /ServiceTitan|Housecall|Jobber|Workiz|FieldEdge|ServiceMonster/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-rate-water-heater-special\.html">/);
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
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the worked-example figures match calc.mjs on the venture\'s own shipped defaults', async () => {
  const { calculateBid, defaultInputs } = await import('./calc.mjs');
  const easyInputs = () => ({ ...defaultInputs(), proposedPrice: '' });

  // The easy job: the calculator's own shipped defaults -- a 50-gallon
  // electric tank in a garage, existing circuit reused, no vent, no gas
  // work. This is the job a flat "$1,200 water heater installed" special is
  // usually priced on.
  const easy = calculateBid(easyInputs());
  assert.equal(easy.price.toFixed(2), '1035.40');
  assert.equal(easy.totalCost.toFixed(2), '776.55');
  assert.equal(easy.breakEvenPrice.toFixed(2), '776.55');

  // The hard job: same house, a condensing gas tankless carried into the
  // attic on a 3/4-inch gas-line upsize, with a concentric sidewall vent, a
  // drip pan, a condensate line, and tankless service valves -- the scope a
  // flat rate has no line for.
  const hard = calculateBid({
    ...easyInputs(),
    heaterType: 'tankless_gas',
    location: 'attic',
    venting: 'concentric_condensing',
    ventFeet: 15,
    gasLine: 'upsize_3_4',
    gasLineFeet: 20,
    electrical: 'existing_ok',
    expansionTank: 0,
    dripPan: 1,
    condensate: 1,
    recirc: 0,
    haulAway: 1,
    isolationValves: 1,
  });
  assert.equal(hard.price.toFixed(2), '3979.33');
  assert.equal(hard.totalCost.toFixed(2), '2984.49');

  const flatRateForHard = easy.price;
  assert.equal(flatRateForHard.toFixed(2), '1035.40');
  assert.ok(flatRateForHard < hard.totalCost, 'the flat rate should quote below the attic tankless job\'s own break-even cost');
  assert.equal((hard.totalCost - flatRateForHard).toFixed(2), '1949.09');
  assert.equal((hard.price - flatRateForHard).toFixed(2), '2943.93');
  assert.ok(hard.price / easy.price > 3.5);

  assert.match(html, /\$1,035\.40/);
  assert.match(html, /\$776\.55/);
  assert.match(html, /\$2,984\.49/);
  assert.match(html, /\$3,979\.33/);
  assert.match(html, /\$1,949\.09/);
  assert.match(html, /\$2,943\.93/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-rate-water-heater-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-rate-water-heater-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge\.html"/);
});
