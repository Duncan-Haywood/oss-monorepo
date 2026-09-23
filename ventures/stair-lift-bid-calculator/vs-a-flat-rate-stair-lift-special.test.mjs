import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-rate-stair-lift-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not electrical, structural, accessibility, legal, tax, or financial advice/i);
});

// This page compares against a generic pricing method (a flat installed
// special), not a named competitor, so it names no company and carries no
// affiliation disclaimer -- unlike vs-autovu.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /AutoVu|Acorn|Bruno|Stannah|ThyssenKrupp/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-rate-stair-lift-special\.html">/);
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

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-rate-stair-lift-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-rate-stair-lift-special\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="index\.html">/);
});

// The worked-example table figures are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's kits or presets ever change,
// this page's numbers must be re-derived, not left stale.
test('the worked-example table figures match calc.mjs run against the shipped presets and defaults', async () => {
  const {
    calculateBid,
    suggestedRailKit,
    suggestedChairKit,
    suggestedAttachKit,
    suggestedExtraKit,
    JOB_PRESETS,
  } = await import('./calc.mjs');

  const rates = { hourlyWage: 42, burdenRate: 30, overheadRate: 15, targetMargin: 20, travelAndEquipment: 95, otherCost: 0 };

  function priceJob(preset) {
    return calculateBid({
      ...preset,
      ...rates,
      ...suggestedRailKit(preset.rail),
      ...suggestedChairKit(preset.chair),
      ...suggestedAttachKit(preset.attach),
      ...suggestedExtraKit(),
    });
  }

  const cheap = priceJob(JOB_PRESETS[0]);
  const typical = priceJob(JOB_PRESETS[1]);
  const losing = priceJob(JOB_PRESETS[2]);

  assert.equal(cheap.liftCount, 1);
  assert.equal(typical.liftCount, 1);
  assert.equal(losing.liftCount, 1);

  assert.equal(cheap.totalCost.toFixed(2), '4266.69');
  assert.equal(typical.totalCost.toFixed(2), '6846.45');
  assert.equal(losing.totalCost.toFixed(2), '16643.33');

  assert.match(html, /\$4,266\.69/);
  assert.match(html, /\$6,846\.45/);
  assert.match(html, /\$16,643\.33/);

  // The $3,995 flat-rate special shown is the venture's own headline anchor
  // (JOB_PRESETS and the code comment both name "$3,995 installed").
  assert.match(html, /\$3,995\.00/);
});
