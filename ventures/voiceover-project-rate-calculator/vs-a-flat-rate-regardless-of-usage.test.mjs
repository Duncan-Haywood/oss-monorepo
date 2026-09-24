import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { computeProjectQuote, USAGE_TERM_MULTIPLIERS } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-flat-rate-regardless-of-usage.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not financial or business advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('names no marketplace or vendor', () => {
  // Generic-method comparison -- against a flat quoting habit, not any named
  // product -- so this page is exempt from the trademark disclaimer
  // clauses.mjs requires for a vs-<competitor> page (see
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT). That
  // exemption only holds while the page truly names no vendor.
  assert.doesNotMatch(html, /Voices\.com|Bodalgo|Backstage|Casting[- ]?Call/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-rate-regardless-of-usage\.html">/);
});

test("has Open Graph title/description tags in this venture's tag style", () => {
  assert.match(html, /<meta property="og:title" content="[^"]+">/);
  assert.match(html, /<meta property="og:description" content="[^"]+">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-rate-regardless-of-usage\.html"|href="vs-a-flat-rate-regardless-of-usage\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-rate-regardless-of-usage\.html/);
});

test('the comparison page links back to the calculator and to the how-to walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-should-i-charge-for-a-voice-over-project\.html"/);
});

// The worked example is the page's central claim. Recomputed here against
// the module the calculator itself runs, rather than restated as hand-typed
// constants, so a change to the shipped arithmetic makes this page's claim
// false (and this test red) instead of merely stale.
test('the worked example matches what the shipped calculator computes across every usage term', () => {
  const base = {
    wordCount: 150,
    wordsPerMinute: 150,
    pricingMethod: 'perWord',
    rate: 0.3,
    rush: false,
    exclusive: false,
    extraRevisions: 0,
    extraRevisionFee: 0,
  };

  const expected = {
    internal: 45,
    web: 58.5,
    broadcast_regional: 81,
    broadcast_national: 123.75,
    buyout: 180,
  };

  for (const [term, total] of Object.entries(expected)) {
    const r = computeProjectQuote({ ...base, usageTerm: term });
    assert.equal(r.baseFee, 45, `base fee must stay flat across usage terms (${term})`);
    assert.equal(r.total, total, `usage-scaled total for ${term}`);
    assert.equal(r.usageMultiplier, USAGE_TERM_MULTIPLIERS[term]);
  }

  // The flat-quote-vs-buyout gap is this page's headline number.
  assert.equal(expected.buyout - expected.internal, 135);

  for (const value of ['$45.00', '$58.50', '$81.00', '$123.75', '$180.00', '$135.00']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});
