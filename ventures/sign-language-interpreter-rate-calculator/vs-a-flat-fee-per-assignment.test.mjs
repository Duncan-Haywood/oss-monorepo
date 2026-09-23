import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { computeAssignmentQuote } from './calc.mjs';

const page = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('vs-a-flat-fee-per-assignment.html');
const index = page('index.html');
const readme = page('README.md');

test('index and README link to the flat-fee comparison page', () => {
  assert.match(index, /vs-a-flat-fee-per-assignment\.html/);
  assert.match(readme, /vs-a-flat-fee-per-assignment\.html/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /vs-a-flat-fee-per-assignment\.html/);
});

test('the comparison page carries the required disclaimers and links back', () => {
  assert.match(html, /<title>This calculator vs\. a flat fee per assignment/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('the page frames the difference as a different job, never as a fault', () => {
  assert.match(html, /Nothing here says or implies that quoting a flat fee per assignment is a bad way/);
  for (const word of ['scam', 'ripoff', 'rip-off', 'overpriced', 'useless']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(html), `the comparison page uses "${word}"`);
  }
});

test('the page names no specific competitor, so it needs no trademark-affiliation clause', () => {
  // Listed in clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT set: this page
  // compares against a generic pricing habit, not a named agency or product.
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

test('the three worked figures cited on the page match the calculator at a $65/hour rate', () => {
  const travelShort = computeAssignmentQuote({
    hoursRequested: 1,
    hourlyRate: 65,
    setting: 'general',
    differential: 'none',
    travelMinutesEachWay: 20,
    travelBillingFraction: 1,
    travelMilesRoundTrip: 10,
    mileageRate: 0.67,
  });
  const flatMinimumOnly = computeAssignmentQuote({
    hoursRequested: 1,
    hourlyRate: 65,
    setting: 'general',
    differential: 'none',
  });
  const standardEvening3h = computeAssignmentQuote({
    hoursRequested: 3,
    hourlyRate: 65,
    setting: 'general',
    differential: 'evening_weekend',
  });
  const standard3h = computeAssignmentQuote({
    hoursRequested: 3,
    hourlyRate: 65,
    setting: 'general',
    differential: 'none',
  });
  const legalTeam = computeAssignmentQuote({
    hoursRequested: 3,
    hourlyRate: 65,
    setting: 'legal',
    differential: 'none',
    teamInterpreting: true,
  });
  const legalSolo = computeAssignmentQuote({
    hoursRequested: 3,
    hourlyRate: 65,
    setting: 'legal',
    differential: 'none',
    teamInterpreting: false,
  });

  assert.equal(flatMinimumOnly.total, 130);
  assert.equal(travelShort.total, 180.03);
  assert.equal(standard3h.total, 195);
  assert.equal(standardEvening3h.total, 292.5);
  assert.equal(legalSolo.total, 195);
  assert.equal(legalTeam.total, 390);

  assert.match(html, /\$130\.00 \(2-hour minimum, no travel\)/);
  assert.match(html, /\$180\.03 \(minimum \+ travel time \+ mileage\)/);
  assert.match(html, /\$50\.03 in unbilled travel and mileage/);
  assert.match(html, /\$195\.00 \(standard-hours rate\)/);
  assert.match(html, /\$292\.50 \(evening\/weekend &times;1\.5\)/);
  assert.match(html, /\$97\.50 missed differential/);
  assert.match(html, /\$390\.00 \(two-interpreter team\)/);
});
