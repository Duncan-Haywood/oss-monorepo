import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { calculateBid } from './calc.mjs';

const page = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('vs-a-flat-rate-per-square-foot.html');
const index = page('index.html');
const readme = page('README.md');

test('index and README link to the flat-rate comparison page', () => {
  assert.match(index, /vs-a-flat-rate-per-square-foot\.html/);
  assert.match(readme, /vs-a-flat-rate-per-square-foot\.html/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /vs-a-flat-rate-per-square-foot\.html/);
});

test('the comparison page carries the required disclaimers and links back', () => {
  assert.match(html, /<title>This calculator vs\. a flat rate per square foot/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors/);
});

test('the page frames the difference as a different job, never as a fault', () => {
  assert.match(html, /Nothing here says or implies that quoting a flat rate per square foot is a bad-faith practice/);
  // "broken" is excluded: the venture's own standard no-SLA footer clause
  // ("may be slow, broken, moved, or taken offline") legitimately contains
  // it, and this page carries that same clause.
  for (const word of ['scam', 'ripoff', 'rip-off', 'overpriced', 'useless']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(html), `the comparison page uses "${word}"`);
  }
});

test('the page names no specific competitor, so it needs no trademark-affiliation clause', () => {
  // This page compares against a generic pricing method, not a named
  // product -- it is listed in clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT
  // set, distinct from this same venture's vs-coatingos.html, which does
  // name a product and does carry that clause.
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

test('the walk-away and flat-quote figures cited on the page match the calculator on the example job', () => {
  // A 400 sq ft (2-car) solid-color epoxy job, matching the degrease-only
  // vs. full-diamond-grind contrast this page describes.
  const base = {
    garageId: '2-car',
    systemId: 'solid-epoxy',
    crackLinearFeet: 0,
    pitSquareFeet: 0,
    moistureBarrier: false,
    hourlyWage: 45,
    burdenRate: 22,
    flakePricePerLb: 4.5,
    moisturePerSqFt: 1.1,
    crackFillPerLf: 1.25,
    pitFillPerSf: 4,
    otherJobCost: 40,
    roundTripMiles: 30,
    travelMph: 35,
    vehiclePerMile: 0.85,
    overheadRate: 15,
    targetMargin: 35,
  };
  const degreaseOnly = calculateBid({ ...base, prepId: 'degrease' });
  const fullGrind = calculateBid({ ...base, prepId: 'full-grind' });
  const flatQuote = 4 * degreaseOnly.garage.squareFeet;
  assert.equal(degreaseOnly.garage.squareFeet, 400);
  assert.ok(Math.abs(degreaseOnly.price - 1743) < 5, `expected degrease-only price near $1,743, got ${degreaseOnly.price.toFixed(0)}`);
  assert.ok(Math.abs(fullGrind.price - 2073) < 5, `expected full-grind price near $2,073, got ${fullGrind.price.toFixed(0)}`);
  assert.ok(Math.abs(flatQuote - 1600) < 1, `expected flat quote of $1,600, got ${flatQuote.toFixed(0)}`);
  assert.ok(flatQuote < degreaseOnly.price, 'the flat quote should fall short of the walk-away cost even on the lighter degrease-only job');
  assert.ok(degreaseOnly.price < fullGrind.price, 'a full diamond grind should cost more than degrease-only prep on the same slab');
});
