import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { calculateDilution } from './calc.mjs';

const page = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('vs-pricing-off-the-label-price.html');

test('index, README, robots, and sitemap let a visitor and a crawler find the page', () => {
  assert.match(page('index.html'), /vs-pricing-off-the-label-price\.html/);
  assert.match(page('README.md'), /vs-pricing-off-the-label-price\.html/);
  assert.match(page('robots.txt'), /Allow: \//);
  assert.match(page('sitemap.xml'), /vs-pricing-off-the-label-price\.html/);
});

test('the comparison page carries the required disclaimers and links back', () => {
  assert.match(html, /<title>This calculator vs\. pricing off the label price/);
  assert.match(html, /<link rel="canonical" href="vs-pricing-off-the-label-price\.html">/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors/);
});

test('the page frames the difference as a different job, never as a fault', () => {
  assert.match(html, /Nothing here says or implies that pricing off the label price is a bad-faith practice/);
  // "broken" is excluded: the venture's own standard no-SLA footer clause
  // ("may be slow, broken, moved, or taken offline") legitimately contains
  // it, and this page carries that same clause.
  for (const word of ['scam', 'ripoff', 'rip-off', 'overpriced', 'useless']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(html), `the comparison page uses "${word}"`);
  }
});

test('the page names no specific competitor, so it needs no trademark-affiliation clause', () => {
  // This page compares against a generic pricing habit (reading the
  // concentrate label's dilution ratio as the diluted product's price), not
  // a named product -- it is listed in clauses.mjs's
  // COMPARISON_DISCLAIMER_EXEMPT set, distinct from this same venture's
  // vs-janitorial-manager.html, which does name a product and does carry
  // that clause.
  assert.doesNotMatch(html, /not affiliated with, endorsed by, or sponsored by/i);
});

test('the page never claims a network call, matching every other page in this venture', () => {
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|<script src=/);
});

test('every FAQPage question and answer authored in JSON-LD is also visible on the page', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'FAQPage');
  assert.ok(ld.mainEntity.length >= 3);
  for (const entry of ld.mainEntity) {
    assert.ok(html.includes(entry.name), `question not visible on page: ${entry.name}`);
    assert.ok(html.includes(entry.acceptedAnswer.text), `answer not visible on page: ${entry.acceptedAnswer.text}`);
  }
});

test('the label-only and ready-to-use figures cited on the page match the calculator on its own default example', () => {
  // The exact defaults index.html pre-fills, and the same example already
  // worked through in this venture's own FAQ ($2.10 chemical+labor -> $2.21
  // batch cost per ready-to-use gallon).
  const input = {
    concentrateOz: 4,
    waterGallons: 1,
    containerCost: 32,
    containerOz: 128,
    batchGallons: 5,
    wasteRate: 5,
    laborMinutes: 3,
    laborRate: 22,
  };
  const result = calculateDilution(input);
  // Pricing off the label price alone: chemical cost scaled to the job size,
  // with no mixing labor and no waste allowance -- the arithmetic a sticker
  // price and a dilution ratio alone can do.
  const labelOnlyCost = (result.chemicalCost / input.waterGallons) * input.batchGallons;
  assert.ok(Math.abs(result.concentrateCostPerOz - 0.25) < 0.001, `expected $0.25/oz, got ${result.concentrateCostPerOz}`);
  assert.ok(Math.abs(result.chemicalCost - 1) < 0.001, `expected $1.00 chemical cost, got ${result.chemicalCost}`);
  assert.ok(Math.abs(labelOnlyCost - 5) < 0.01, `expected a $5.00 label-only price for the 5-gallon job, got ${labelOnlyCost.toFixed(2)}`);
  assert.ok(Math.abs(result.costPerBucket - 11.05) < 0.02, `expected about $11.05 ready-to-use cost, got ${result.costPerBucket.toFixed(2)}`);
  assert.ok(labelOnlyCost < result.costPerBucket, 'the label-only price should fall short of the ready-to-use cost once labor and waste are counted');
  assert.ok(result.costPerBucket > labelOnlyCost * 2, 'the ready-to-use cost should be more than double the label-only price on this example');
});
