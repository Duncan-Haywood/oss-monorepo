import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-extensiv.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, or financial advice/i);
});

test('states it is not affiliated with Extensiv', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Extensiv/);
});

test('no unverifiable price is claimed for Extensiv', () => {
  // Extensiv's pricing page is not reachable from a session running this
  // suite (network egress in this environment is proxied and does not
  // permit fetching arbitrary vendor sites at test time), so no current
  // plan name or price could be confirmed against a primary source at the
  // moment this page ships -- same discipline the other vs-* pages in this
  // repo use. Only well-documented, non-numeric identity facts (product
  // category, what the platform does) are stated; no dollar figure for
  // Extensiv appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-extensiv\.html">/);
});

// Mirrors the whole-portfolio check in platform/pages/faq-visible.test.mjs:
// the JSON-LD carries real characters (an actual em dash) while the visible
// markup spells the same glyph as an HTML entity (&mdash;), so the visible
// side is entity-decoded before the comparison.
const decodeEntities = (text) => text
  .replace(/&mdash;/g, '—')
  .replace(/&ndash;/g, '–')
  .replace(/&rsquo;/g, '’')
  .replace(/&lsquo;/g, '‘')
  .replace(/&rdquo;/g, '”')
  .replace(/&ldquo;/g, '“')
  .replace(/&amp;/g, '&');

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    const heading = `<h3>${question.name}</h3>`;
    const headingIndex = html.indexOf(heading);
    assert.notEqual(headingIndex, -1, `FAQ schema question "${question.name}" has no matching <h3> on the page`);
    const afterHeading = html.slice(headingIndex + heading.length);
    const paragraphStart = afterHeading.indexOf('<p>');
    const paragraphEnd = afterHeading.indexOf('</p>');
    assert.ok(paragraphStart !== -1 && paragraphEnd !== -1, `no visible answer paragraph found for "${question.name}"`);
    const visibleAnswer = decodeEntities(afterHeading.slice(paragraphStart + '<p>'.length, paragraphEnd));
    assert.equal(visibleAnswer, question.acceptedAnswer.text, `visible answer for "${question.name}" does not match the FAQPage schema text verbatim`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-extensiv\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-extensiv\.html/);
});

test('the comparison page links back to the calculator and to the negotiation brief', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/negotiation\.html"/);
});
