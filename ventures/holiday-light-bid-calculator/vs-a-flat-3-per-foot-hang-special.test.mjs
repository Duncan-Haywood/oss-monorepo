import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-3-per-foot-hang-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not electrical, lighting-design, building-code, legal, tax, or financial advice/i);
});

test('names no vendor or competing calculator', () => {
  // This page compares against a generic pricing habit (a flat "$3 a foot,
  // hang-only" flyer rate), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Pinning the absence of a competitor name here is what
  // keeps that exemption honest. vs-realgreen.html already carries this
  // venture's one named-product comparison and its own trademark disclaimer.
  assert.doesNotMatch(html, /RealGreen/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-3-per-foot-hang-special\.html">/);
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

test('the worked-example figures match calc.mjs on the shipped default shop rates and built-in job presets', async () => {
  const {
    calculateBid, suggestedScopeKit, suggestedStoryKit, suggestedTypeKit, suggestedExtraKit, JOB_PRESETS,
  } = await import('./calc.mjs');

  // The shipped index.html default shop-cost fields: applyJob() in index.html
  // only force-applies the raw job fields plus the suggested scope/story/type/
  // extra kits -- it never overwrites hourlyWage, burdenRate,
  // travelAndEquipment, otherCost, overheadRate, or targetMargin.
  const shopDefaults = {
    hourlyWage: 32, burdenRate: 30, travelAndEquipment: 55, otherCost: 0,
    overheadRate: 15, targetMargin: 20,
  };

  function priceJob(preset) {
    const scopeKit = suggestedScopeKit(preset.scope);
    const storyKit = suggestedStoryKit(preset.stories);
    const typeKit = suggestedTypeKit(preset.lightType);
    const extraKit = suggestedExtraKit();
    return calculateBid({ ...preset, ...shopDefaults, ...scopeKit, ...storyKit, ...typeKit, ...extraKit });
  }

  const ranch = JOB_PRESETS[0];
  assert.match(ranch.label, /the cheap special/);
  const bidRanch = priceJob(ranch);
  assert.equal(bidRanch.totalCost.toFixed(2), '431.54');
  assert.equal(bidRanch.price.toFixed(2), '539.43');
  assert.equal(bidRanch.totalHours.toFixed(2), '7.16');
  assert.equal(bidRanch.laborCost.toFixed(2), '297.86');
  assert.equal(bidRanch.materialCost.toFixed(2), '22.40');
  assert.equal(bidRanch.loadedWage.toFixed(2), '41.60');

  const colonial = JOB_PRESETS[2];
  assert.match(colonial.label, /Two-story colonial, C9 \+ trees \+ take-down/);
  const bidColonial = priceJob(colonial);
  assert.equal(bidColonial.totalCost.toFixed(2), '1928.98');
  assert.equal(bidColonial.price.toFixed(2), '2411.23');
  assert.equal(bidColonial.totalHours.toFixed(2), '26.02');
  assert.equal(bidColonial.laborCost.toFixed(2), '1082.58');
  assert.equal(bidColonial.materialCost.toFixed(2), '539.80');

  const flatRate = 3;
  const flatRanch = ranch.eaveLf * flatRate;
  const flatColonial = colonial.eaveLf * flatRate;
  assert.equal(flatRanch.toFixed(2), '420.00');
  assert.equal(flatColonial.toFixed(2), '540.00');

  assert.ok(flatRanch < bidRanch.totalCost, 'the flat special should fall short of total cost even on the ranch');
  assert.equal((bidRanch.totalCost - flatRanch).toFixed(2), '11.54');
  assert.ok(flatRanch > bidRanch.laborCost, 'the flat special should still clear loaded labor on the ranch');

  assert.ok(flatColonial < bidColonial.totalCost, 'the flat special should fall well short of total cost on the harder job');
  assert.equal((bidColonial.totalCost - flatColonial).toFixed(2), '1388.98');
  assert.ok(flatColonial < bidColonial.laborCost, 'the flat special should not even clear loaded labor on the harder job');
  assert.equal((bidColonial.laborCost - flatColonial).toFixed(2), '542.58');

  assert.equal((bidColonial.price - bidRanch.price).toFixed(2), '1871.80');
  assert.equal((flatRanch / bidRanch.totalHours).toFixed(2), '58.66');
  assert.equal((flatColonial / bidColonial.totalHours).toFixed(2), '20.75');

  assert.ok(flatColonial / bidColonial.totalHours < bidColonial.loadedWage / 2 + 1, 'the colonial effective rate should sit near half the loaded wage');

  for (const figure of ['$420.00', '$540.00', '$431.54', '$539.43', '$297.86', '$22.40', '$1,928.98', '$2,411.23', '$1,082.58', '$539.80', '$11.54', '$1,388.98', '$542.58', '$1,871.80', '$58.66', '$20.75', '$41.60']) {
    assert.ok(html.includes(figure), `worked-example figure ${figure} is missing from the page`);
  }
  assert.match(html, /&minus;\$11\.54|-\$11\.54/, 'the $11.54 shortfall on the ranch is missing from the page');
  assert.match(html, /&minus;\$1,388\.98|-\$1,388\.98/, 'the $1,388.98 shortfall on the harder job is missing from the page');
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-3-per-foot-hang-special\.html"|href="vs-a-flat-3-per-foot-hang-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-3-per-foot-hang-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-to-hang-christmas-lights\.html"/);
});

test('this generic-method page is registered as disclaimer-exempt and within the surface budget', async () => {
  const { COMPARISON_DISCLAIMER_EXEMPT } = await import('../../platform/pages/clauses.mjs');
  assert.ok(
    COMPARISON_DISCLAIMER_EXEMPT.has('holiday-light-bid-calculator/vs-a-flat-3-per-foot-hang-special.html'),
    'vs-a-flat-3-per-foot-hang-special.html must be registered in COMPARISON_DISCLAIMER_EXEMPT so it counts as generic-method, not named-product',
  );
});
