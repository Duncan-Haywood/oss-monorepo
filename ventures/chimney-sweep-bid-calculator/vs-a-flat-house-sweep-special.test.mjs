import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-house-sweep-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, engineering, or fire-safety advice/i);
});

// This page compares against a generic pricing method (a flat house-sweep
// special), not a named competitor, so it names no company and carries no
// affiliation disclaimer -- unlike vs-jobber.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /Jobber|Housecall Pro|ServiceTitan|Workiz|ServiceMonster/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-house-sweep-special\.html">/);
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

// The JSON-LD text and the visible prose must read as the same string once
// HTML entities are decoded (the visible prose spells the em dash as
// &mdash;, matching the venture's own convention; JSON-LD spells it as the
// literal character), or faq-visible.test.mjs's punctuation-diff check fails
// the build -- pin it here too so a future edit to one side alone is caught
// locally.
test('the FAQPage JSON-LD answers are verbatim on the page (entities decoded)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  const decoded = html.replace(/&mdash;/g, '—').replace(/&rsquo;/g, '’');
  for (const question of schema.mainEntity) {
    const answer = question.acceptedAnswer.text;
    assert.ok(decoded.includes(answer), `answer for "${question.name}" is not verbatim in the visible page`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-house-sweep-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-house-sweep-special\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="index\.html">/);
});

// The worked-example table figures are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's presets or defaults ever
// change, this page's numbers must be re-derived, not left stale.
test('the worked-example table figures match calc.mjs run against the shipped presets and defaults', async () => {
  const { calculateBid, FLUE_PRESETS } = await import('./calc.mjs');

  // The form's own shipped defaults (index.html), not numbers invented for
  // this page.
  const rates = {
    hourlyWage: 28,
    burdenRate: 32,
    milesOneWay: 12,
    speedMph: 35,
    setupHours: 0.25,
    minOnSiteHours: 1,
    tripFee: 45,
    consumablesPerFlue: 8,
    chemicalPerGlazedFlue: 18,
    otherCost: 0,
    overheadRate: 18,
    targetMargin: 30,
  };

  function flue(id, quantity = 1) {
    const preset = FLUE_PRESETS.find((item) => item.id === id);
    return { name: preset.label, quantity, hoursEach: preset.hoursEach };
  }

  const gasEasy = calculateBid({
    ...rates,
    flues: [flue('gas-fireplace')],
    stories: 1,
    roofAccess: 'easy',
    creosote: 'light',
    workType: 'sweep',
    animalRemoval: false,
  });

  // The calculator's own shipped index.html defaults: stories=2,
  // roofAccess=steep, creosote=moderate, workType=sweep, wood-fireplace flue.
  const defaultJob = calculateBid({
    ...rates,
    flues: [flue('wood-fireplace')],
    stories: 2,
    roofAccess: 'steep',
    creosote: 'moderate',
    workType: 'sweep',
    animalRemoval: false,
  });

  const woodStoveHard = calculateBid({
    ...rates,
    flues: [flue('wood-stove')],
    stories: 3,
    roofAccess: 'snow',
    creosote: 'glazed',
    workType: 'level2',
    animalRemoval: true,
  });

  assert.equal(gasEasy.totalCost.toFixed(2), '136.06');
  assert.equal(defaultJob.totalCost.toFixed(2), '193.30');
  assert.equal(woodStoveHard.totalCost.toFixed(2), '366.12');

  assert.match(html, /\$136\.06/);
  assert.match(html, /\$193\.30/);
  assert.match(html, /\$366\.12/);

  // The $199 flat-rate special shown is the venture's own headline anchor
  // (this venture's own how-much-to-charge.html and index.html both already
  // name "$199 special" as the postcard rate a flat quote loses money on).
  assert.match(html, /\$199\.00/);
  assert.match(html, /\$62\.94/);
  assert.match(html, /\$5\.70/);
  assert.match(html, /\$167\.12/);
});
