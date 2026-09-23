// Pins the decision page's dollar figures to calc.mjs's own arithmetic
// rather than to hand-typed numbers, so a future change to the fabric rate,
// overhead, or margin defaults that shifts these figures cannot leave this
// page quietly wrong. Structural checks follow the same pattern as
// how-much-to-charge-to-pave-a-driveway.html's own page.test.mjs coverage.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { calculateBid, suggestedMethodKit, JOB_PRESETS } from './calc.mjs';

const SLUG = 'should-i-only-charge-material-cost-for-paving-fabric.html';
const html = fs.readFileSync(new URL(`./${SLUG}`, import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const seoHtml = fs.readFileSync(new URL('./how-much-to-charge-to-pave-a-driveway.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

// Same default crew rates as index.html's own <input value="..."> defaults
// for the fields applyJob() does not overwrite (wage, burden, overhead,
// margin, travel/equipment, permit fee) -- see index.html's applyJob, which
// only touches scope fields and the method-kit hour/cost rates.
const WAGE_DEFAULTS = {
  hourlyWage: 38, burdenRate: 32, overheadRate: 16, targetMargin: 28,
  travelAndEquipment: 425, permitFee: 125,
};

const FABRIC_JOB = JOB_PRESETS[3];

function money(value) {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function bidFor(fabric) {
  return calculateBid({
    ...FABRIC_JOB,
    ...WAGE_DEFAULTS,
    ...suggestedMethodKit(FABRIC_JOB.method),
    fabric,
  });
}

test('this is the fabric-over-cracks preset, and it is a mill-and-overlay', () => {
  assert.equal(JOB_PRESETS.length, 4, 'this page assumes JOB_PRESETS[3] is the fabric preset; add/adjust the index if a fifth preset ships');
  assert.match(FABRIC_JOB.label, /fabric over cracks/i);
  assert.equal(FABRIC_JOB.method, 'mill-overlay');
  assert.equal(FABRIC_JOB.fabric, true);
});

test('the page states the material cost, the cost delta, the price delta, and the gap the calculator actually returns', () => {
  const off = bidFor(false);
  const on = bidFor(true);

  assert.equal(on.pavedSqFt, 2150);
  assert.ok(html.includes(on.pavedSqFt.toLocaleString('en-US')), 'page is missing the paved square footage the fabric material cost is based on');

  const fabricMaterial = money(on.fabricMaterial);
  assert.ok(html.includes(fabricMaterial), `page is missing the fabric material cost (${fabricMaterial})`);

  const costDelta = on.totalCost - off.totalCost;
  const priceDelta = on.price - off.price;
  assert.ok(priceDelta > costDelta, 'the whole point of this page is that the price delta exceeds the raw material cost');

  assert.ok(html.includes(money(off.totalCost)), `page is missing total cost without fabric (${money(off.totalCost)})`);
  assert.ok(html.includes(money(on.totalCost)), `page is missing total cost with fabric (${money(on.totalCost)})`);
  assert.ok(html.includes(money(off.price)), `page is missing price without fabric (${money(off.price)})`);
  assert.ok(html.includes(money(on.price)), `page is missing price with fabric (${money(on.price)})`);
  assert.ok(html.includes(money(costDelta)), `page is missing the cost delta (${money(costDelta)})`);
  assert.ok(html.includes(money(priceDelta)), `page is missing the price delta (${money(priceDelta)})`);

  const gap = priceDelta - on.fabricMaterial;
  assert.ok(html.includes(money(gap)), `page is missing the uncollected gap (${money(gap)})`);
});

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not paving, construction, legal, tax, or financial advice/i);
});

test('the canonical tag names this file, relative to the venture root', () => {
  assert.match(html, new RegExp(`<link rel="canonical" href="${SLUG.replace('.', '\\.')}">`));
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

test('the page is linked from the tool page and the pricing walkthrough, not orphaned', () => {
  assert.match(indexHtml, new RegExp(`href="${SLUG}"`));
  assert.match(seoHtml, new RegExp(`href="${SLUG}"`));
});

test('the page is listed in the sitemap', () => {
  assert.match(sitemap, new RegExp(SLUG.replace('.', '\\.')));
});

test('the page links back to the calculator and the pricing walkthrough', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-to-pave-a-driveway\.html"/);
});

test('no raw-text element is left unclosed', () => {
  for (const tag of ['textarea', 'script', 'style']) {
    const opened = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const closed = (html.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
    assert.equal(opened, closed, `<${tag}> is opened ${opened}x but closed ${closed}x`);
  }
});
