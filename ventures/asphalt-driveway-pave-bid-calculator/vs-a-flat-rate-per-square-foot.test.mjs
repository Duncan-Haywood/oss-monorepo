import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { calculateBid, suggestedMethodKit } from './calc.mjs';

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
  // set, and clauses.test.mjs's real-tree sweep checks that listing agrees
  // with this file. Asserted here too so a future edit that turns this into
  // a named-competitor page trips a test in the venture that changed.
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
  // Same job the venture's own README uses as its worked example: 1,000 sq ft
  // full-depth at 3 in, 80 sq ft apron, 200 sq ft failed base, 60 lf sawcut.
  const base = {
    hourlyWage: 38, burdenRate: 32, travelAndEquipment: 425, overheadRate: 16,
    targetMargin: 28, hoursTrip: 1.5, siteHours: 0.75, permitFee: 125,
  };
  const fullDepth = calculateBid({
    ...base, ...suggestedMethodKit('full-depth'), method: 'full-depth',
    drivewaySqFt: 1000, thicknessIn: 3, apronSqFt: 80, apronThicknessIn: 4,
    failedBaseSqFt: 200, sawcutLf: 60, existingDepthIn: 2.5,
  });
  const flatQuote = 3.5 * fullDepth.pavedSqFt;
  assert.ok(Math.abs(fullDepth.breakEvenPrice - 4700) < 50, `expected walk-away near $4,700, got ${fullDepth.breakEvenPrice.toFixed(0)}`);
  assert.ok(Math.abs(flatQuote - 3780) < 50, `expected flat quote near $3,780, got ${flatQuote.toFixed(0)}`);
  assert.ok(flatQuote < fullDepth.breakEvenPrice, 'the flat quote should fall short of the walk-away cost on this job');
});
