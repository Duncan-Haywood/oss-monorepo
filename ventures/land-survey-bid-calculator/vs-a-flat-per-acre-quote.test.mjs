import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const page = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('vs-a-flat-per-acre-quote.html');
const index = page('index.html');
const readme = page('README.md');

test('index and README link to the flat-rate comparison page', () => {
  assert.match(index, /vs-a-flat-per-acre-quote\.html/);
  assert.match(readme, /vs-a-flat-per-acre-quote\.html/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /land-survey-bid-calculator\/<\/loc>/);
  assert.match(sitemap, /vs-a-flat-per-acre-quote\.html/);
});

test('the comparison page carries the required disclaimers and links back', () => {
  assert.match(html, /<title>This calculator vs\. a flat per-acre quote/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /GitHub Sponsors/);
});

test('the page frames the difference as a different job, never as a fault', () => {
  assert.match(html, /Nothing here says or implies that quoting a flat rate per acre is a bad-faith practice/);
  for (const word of ['scam', 'ripoff', 'rip-off', 'overpriced', 'useless']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(html), `the comparison page uses "${word}"`);
  }
});

test('the page names no specific competitor, so it needs no trademark-affiliation clause', () => {
  // This page compares against a generic pricing method (a flat per-acre
  // rate), not a named product -- it is listed in clauses.mjs's
  // COMPARISON_DISCLAIMER_EXEMPT set, and clauses.test.mjs's real-tree
  // sweep checks that listing agrees with this file.
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

test('the page explains the corner-count-vs-acreage reasoning the calculator itself is built on', () => {
  assert.match(html, /corners to locate/i);
  assert.match(html, /corners to set/i);
  assert.match(html, /terrain/i);
});

test('the two worked examples in the page match calc.mjs\'s own numbers', async () => {
  const { pricingGap } = await import('./calc.mjs');
  const big = pricingGap({ parcelAcres: 40, cornersToLocate: 2, cornersToSet: 0, terrain: 'open', recordResearchHours: 1 });
  assert.equal(Math.round(big.naiveQuote), 4800);
  assert.equal(Math.round(big.finalPrice), 850);
  assert.equal(big.underpriced, false);

  const small = pricingGap({ parcelAcres: 2, cornersToLocate: 1, cornersToSet: 3, terrain: 'heavy', recordResearchHours: 8 });
  assert.equal(Math.round(small.naiveQuote), 240);
  assert.equal(Math.round(small.finalPrice), 2473);
  assert.equal(small.underpriced, true);
});
