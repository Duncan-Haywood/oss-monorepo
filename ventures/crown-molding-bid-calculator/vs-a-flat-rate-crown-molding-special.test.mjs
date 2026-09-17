import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-rate-crown-molding-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not millwork, structural, paint-spec, legal, tax, or financial advice/i);
});

// This page compares against a generic pricing method (a flat per-foot
// special), not a named competitor, so it names no company and carries no
// affiliation disclaimer -- unlike vs-jobber.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /Jobber|ServiceTitan|Housecall|Workiz|FieldEdge|JobNimbus/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-rate-crown-molding-special\.html">/);
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
  assert.match(indexHtml, /href="vs-a-flat-rate-crown-molding-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-rate-crown-molding-special\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="index\.html">/);
});

// The worked-example table figures are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's kits or presets ever change,
// this page's numbers must be re-derived, not left stale. Same rates and
// presets the venture's own should-i-charge-8-a-foot-for-crown-molding.html
// guide page already pins, so both pages stay consistent with each other.
test('the worked-example table figures match calc.mjs run against the shipped presets and defaults', async () => {
  const {
    calculateBid,
    suggestedGradeKit,
    suggestedProfileKit,
    suggestedCeilingKit,
    suggestedHeightKit,
    suggestedExtraKit,
    JOB_PRESETS,
  } = await import('./calc.mjs');

  const rates = { hourlyWage: 42, burdenRate: 32, overheadRate: 15, targetMargin: 20, travelAndEquipment: 65, otherCost: 0 };

  function priceJob(preset) {
    return calculateBid({
      ...preset,
      ...rates,
      ...suggestedGradeKit(preset.grade),
      ...suggestedProfileKit(preset.profile),
      ...suggestedCeilingKit(preset.ceiling),
      ...suggestedHeightKit(preset.height),
      ...suggestedExtraKit(),
    });
  }

  const cheap = priceJob(JOB_PRESETS[0]);
  const typical = priceJob(JOB_PRESETS[1]);
  const losing = priceJob(JOB_PRESETS[3]);

  assert.equal(cheap.linearFeet, 80);
  assert.equal(typical.linearFeet, 180);
  assert.equal(losing.linearFeet, 80);

  assert.equal(cheap.totalCost.toFixed(2), '1182.95');
  assert.equal(typical.totalCost.toFixed(2), '3302.54');
  assert.equal(losing.totalCost.toFixed(2), '7710.87');

  assert.match(html, /\$1,182\.95/);
  assert.match(html, /\$3,302\.54/);
  assert.match(html, /\$7,710\.87/);

  // The $8/ft flat-rate quotes shown are linear feet times $8, the same
  // headline anchor the venture's PROFILE_PRESETS already names ("the
  // cheap $8/ft special").
  assert.match(html, /\$640\.00/);
  assert.match(html, /\$1,440\.00/);
});
