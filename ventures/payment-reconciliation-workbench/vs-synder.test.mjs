import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const docsPage = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = docsPage('vs-synder.html');
const indexHtml = docsPage('index.html');
const sitemap = docsPage('sitemap.xml');
const robots = docsPage('robots.txt');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with Synder', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Synder/);
});

test('names a checkable source for what Synder is, instead of a figure only Synder could confirm', () => {
  assert.match(html, /synder\.com/);
  // Synder prices its paid plans by monthly transaction volume across
  // several tiers, which changes over time; any dollar figure quoted here
  // would be stale the day Synder reprices, or wrong for the reader's own
  // volume tier even on the day it is written. Same guard pattern
  // subscription-price-impact's vs-baremetrics test and
  // ltl-freight-class-estimator's vs-smc3-fastclass test use for the same
  // reason: describe what the competitor's product does, never what it
  // costs.
  assert.doesNotMatch(html, /\$\d/);
});

test('does not claim Synder cannot do a one-off check, only that it requires a live connection', () => {
  // Synder can presumably be used for a single reconciliation too; the
  // genuine, verifiable difference is that doing so still requires
  // connecting a live payment processor and accounting platform account,
  // not that Synder is incapable of anything this workbench does.
  assert.doesNotMatch(html, /Synder[^.]*\bcannot\b/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/payment-reconciliation-workbench\/vs-synder\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-synder\.html"|href="vs-synder\.html"/);
});

test('the comparison page is listed in the sitemap and reachable by robots.txt', () => {
  assert.match(sitemap, /vs-synder\.html/);
  assert.match(robots, /Allow: \//);
});

test('the comparison page links back to the workbench', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('the comparison page links to the split-deposit worked example', () => {
  assert.match(html, /href="why-does-one-payout-show-up-as-two-bank-deposits\.html"/);
});
