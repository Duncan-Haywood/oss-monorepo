import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-paintscout.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or business advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with PaintScout', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by PaintScout/);
});

test('no unverifiable price is claimed for PaintScout', () => {
  // paintscout.com is not reachable from this session (network egress in this
  // environment is proxied and does not permit fetching arbitrary vendor
  // sites, confirmed live: WebFetch to paintscout.com and to third-party
  // pricing listings both returned EGRESS_BLOCKED) -- same discipline
  // vs-acculynx.html uses for AccuLynx, vs-buildertrend.html uses for
  // Buildertrend, and vs-levelset.html uses for Levelset. Third-party
  // secondary sources also disagree with each other on PaintScout's current
  // plan prices (figures seen ranged from $79/user/month to $299/month for
  // different plan shapes), which is a second, independent reason not to
  // repeat any of them as fact. Only well-documented, non-numeric identity
  // facts (product category, painting-only focus, account-based
  // subscription model) are stated; no dollar figure for PaintScout appears
  // anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/painting-bid-calculator\/vs-paintscout\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-paintscout\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-paintscout\.html/);
});

test('the comparison page links back to the calculator and to the per-square-foot walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="interior-painting-price-per-square-foot\.html"/);
});
