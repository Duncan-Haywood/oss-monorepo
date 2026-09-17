import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-aurora-solar.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, engineering, or electrical-code advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with Aurora Solar', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Aurora Solar/);
});

test('no unverifiable price is claimed for Aurora Solar', () => {
  // aurorasolar.com is not reachable from this session (network egress in
  // this environment is proxied and does not permit fetching arbitrary
  // vendor sites, confirmed live: WebFetch to aurorasolar.com, a third-party
  // review page, en.wikipedia.org, and www.google.com all returned
  // EGRESS_BLOCKED) -- same discipline vs-paintscout.html uses for
  // PaintScout, vs-singleops.html uses for SingleOps, vs-acculynx.html uses
  // for AccuLynx, vs-buildertrend.html uses for Buildertrend, and
  // vs-levelset.html uses for Levelset. A web search (a separate tool from
  // WebFetch, not blocked) surfaced a third-party-aggregated per-seat price
  // for Aurora Solar, but with no way to confirm it against Aurora's own
  // current pricing page, it is left out rather than repeated as fact. Only
  // well-documented, non-numeric identity facts (product category, remote
  // roof-design focus, account-based per-seat subscription model) are
  // stated; no dollar figure for Aurora Solar appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/solar-pv-bid-calculator\/vs-aurora-solar\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-aurora-solar\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-aurora-solar\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-to-install-solar-panels\.html"/);
});
