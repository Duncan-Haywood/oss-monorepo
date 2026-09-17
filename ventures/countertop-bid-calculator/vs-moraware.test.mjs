import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-moraware.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not stone, construction, legal, tax, or financial advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('states it is not affiliated with Moraware', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Moraware/);
});

test('no unverifiable price is claimed for Moraware or CounterGo', () => {
  // moraware.com is not reachable from this session -- WebFetch to
  // www.moraware.com returned EGRESS_BLOCKED, confirmed live. A web search
  // (a separate tool from WebFetch, not blocked) surfaced third-party
  // aggregated per-seat figures for CounterGo, one of which directly
  // contradicted another and one of which stated outright that "pricing is
  // not publicly listed on their website" -- with no way to confirm any of
  // them against Moraware's own current pricing page, none are repeated as
  // fact here. Same discipline vs-pestpac.html uses for PestPac and
  // vs-aurora-solar.html uses for Aurora Solar. Only well-documented,
  // non-numeric identity facts
  // (product category, drawing/quoting/cut-layout focus, account-based
  // per-user subscription model, the separate Systemize product) are
  // stated; no dollar figure for Moraware or CounterGo appears anywhere on
  // the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/countertop-bid-calculator\/vs-moraware\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-moraware\.html"|href="vs-moraware\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-moraware\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-to-install-quartz-countertops\.html"/);
});
