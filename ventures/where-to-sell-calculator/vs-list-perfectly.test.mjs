import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-list-perfectly.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not tax, financial, or\s+business advice/i);
});

test('carries the best-effort hosting disclaimer', () => {
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/i);
});

test('carries the support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with List Perfectly', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by List Perfectly/);
});

test('no price or figure is attributed to List Perfectly', () => {
  // List Perfectly's current pricing and plan terms are not reachable from a
  // static page maintained separately from List Perfectly's own site, so
  // none is stated. The page describes only the publicly documented product
  // shape -- paid, subscription, bulk crosslisting -- and carries no
  // currency amount anywhere, which makes "no invented pricing" checkable
  // rather than a promise.
  assert.doesNotMatch(html, /\$\s?\d/);
});

test('does not claim to evaluate List Perfectly, only to describe its shape', () => {
  assert.match(html, /makes no claim about List Perfectly's\s+accuracy,\s+features, or current terms, and does not evaluate it/);
});

test('states plainly that it does not replace List Perfectly', () => {
  // The honest half of a comparison page: a reader must not leave thinking a
  // free fee calculator also crosslists or manages marketplace inventory.
  assert.match(html, /<h3>Can this page replace List Perfectly\?<\/h3>/);
  assert.match(html, /never creates, crosslists, or manages a listing/);
  assert.match(html, /cannot maintain a shared catalog, bulk-edit hundreds of listings/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-list-perfectly\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(
      html.includes(`<h3>${question.name}</h3>`),
      `FAQ schema question "${question.name}" has no matching <h3> on the page`,
    );
  }
});

// The JSON-LD carries real characters (an actual em dash) while the visible
// markup spells the same glyph as an HTML entity (&mdash;) -- a browser
// renders both identically, but a raw string comparison needs the visible
// side decoded first. See platform/pages/faq-visible.test.mjs for the
// whole-portfolio version of this check.
const decodeEntities = (text) => text
  .replace(/&mdash;/g, '—')
  .replace(/&ndash;/g, '–')
  .replace(/&rsquo;/g, '’')
  .replace(/&lsquo;/g, '‘')
  .replace(/&rdquo;/g, '”')
  .replace(/&ldquo;/g, '“')
  .replace(/&amp;/g, '&');

test('every FAQ answer in the schema also appears as visible copy', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const question of schema.mainEntity) {
    const answer = question.acceptedAnswer.text;
    const headingIndex = html.indexOf(`<h3>${question.name}</h3>`);
    assert.notEqual(headingIndex, -1, `FAQ schema question "${question.name}" has no matching <h3> on the page`);
    const afterHeading = html.slice(headingIndex);
    const paragraphStart = afterHeading.indexOf('<p>');
    const paragraphEnd = afterHeading.indexOf('</p>');
    const visibleAnswer = decodeEntities(afterHeading.slice(paragraphStart + '<p>'.length, paragraphEnd));
    assert.equal(visibleAnswer, answer, `FAQ answer for "${question.name}" is not present verbatim as visible copy`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-list-perfectly\.html"|href="vs-list-perfectly\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-list-perfectly\.html/);
});

test('the comparison page links back to the tool and a worked example', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/does-it-actually-sell-there\.html"/);
});
