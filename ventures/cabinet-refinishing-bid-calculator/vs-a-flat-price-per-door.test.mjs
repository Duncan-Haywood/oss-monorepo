import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-price-per-door.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not painting, construction, legal, tax, or financial advice/i);
});

test('names no vendor, competing calculator, or platform', () => {
  // This page compares against a generic pricing habit (a flat price per
  // door), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Pinning the absence of a competitor name here is what
  // keeps that exemption honest, the same discipline the sibling
  // kitchen-tile-backsplash-bid-calculator and asphalt-sealcoat-bid-calculator
  // generic-method pages use.
  assert.doesNotMatch(html, /Kickserv|Jobber|ServiceTitan|ServiceMonster/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-price-per-door\.html">/);
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

test('the worked-example figures match calc.mjs on the shipped presets', async () => {
  const { calculateBid, suggestedLaborFactor, suggestedExtraCoats, JOB_PRESETS } = await import('./calc.mjs');

  const defaults = {
    hoursPerDoor: 1.35, hoursPerDrawer: 0.75, hoursPerOpening: 0.65, hoursPerHardware: 0.09,
    extraCoatHoursPerPiece: 0.22, primerCoverage: 22, finishCoverage: 18, primerCost: 48, finishCost: 68,
    supplies: 85, hardwareCost: 8, hourlyWage: 38, burdenRate: 30, travelAndEquipment: 275,
    overheadRate: 15, targetMargin: 25,
  };

  function build(preset) {
    return {
      doors: preset.doors,
      drawers: preset.drawers,
      openings: preset.openings,
      hardwarePieces: preset.hardwarePieces,
      finishLaborFactor: suggestedLaborFactor(preset.finishId),
      extraCoats: suggestedExtraCoats(preset.colorId),
      degreaseHours: preset.degreaseHours,
      replaceHardware: preset.replaceHardware,
      ...defaults,
    };
  }

  // JOB_PRESETS[0]: 10-door / 8-drawer galley, shop spray -- the job a flat
  // per-door rate would plausibly be built on.
  const cheap = calculateBid(build(JOB_PRESETS[0]));
  assert.equal(cheap.price.toFixed(2), '3389.95');
  assert.equal(cheap.pricePerDoor.toFixed(2), '339.00');

  // JOB_PRESETS[2]: 30-door / 24-drawer large kitchen, on-site brush,
  // dark-to-light, hardware replaced -- everything a flat per-door rate
  // cannot see.
  const heavy = calculateBid(build(JOB_PRESETS[2]));
  assert.equal(heavy.price.toFixed(2), '13683.76');
  assert.equal(heavy.totalCost.toFixed(2), '10262.82');
  assert.equal(heavy.doors, 30);
  assert.equal(heavy.hardwareTotal, 912);

  // Applying the cheap job's own price-per-door rate flatly to the heavy
  // job's door count, the way a "$339 a door" special is applied regardless
  // of drawers, openings, hardware, finish method, or color change.
  const flatQuote = cheap.pricePerDoor * heavy.doors;
  assert.equal(flatQuote.toFixed(2), '10169.85');
  assert.ok(flatQuote < heavy.totalCost, 'the flat rate should quote below the heavy job\'s own break-even cost');
  assert.equal((heavy.totalCost - flatQuote).toFixed(2), '92.97');
  assert.equal((heavy.price - flatQuote).toFixed(2), '3513.91');

  assert.match(html, /\$3,389\.95/);
  assert.match(html, /\$339\.00/);
  assert.match(html, /\$13,683\.76/);
  assert.match(html, /\$10,262\.82/);
  assert.match(html, /\$10,169\.85/);
  assert.match(html, /\$92\.97/);
  assert.match(html, /\$3,513\.91/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-price-per-door\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-price-per-door\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-to-paint-kitchen-cabinets\.html"/);
});
