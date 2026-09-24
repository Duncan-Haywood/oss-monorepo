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

test('the page frames the difference as a different building, never as a fault', () => {
  assert.match(html, /Nothing here says or implies that quoting a flat rate per square foot is a bad-faith practice/);
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

test('the light- and heavy-restroom prices cited on the page match the calculator', () => {
  // Two otherwise identical 10,000 sq ft buildings cleaned 5x/week, differing
  // only in restroom share (5% vs 20%) -- the worked example this page cites.
  const base = {
    hourlyWage: 18, burdenRate: 25, suppliesPerSqFtMonth: 0.03,
    equipmentMonthly: 150, otherMonthly: 0, overheadRate: 12, targetMargin: 15,
    crewSize: 2, shiftHours: 4,
  };
  const light = calculateBid({
    ...base,
    areas: [
      { name: 'Open office', squareFeet: 9500, productionRate: 4000, cleaningsPerWeek: 5 },
      { name: 'Restrooms', squareFeet: 500, productionRate: 1200, cleaningsPerWeek: 5 },
    ],
  });
  const heavy = calculateBid({
    ...base,
    areas: [
      { name: 'Open office', squareFeet: 8000, productionRate: 4000, cleaningsPerWeek: 5 },
      { name: 'Restrooms', squareFeet: 2000, productionRate: 1200, cleaningsPerWeek: 5 },
    ],
  });

  assert.ok(Math.abs(light.monthlyPrice - 2386) < 1, `expected light building near $2,386, got ${light.monthlyPrice.toFixed(2)}`);
  assert.ok(Math.abs(heavy.monthlyPrice - 2948) < 1, `expected heavy building near $2,948, got ${heavy.monthlyPrice.toFixed(2)}`);
  assert.ok(Math.abs(heavy.breakEvenMonthlyPrice - 2506) < 1, `expected heavy walk-away near $2,506, got ${heavy.breakEvenMonthlyPrice.toFixed(2)}`);

  const flatQuoteOnHeavy = light.pricePerSqFtMonth * heavy.totalSquareFeet;
  assert.ok(Math.abs(flatQuoteOnHeavy - 2386) < 1, `expected carried-over flat quote near $2,386, got ${flatQuoteOnHeavy.toFixed(2)}`);
  assert.ok(flatQuoteOnHeavy < heavy.breakEvenMonthlyPrice, 'the carried-over flat quote should fall short of the heavy building\'s walk-away cost');
  assert.ok(Math.abs((flatQuoteOnHeavy - heavy.breakEvenMonthlyPrice) - -120) < 5, 'shortfall vs walk-away should be about $120');
  assert.ok(Math.abs((flatQuoteOnHeavy - heavy.monthlyPrice) - -562) < 5, 'shortfall vs target-margin price should be about $562');
});
