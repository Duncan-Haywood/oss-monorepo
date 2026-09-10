// Pins the decision page's dollar figures to calc.mjs's own arithmetic
// rather than to hand-typed numbers, so a future change to the scope,
// pattern, or extra kits that shifts the walk-away price cannot leave
// this page quietly wrong. Structural checks follow the same pattern as
// should-i-charge-extra-for-moving-furniture-on-a-carpet-install.test.mjs.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {
  calculateBid,
  suggestedScopeKit,
  suggestedPatternKit,
  suggestedExtraKit,
  floorYardsFromSqft,
  JOB_PRESETS,
} from './calc.mjs';

const SLUG = 'should-i-charge-2-a-yard-to-install-carpet.html';
const html = fs.readFileSync(new URL(`./${SLUG}`, import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const seoHtml = fs.readFileSync(new URL('./how-much-to-charge-to-install-carpet.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

// Same default crew rates as index.html's own <input value="..."> defaults,
// which JOB_PRESETS deliberately does not override (presets only set scope,
// dimensions, and extras -- see index.html's applyJob).
const WAGE_DEFAULTS = {
  hourlyWage: 38, burdenRate: 30, overheadRate: 15, targetMargin: 20,
  travelAndEquipment: 55, otherCost: 0,
};

function bidFor(job) {
  return calculateBid({
    ...job,
    ...WAGE_DEFAULTS,
    ...suggestedScopeKit(job.scope),
    ...suggestedPatternKit(job.pattern),
    ...suggestedExtraKit(),
  });
}

function money(value) {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

test('all four named jobs price the way the page claims', () => {
  const [cheap, typical, losing, whole] = JOB_PRESETS;
  assert.equal(cheap.label.startsWith('Cheap special'), true);
  assert.equal(typical.label.startsWith('Typical house'), true);
  assert.equal(losing.label.startsWith('Losing job'), true);
  assert.equal(whole.label.startsWith('Whole house'), true);

  const cases = [
    { job: cheap, sqft: 400 },
    { job: typical, sqft: 900 },
    { job: losing, sqft: 400 },
    { job: whole, sqft: 1600 },
  ];
  const losses = {};
  for (const { job, sqft } of cases) {
    assert.equal(job.floorSqft, sqft, `${job.label} floor sq ft drifted from what the page assumes`);
    const bid = bidFor(job);
    const netYards = floorYardsFromSqft(sqft);
    const flatRatePrice = netYards * 2;
    const flatMoney = money(flatRatePrice);
    const breakEvenMoney = money(bid.breakEvenPrice);
    assert.ok(html.includes(flatMoney), `page is missing the $2/yd price for ${job.label} (${flatMoney})`);
    assert.ok(html.includes(breakEvenMoney), `page is missing the walk-away price for ${job.label} (${breakEvenMoney})`);
    // Every preset loses money against the $2/yd special given the
    // calculator's own default crew rates -- confirmed rather than assumed,
    // since a future rate change could flip a row to "covers".
    assert.ok(flatRatePrice < bid.breakEvenPrice, `${job.label} was expected to lose against $2/yd`);
    const shortfall = money(bid.breakEvenPrice - flatRatePrice);
    assert.ok(html.includes(shortfall), `page does not state the shortfall for ${job.label} (${shortfall})`);
    losses[job.label] = bid.breakEvenPrice - flatRatePrice;
  }

  // The page's headline material comparison: the cheap special's own carpet
  // invoice dwarfs its $2/yd flat price.
  const cheapBid = bidFor(cheap);
  assert.ok(html.includes(money(cheapBid.carpetMaterial)), 'page is missing the cheap job carpet invoice figure');

  // The page's same-footage comparison: cheap special and losing job share
  // the same 400 sq ft, so the ratio between their losses is the "N times
  // worse" claim -- pin the actual ratio rather than the hand-typed prose.
  const ratio = losses[losing.label] / losses[cheap.label];
  assert.ok(ratio > 1.7 && ratio < 2.0, `expected roughly a 1.8x loss ratio between the two 400 sq ft jobs, got ${ratio}`);
  assert.ok(html.includes('1.8 times'), 'page prose should state the ~1.8x ratio in words');
});

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not flooring-spec, moisture-test, legal, tax, or financial advice/i);
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
  assert.match(html, /href="how-much-to-charge-to-install-carpet\.html"/);
});

test('no raw-text element is left unclosed', () => {
  for (const tag of ['textarea', 'script', 'style']) {
    const opened = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const closed = (html.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
    assert.equal(opened, closed, `<${tag}> is opened ${opened}x but closed ${closed}x`);
  }
});
