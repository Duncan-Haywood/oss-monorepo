import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-normalizing-a-quote-in-a-spreadsheet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, or financial advice/i);
});

test('names no vendor or competing product in its own title or lede', () => {
  // This page compares against the generic manual method of normalizing a
  // rate card in a spreadsheet, not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Same shape as this venture's own vs-extensiv.html and
  // vs-shipbob.html, which do name real products and do carry that clause.
  // The closing note legitimately cross-links to vs-extensiv.html, so the
  // check is scoped to the title and lede rather than the whole document.
  assert.doesNotMatch(html, /<title>[^<]*(Extensiv|ShipBob)/i);
  const lede = html.match(/<p class="lede">[\s\S]*?<\/p>/i)[0];
  assert.doesNotMatch(lede, /Extensiv|ShipBob|ShipStation|Flexport/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-normalizing-a-quote-in-a-spreadsheet\.html">/);
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
  assert.match(indexHtml, /href="vs-normalizing-a-quote-in-a-spreadsheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-normalizing-a-quote-in-a-spreadsheet\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});
