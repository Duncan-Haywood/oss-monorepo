import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-baremetrics.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial or business advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with Baremetrics', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Baremetrics/);
});

test('names a checkable source for what Baremetrics is, instead of a figure only Baremetrics could confirm', () => {
  assert.match(html, /baremetrics\.com/);
  // Baremetrics prices its paid plans on a scale that moves with a
  // customer's own MRR and changes over time; any dollar figure quoted here
  // would be stale the day Baremetrics reprices, or wrong for the reader's
  // own MRR tier even on the day it is written. Same guard pattern
  // ltl-freight-class-estimator's vs-smc3-fastclass test and
  // owner-operator-cpm-calculator's vs-atbs page use for the same reason:
  // describe what the competitor's product does, never what it costs.
  assert.doesNotMatch(html, /\$\d/);
});

test('does not claim Baremetrics cannot do what-if scenario planning, only that it needs connected billing data', () => {
  // Baremetrics publishes pricing-experimentation and forecasting content of
  // its own; a claim that it "cannot" model a price change would be an
  // unverifiable, disparaging guess. The page instead distinguishes on
  // whether a live billing connection is required, which is verifiable from
  // Baremetrics's own integration documentation.
  assert.doesNotMatch(html, /Baremetrics[^.]*\bcannot\b/i);
  assert.doesNotMatch(html, /Baremetrics[^.]*\bno\b[^.]*what-if/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/subscription-price-impact\/vs-baremetrics\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-baremetrics\.html"|href="vs-baremetrics\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-baremetrics\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});
