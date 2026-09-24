import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { calculateBid } from './calc.mjs';

const page = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('vs-a-flat-per-zone-rate.html');
const index = page('index.html');

test('index links to the flat-per-zone-rate comparison page', () => {
  assert.match(index, /vs-a-flat-per-zone-rate\.html/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /vs-a-flat-per-zone-rate\.html/);
});

test('the comparison page carries the required disclaimers and links back', () => {
  assert.match(html, /<title>This calculator vs\. a flat per-zone rate/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors|github\.com\/sponsors/);
});

test('the page frames the difference as a different stop, never as a fault', () => {
  assert.match(html, /Nothing here says or implies that quoting a flat per-zone rate is a bad-faith practice/);
  for (const word of ['scam', 'ripoff', 'rip-off', 'overpriced', 'useless']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(html), `the comparison page uses "${word}"`);
  }
});

test('the page names no specific competitor, so it needs no trademark-affiliation clause', () => {
  // This page compares against a generic pricing method, not a named
  // product -- it is listed in clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT
  // set, and clauses.test.mjs's real-tree sweep checks that listing agrees
  // with this file.
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

test('the no-backflow and two-backflow prices cited on the page match the calculator', () => {
  // Two otherwise identical four-zone spray stops, differing only in
  // backflow count (0 vs 2) -- the worked example this page cites.
  const base = {
    sprayMinutes: 4, rotorMinutes: 5, dripMinutes: 8,
    backflowMinutes: 15,
    freezeWarning: false, afterHoursPremium: 0,
    hourlyWage: 25, burdenRate: 20,
    milesOneWay: 10, speedMph: 30,
    setupHours: 0.25, minOnSiteHours: 0,
    tripFee: 0, compressorCost: 15, fittingsCost: 5, otherCost: 0,
    overheadRate: 10, targetMargin: 20,
    systems: [{ sprayZones: 4, rotorZones: 0, dripZones: 0 }],
  };
  const noBackflow = calculateBid({ ...base, backflows: 0 });
  const twoBackflow = calculateBid({ ...base, backflows: 2 });

  assert.ok(Math.abs(noBackflow.price - 76.3125) < 0.01, `expected no-backflow price near $76.31, got ${noBackflow.price.toFixed(2)}`);
  assert.ok(Math.abs(noBackflow.pricePerZone - 19.078125) < 0.01, `expected no-backflow per-zone rate near $19.08, got ${noBackflow.pricePerZone.toFixed(2)}`);
  assert.ok(Math.abs(twoBackflow.totalCost - 77.55) < 0.01, `expected two-backflow walk-away near $77.55, got ${twoBackflow.totalCost.toFixed(2)}`);
  assert.ok(Math.abs(twoBackflow.price - 96.9375) < 0.01, `expected two-backflow target price near $96.94, got ${twoBackflow.price.toFixed(2)}`);

  const flatQuoteOnTwoBackflow = noBackflow.pricePerZone * twoBackflow.totalZones;
  assert.ok(Math.abs(flatQuoteOnTwoBackflow - 76.3125) < 0.01, `expected carried-over flat quote near $76.31, got ${flatQuoteOnTwoBackflow.toFixed(2)}`);
  assert.ok(flatQuoteOnTwoBackflow < twoBackflow.totalCost, 'the carried-over flat quote should fall short of the two-backflow stop\'s walk-away cost');
  assert.ok(Math.abs((flatQuoteOnTwoBackflow - twoBackflow.totalCost) - -1.2375) < 0.01, 'shortfall vs walk-away should be about $1.24');
  assert.ok(Math.abs((flatQuoteOnTwoBackflow - twoBackflow.price) - -20.625) < 0.01, 'shortfall vs target-margin price should be about $20.63');
});
