import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-rate-per-square.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or engineering advice/i);
});

test('names no vendor, competing calculator, or field-service platform', () => {
  // This page compares against a generic pricing habit (a flat rate per
  // square), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Distinct from this venture's own vs-jobnimbus.html,
  // which names JobNimbus specifically.
  assert.doesNotMatch(html, /JobNimbus/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-rate-per-square\.html">/);
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

test('the worked-example figures match calc.mjs on a one-story vinyl wrap and a two-story fiber-cement tear-off', async () => {
  const { calculateBid, MATERIAL_PRESETS } = await import('./calc.mjs');

  const vinyl = MATERIAL_PRESETS.find((m) => m.id === 'vinyl');
  const fiberCement = MATERIAL_PRESETS.find((m) => m.id === 'fiber-cement');

  const common = {
    hourlyWage: 32, burdenRate: 34, milesOneWay: 14, speedMph: 35,
    setupHours: 0.75, minOnSiteHours: 4, tripFee: 85, otherCost: 0,
    overheadRate: 18, targetMargin: 28,
  };

  // The coupon: a one-story vinyl wrap with no tear-off -- the job a flat
  // per-square rate is usually set on.
  const small = calculateBid({
    ...common,
    walls: [
      { name: 'Front elevation', lengthFt: 30, heightFt: 9 },
      { name: 'Rear elevation', lengthFt: 30, heightFt: 9 },
      { name: 'Left elevation', lengthFt: 20, heightFt: 9 },
      { name: 'Right elevation', lengthFt: 20, heightFt: 9 },
    ],
    openingSqFt: 90, openingCount: 8,
    wastePercent: vinyl.wastePercent, hoursPerSquare: vinyl.hoursPerSquare,
    materialPerSquare: vinyl.materialPerSquare, tearOffHoursPerSquare: vinyl.tearOffHoursPerSquare,
    stories: 1, tearOff: false, housewrap: false, housewrapPerSqFt: 0.38,
    accessories: [
      { id: 'starter', label: 'Starter strip', linearFeet: 100, hoursPer100Lf: 0.4, materialPerLf: 1.15 },
      { id: 'outsideCorner', label: 'Outside corners', linearFeet: 40, hoursPer100Lf: 0.65, materialPerLf: 4.75 },
      { id: 'jChannel', label: 'J-channel / window wrap', linearFeet: 90, hoursPer100Lf: 0.5, materialPerLf: 1.45 },
      { id: 'undersill', label: 'Undersill / utility trim', linearFeet: 16, hoursPer100Lf: 0.4, materialPerLf: 1.3 },
    ],
    dumpsterCost: 0,
  });

  // A two-story fiber-cement tear-off with housewrap and heavier trim.
  const big = calculateBid({
    ...common,
    walls: [
      { name: 'Front elevation', lengthFt: 40, heightFt: 18 },
      { name: 'Rear elevation', lengthFt: 40, heightFt: 10 },
      { name: 'Left gable', lengthFt: 28, heightFt: 14 },
      { name: 'Right gable', lengthFt: 28, heightFt: 14 },
    ],
    openingSqFt: 180, openingCount: 12,
    wastePercent: fiberCement.wastePercent, hoursPerSquare: fiberCement.hoursPerSquare,
    materialPerSquare: fiberCement.materialPerSquare, tearOffHoursPerSquare: fiberCement.tearOffHoursPerSquare,
    stories: 2, tearOff: true, housewrap: true, housewrapPerSqFt: 0.38,
    accessories: [
      { id: 'starter', label: 'Starter strip', linearFeet: 136, hoursPer100Lf: 0.4, materialPerLf: 1.15 },
      { id: 'outsideCorner', label: 'Outside corners', linearFeet: 72, hoursPer100Lf: 0.65, materialPerLf: 4.75 },
      { id: 'insideCorner', label: 'Inside corners', linearFeet: 28, hoursPer100Lf: 0.5, materialPerLf: 3.9 },
      { id: 'jChannel', label: 'J-channel / window wrap', linearFeet: 220, hoursPer100Lf: 0.5, materialPerLf: 1.45 },
      { id: 'undersill', label: 'Undersill / utility trim', linearFeet: 40, hoursPer100Lf: 0.4, materialPerLf: 1.3 },
    ],
    dumpsterCost: 525,
  });

  const money = (value) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  assert.equal(money(small.totalCost), '4,892.04');
  assert.equal(money(small.price), '6,794.49');
  assert.equal(money(small.pricePerSquare), '762.57');
  assert.equal(small.billableSquares.toFixed(2), '8.91');

  assert.equal(money(big.totalCost), '22,874.89');
  assert.equal(money(big.price), '31,770.68');
  assert.equal(big.billableSquares.toFixed(2), '19.31');

  const flatQuoteForBig = small.pricePerSquare * big.billableSquares;
  assert.equal(money(flatQuoteForBig), '14,724.30');
  assert.ok(flatQuoteForBig < big.totalCost, 'the flat quote should not clear break-even in this worked example');
  assert.equal(money(big.totalCost - flatQuoteForBig), '8,150.59');

  const ratio = big.price / small.price;
  assert.equal(ratio.toFixed(2), '4.68');
  assert.equal((big.billableSquares / small.billableSquares).toFixed(2), '2.17');

  for (const figure of [
    '$4,892.04', '$6,794.49', '$762.57', '8.91 billable squares',
    '$22,874.89', '$31,770.68', '19.31 billable squares',
    '$14,724.30', '$8,150.59',
    '4.68 times', '2.17 times',
  ]) {
    assert.ok(html.includes(figure), `worked-example figure ${figure} not found verbatim on the page`);
  }
});

test('links back to the calculator and the guide, and is linked from the index page', () => {
  assert.match(html, /<a href="\.\/">Siding Bid Calculator<\/a>/);
  assert.match(html, /<a href="\.\/how-much-to-charge\.html">how much should I charge for vinyl siding<\/a>/);
  assert.match(indexHtml, /vs-a-flat-rate-per-square\.html/);
});

test('is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-rate-per-square\.html/);
});

test('has no external script or stylesheet resources', () => {
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"/i);
  const externalHrefs = [...html.matchAll(/https?:\/\/[^"'\s)]+/g)].map((m) => m[0]);
  for (const href of externalHrefs) {
    assert.ok(
      href.startsWith('https://schema.org') || href === 'http://www.w3.org/2000/svg',
      `unexpected external reference: ${href}`,
    );
  }
});
