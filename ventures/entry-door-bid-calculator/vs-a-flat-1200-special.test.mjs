import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-1200-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, legal, tax, financial, or engineering advice/i);
});

test('names no vendor or competing calculator', () => {
  // This page compares against a generic pricing habit (a flat "$1,200
  // installed" special), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Pinning the absence of a competitor name here is what
  // keeps that exemption honest. vs-jobber.html already carries this
  // venture's one named-product comparison and its own trademark disclaimer.
  assert.doesNotMatch(html, /Jobber|ServiceTitan|ServiceMonster/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-1200-special\.html">/);
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
  const { calculateBid, suggestedConfigKit, suggestedMaterialKit, suggestedHangStyleKit, suggestedStoryKit, JOB_PRESETS } = await import('./calc.mjs');

  // The shipped index.html default shop-cost and non-kit structural fields:
  // selecting a built-in job preset never overwrites these -- applyJob() in
  // index.html only sets config/material/hangStyle/stories (which force the
  // suggested*Kit values) plus rotFeet/outOfSquare/addTransom/addBrickmold/
  // addStormDoor/addSmartLock/addPaint/tearOut.
  const shopDefaults = {
    hoursTrip: 1, hoursOutOfSquare: 1.5, hoursPerRotFoot: 0.45, hoursTransom: 1.25, hoursBrickmold: 1.2,
    hoursStormDoor: 1.5, hoursSmartLock: 0.6, hoursTearOut: 1, siteHours: 0.5,
    transomCost: 220, brickmoldCost: 85, stormDoorCost: 280, lockCost: 95, paintMaterial: 48,
    rotPerFoot: 14, dumpFee: 45, permitFee: 0,
    hourlyWage: 42, burdenRate: 32, travelAndEquipment: 85, overheadRate: 16, targetMargin: 32,
  };

  function priceJob(preset) {
    const configKit = suggestedConfigKit(preset.config);
    const materialKit = suggestedMaterialKit(preset.material);
    const hangKit = suggestedHangStyleKit(preset.hangStyle);
    const storyKit = suggestedStoryKit(preset.stories);
    // Kit values (including hoursPaint, which suggestedConfigKit sets) must
    // win over shopDefaults, matching applyJob()'s force-apply order.
    return calculateBid({ ...preset, ...shopDefaults, ...configKit, ...materialKit, ...hangKit, ...storyKit });
  }

  const cheap = JOB_PRESETS[0];
  assert.match(cheap.label, /the \$1,200 installed special/);
  const bidCheap = priceJob(cheap);
  assert.equal(bidCheap.totalCost.toFixed(2), '959.55');
  assert.equal(bidCheap.price.toFixed(2), '1411.11');
  assert.equal(bidCheap.totalHours.toFixed(2), '5.00');
  assert.equal(bidCheap.materialCost.toFixed(2), '465.00');

  const hard = JOB_PRESETS[2];
  assert.match(hard.label, /Fiberglass \+ two sidelights \+ transom/);
  const bidHard = priceJob(hard);
  assert.equal(bidHard.totalCost.toFixed(2), '4942.35');
  assert.equal(bidHard.price.toFixed(2), '7268.16');
  assert.equal(bidHard.totalHours.toFixed(2), '21.35');
  assert.equal(bidHard.materialCost.toFixed(2), '2992.00');

  const flatSpecial = 1200;
  assert.ok(flatSpecial > bidCheap.totalCost, 'the flat special should clear cost on the job it was built for');
  assert.equal((flatSpecial - bidCheap.totalCost).toFixed(2), '240.45');
  assert.equal((bidCheap.price - flatSpecial).toFixed(2), '211.11');

  assert.ok(flatSpecial < bidHard.totalCost, 'the flat special should quote below the harder job\'s own break-even cost');
  assert.equal((bidHard.totalCost - flatSpecial).toFixed(2), '3742.35');
  assert.equal((bidHard.price - flatSpecial).toFixed(2), '6068.16');
  assert.equal((bidHard.price - bidCheap.price).toFixed(2), '5857.05');

  assert.equal((flatSpecial / bidCheap.totalHours).toFixed(2), '240.00');
  assert.equal((flatSpecial / bidHard.totalHours).toFixed(2), '56.21');

  for (const figure of ['$959.55', '$1,411.11', '$465.00', '$4,942.35', '$7,268.16', '$2,992.00', '$240.45', '$5,857.05', '$240.00', '$56.21']) {
    assert.ok(html.includes(figure), `worked-example figure ${figure} is missing from the page`);
  }
  assert.match(html, /&minus;\$3,742\.35|-\$3,742\.35/, 'the $3,742.35 shortfall on the harder job is missing from the page');
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-1200-special\.html"|href="vs-a-flat-1200-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-1200-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-to-replace-a-front-door\.html"/);
});
