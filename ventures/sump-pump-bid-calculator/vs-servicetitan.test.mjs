import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-servicetitan.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, legal, tax, financial, or engineering advice/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-servicetitan\.html">/);
});

// The page prices the pit, discharge, and backup the user picks; it must
// never read as a drainage design or a pump-sizing determination.
test('does not claim it designs the drainage or sizes the pump', () => {
  assert.match(html, /judgment call for the licensed plumber on site/);
});

test('states it is not affiliated with ServiceTitan', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by ServiceTitan, Inc\./);
});

test('no unverifiable price is claimed for ServiceTitan', () => {
  // servicetitan.com is not reachable from this session (network egress in
  // this environment is proxied and does not permit fetching arbitrary
  // vendor sites), so no current feature list, plan name, or price could be
  // confirmed against a primary source -- the same discipline the venture's
  // sibling vs-servicetitan pages (boiler-replacement, ev-charger,
  // mini-split, furnace, water-heater) use for the same product. Only
  // well-documented, non-numeric identity facts (founding year, founders,
  // headquarters city, product category) are stated; no dollar figure for
  // ServiceTitan appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
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
  assert.match(indexHtml, /href="vs-servicetitan\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-servicetitan\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-to-install-a-sump-pump\.html"/);
});
