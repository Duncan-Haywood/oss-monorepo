import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-servicetitan.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer in this venture\'s wording', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not plumbing, construction, legal, tax, or financial advice/i);
});

// Method selection is a camera-and-code call, not arithmetic. The page prices
// the method the user picks and must never read as choosing it for them, or as
// standing in for the inspection, locate, or permit that actually decides it.
test('does not claim to decide whether a line can be burst or lined', () => {
  assert.match(html, /It prices the method you pick; it does not pick the method\./);
  assert.match(html, /judgment call for the licensed plumber on site/);
  assert.match(html, /neither this calculator nor ServiceTitan is a camera\s+inspection, a permit, a locate, or an engineering determination/);
});

test('states it is not affiliated with ServiceTitan', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by ServiceTitan, Inc\./);
});

test('no unverifiable price is claimed for ServiceTitan', () => {
  // servicetitan.com is not reachable from this session (egress here is
  // proxied and refuses arbitrary vendor hosts), so no plan name, feature
  // list, or figure could be confirmed against a primary source -- the same
  // discipline the sibling vs-servicetitan pages use for the same product.
  // Only well-documented, non-numeric identity facts (founding year,
  // founders, headquarters city, product category, listing year) are stated;
  // no dollar figure for ServiceTitan appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="vs-servicetitan\.html">/);
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
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-to-replace-a-sewer-line\.html"/);
});
