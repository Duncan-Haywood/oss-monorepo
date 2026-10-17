import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-per-acre-quote.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not aviation, legal, safety, surveying or financial advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no vendor or competing platform', () => {
  // This page compares against a generic pricing habit (a flat rate per
  // acre), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Distinct from this venture's own vs-dronedeploy.html,
  // which names a specific platform and carries that clause instead. Same
  // discipline as land-survey-bid-calculator's and lawn-care-bid-calculator's
  // own vs-a-flat-per-acre-quote.html / vs-a-flat-rate-per-acre.html.
  assert.doesNotMatch(html, /DroneDeploy|Pix4D|Agisoft|DJI Terra/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-per-acre-quote\.html">/);
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

test('the worked-example figures match calc.mjs on the shipped 100-acre example', async () => {
  const { priceJob, money } = await import('./calc.mjs');

  const base = {
    areaAcres: 100,
    sensorWidthMm: 17.3, focalLengthMm: 12.29, imageWidthPx: 5280, imageHeightPx: 3956,
    altitudeM: 120, frontOverlapPct: 70, sideOverlapPct: 70,
    speedMs: 10, usableBatteryMin: 25, batteryCount: 4, turnSeconds: 8,
    gcpCount: 5, gcpMinutesEach: 6,
    setupMinutes: 30, swapMinutes: 4, travelMinutes: 60, travelMiles: 45, mileageRate: 0.7,
    fieldHourlyRate: 125, processingHourlyRate: 95, secondsPerImage: 9, targetMarginPct: 40,
  };

  // 70/70 is the flight the shipped index.html example ships and the one
  // JOB the flat per-acre rate below is fit to.
  const at70 = priceJob(base);
  assert.equal(money(at70.price), '$618.72');
  assert.equal(money(at70.pricePerAcre), '$6.19');
  assert.equal(at70.totalPhotos, 234);

  // The identical 100-acre site, flown at 80/80 instead. Acreage is
  // unchanged, so a flat per-acre rate fit to the 70/70 flight quotes it
  // identically -- the gap this page exists to show.
  const at80 = priceJob({ ...base, frontOverlapPct: 80, sideOverlapPct: 80 });
  assert.equal(money(at80.price), '$754.03');
  assert.equal(at80.totalPhotos, 513);
  assert.equal((at80.totalPhotos / at70.totalPhotos).toFixed(2), '2.19');

  const flatRatePerAcre = at70.pricePerAcre;
  const flatQuoteOn80 = flatRatePerAcre * base.areaAcres; // same acreage
  assert.equal(money(flatQuoteOn80), money(at70.price));
  assert.equal(money(at80.price - flatQuoteOn80), '$135.30');

  const realizedMarginPct = ((flatQuoteOn80 - at80.totalCost) / flatQuoteOn80) * 100;
  assert.equal(realizedMarginPct.toFixed(1), '26.9');

  assert.match(html, /\$618\.72/);
  assert.match(html, /\$6\.19/);
  assert.match(html, /\$754\.03/);
  assert.match(html, /\$135\.30/);
  assert.match(html, /2\.19/);
  assert.match(html, /26\.9%/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.?\/?vs-a-flat-per-acre-quote\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-per-acre-quote\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/how-much-to-charge-for-drone-mapping\.html"/);
});
