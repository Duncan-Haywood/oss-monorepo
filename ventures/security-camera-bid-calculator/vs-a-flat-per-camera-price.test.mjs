import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-per-camera-price.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not electrical, engineering, code, security, privacy, legal/);
});

test('names no vendor, competing calculator, or field-service platform', () => {
  // This page compares against a generic pricing habit (a flat per-camera
  // price), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Same discipline as the sibling ventures' generic-
  // method pages, and distinct from this venture's own vs-d-tools.html /
  // vs-housecall-pro.html pages.
  assert.doesNotMatch(html, /D-Tools|Housecall Pro|ServiceTitan|Workiz|ServiceMonster/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-per-camera-price\.html">/);
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

test('the worked-example figures match calc.mjs on the shipped starting example', async () => {
  const { calculateBid } = await import('./calc.mjs');

  const easy = {
    cameraCount: 8, resolution: '4mp', codec: 'h265', recordingMode: 'continuous',
    motionPercent: 25, recordHoursPerDay: 24, retentionDays: 30, driveSizeTb: 8, driveCount: 2,
    switchPoeBudgetWatts: 120, cameraWatts: 9, construction: 'attic', avgCableFeet: 120,
    longestRunFeet: 200, liftRequired: 'no', cameraHardware: 190, nvrHardware: 700,
    switchHardware: 350, drivePricePerTb: 22, cablePricePerFoot: 0.22, otherMaterials: 150,
    hoursPerDrop: '', commissioningHours: 4, otherHours: 0, hourlyWage: 38, burdenRate: 32,
    overheadRate: 12, targetMargin: 35, permitFee: 0, proposedPrice: '',
  };
  // Same 8 cameras -- "the same flat price" -- but PTZ units through masonry
  // with a lift, a PoE+ switch, and longer exterior runs instead of fixed
  // domes through an accessible attic.
  const hard = {
    ...easy,
    construction: 'masonry',
    liftRequired: 'yes',
    cameraWatts: 25,
    cameraHardware: 480,
    switchHardware: 650,
    switchPoeBudgetWatts: 250,
    avgCableFeet: 180,
    longestRunFeet: 300,
    commissioningHours: 8,
    permitFee: 150,
  };

  const easyResult = calculateBid(easy);
  assert.equal(easyResult.bidPrice.toFixed(2), '7440.38');
  assert.equal(easyResult.costFloor.toFixed(2), '4836.25');

  const hardResult = calculateBid(hard);
  assert.equal(hardResult.bidPrice.toFixed(2), '14496.86');
  assert.equal(hardResult.costFloor.toFixed(2), '9422.96');

  const flatPriceForHard = easyResult.bidPrice;
  assert.ok(flatPriceForHard < hardResult.costFloor, 'the flat price should quote below the hard job\'s own break-even cost');
  assert.equal((hardResult.costFloor - flatPriceForHard).toFixed(2), '1982.58');
  assert.equal((hardResult.bidPrice - flatPriceForHard).toFixed(2), '7056.48');
  assert.ok(hardResult.bidPrice / easyResult.bidPrice > 1.9);

  assert.match(html, /\$7,440\.38/);
  assert.match(html, /\$4,836\.25/);
  assert.match(html, /\$9,422\.96/);
  assert.match(html, /\$14,496\.86/);
  assert.match(html, /\$1,982\.58/);
  assert.match(html, /\$7,056\.48/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-per-camera-price\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-per-camera-price\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge\.html"/);
});
