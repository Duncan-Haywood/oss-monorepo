import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-workiz.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, engineering, or electrical-code advice/i);
});

/**
 * The tool page's own disclaimer is emphatic that it is not a permit load
 * calculation and does not settle code compliance, because an EV charger bid
 * is the one place on this site where a reader could mistake an estimating
 * aid for an electrical determination. A comparison page that drops that
 * sentence would be the weakest copy of the disclaimer in the venture.
 */
test('repeats the not-a-load-calculation limit the tool page carries', () => {
  assert.match(html, /not a permit load calculation/i);
  assert.match(html, /does not determine NEC or local-code compliance/i);
});

test('states it is not affiliated with Workiz', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Workiz Inc\./);
});

test('no unverifiable price is claimed for Workiz', () => {
  // workiz.com is not reachable from this session (network egress in this
  // environment is proxied and does not permit fetching arbitrary vendor
  // sites), so no current feature list, plan name, or price could be
  // confirmed against a primary source -- the same discipline
  // vs-servicetitan.html uses for the same product. Only well-documented,
  // non-numeric identity facts (product category, trades served,
  // subscription model) are stated; no dollar figure for Workiz appears
  // anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/example\.invalid\/ev-charger-bid-calculator\/vs-workiz\.html">/,
  );
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
  assert.match(indexHtml, /href="\.\/vs-workiz\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-workiz\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge\.html"/);
});
