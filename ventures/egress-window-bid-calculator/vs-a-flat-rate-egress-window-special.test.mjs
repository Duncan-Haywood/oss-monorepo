import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-rate-egress-window-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not building-code, egress-size, foundation-design, waterproofing, legal, tax, or financial advice/i);
});

// This page compares against a generic pricing method (a flat special), not
// a named competitor, so it names no company and carries no affiliation
// disclaimer -- unlike vs-jobnimbus.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /JobNimbus|ServiceTitan|Housecall|Jobber|Workiz|FieldEdge/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-rate-egress-window-special\.html">/);
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
  assert.match(indexHtml, /href="vs-a-flat-rate-egress-window-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-rate-egress-window-special\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="index\.html">/);
});

// The three worked-example rows are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's defaults or presets ever
// change, this page's numbers must be re-derived, not left stale.
test('the worked-example table figures match calc.mjs run against the shipped presets and defaults', async () => {
  const {
    calculateBid,
    suggestedScopeKit,
    suggestedWindowKit,
    suggestedWellKit,
    suggestedExtraKit,
    JOB_PRESETS,
  } = await import('./calc.mjs');

  const rates = { hourlyWage: 42, burdenRate: 30, overheadRate: 15, targetMargin: 20, travelAndEquipment: 95, otherCost: 0 };

  function priceJob(preset) {
    return calculateBid({
      ...preset,
      ...rates,
      ...suggestedScopeKit(preset.scope),
      ...suggestedWindowKit(preset.window),
      ...suggestedWellKit(preset.well),
      ...suggestedExtraKit(),
    });
  }

  const cheap = priceJob(JOB_PRESETS[0]);
  const typical = priceJob(JOB_PRESETS[1]);
  const losing = priceJob(JOB_PRESETS[2]);

  assert.equal(cheap.price.toFixed(2), '1662.19');
  assert.equal(typical.price.toFixed(2), '3976.62');
  assert.equal(losing.price.toFixed(2), '7315.25');

  assert.match(html, /\$1,662\.19/);
  assert.match(html, /\$3,976\.62/);
  assert.match(html, /\$7,315\.25/);
});
