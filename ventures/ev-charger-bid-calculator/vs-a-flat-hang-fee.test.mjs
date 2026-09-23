import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-hang-fee.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not electrical, engineering, code, legal, tax, or financial advice/i);
  assert.match(html, /not a permit load calculation/i);
  assert.match(html, /does not determine NEC or local-code compliance/i);
});

test('names no vendor, competing calculator, or field-service platform', () => {
  // This page compares against a generic pricing habit (a flat hang fee),
  // not a named product, so it is listed in platform/pages/clauses.mjs's
  // COMPARISON_DISCLAIMER_EXEMPT rather than carrying a "not affiliated"
  // clause -- there is no company to disclaim a relationship with. Pinning
  // the absence of a competitor name here is what keeps that exemption
  // honest, the same discipline vs-a-flat-rate-per-square-foot.test.mjs
  // uses on artificial-turf-bid-calculator.
  assert.doesNotMatch(html, /ServiceTitan|Workiz|Jobber/i);
});

test('the canonical tag names this file', () => {
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/example\.invalid\/ev-charger-bid-calculator\/vs-a-flat-hang-fee\.html">/,
  );
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

test('the worked-example figures match calc.mjs on the shipped defaults', async () => {
  const { calculateBid, defaultInputs } = await import('./calc.mjs');

  const indoorJob = calculateBid(defaultInputs());
  assert.equal(indoorJob.price.toFixed(2), '1263.36');
  assert.equal(indoorJob.breakEvenPrice.toFixed(2), '947.52');

  const detachedJob = calculateBid({
    ...defaultInputs(),
    runFeet: 70,
    trenchFeet: 70,
    location: 'detached_garage',
    panelWork: 'service_upgrade',
    existingServiceAmps: 200,
    estimatedExistingLoad: 160,
  });
  assert.equal(detachedJob.price.toFixed(2), '4832.10');
  assert.equal(detachedJob.breakEvenPrice.toFixed(2), '3624.07');

  // Applying the indoor job's own flat price to the detached job, the way a
  // "$X to install an EV charger" flat hang fee is applied regardless of
  // run, trench, or panel work.
  const flatFeeForDetached = indoorJob.price;
  assert.ok(flatFeeForDetached < detachedJob.breakEvenPrice, 'the flat fee should quote below the detached job\'s own break-even cost');
  assert.equal((detachedJob.breakEvenPrice - flatFeeForDetached).toFixed(2), '2360.71');
  assert.equal((detachedJob.price - flatFeeForDetached).toFixed(2), '3568.74');
  assert.equal((detachedJob.price / indoorJob.price).toFixed(2), '3.82');

  assert.match(html, /\$1,263\.36/);
  assert.match(html, /\$947\.52/);
  assert.match(html, /\$4,832\.10/);
  assert.match(html, /\$3,624\.07/);
  assert.match(html, /\$2,360\.71/);
  assert.match(html, /\$3,568\.74/);
  assert.match(html, /3\.82/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-hang-fee\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-hang-fee\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge\.html"/);
});
