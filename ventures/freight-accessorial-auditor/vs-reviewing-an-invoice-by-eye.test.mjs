import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-reviewing-an-invoice-by-eye.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial, legal, or freight-audit advice/i);
});

test('carries the best-effort hosting and support paragraphs', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-reviewing-an-invoice-by-eye\.html">/);
});

test('the <h1> ends in the comparison target build.mjs\'s angle-reader expects', () => {
  const h1 = html.match(/<h1>([^<]+)<\/h1>/)[1];
  const after = h1.split(/\svs\.?\s/i).pop().trim();
  assert.equal(after, 'reviewing an invoice by eye');
});

// Generic-method comparison (reading an invoice by eye), not a named
// product -- see platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT,
// which this page's path is added to in the same commit. It does not carry
// a "not affiliated" clause because it names no company.
test('the page names no competing product or company as the subject of comparison', () => {
  assert.doesNotMatch(html, /Cass Information Systems|Trax Technologies/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length >= 3);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('the FAQPage answer text matches the visible paragraph exactly (modulo entities)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  const squash = (text) => text.replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&');
  for (const question of schema.mainEntity) {
    assert.ok(
      squash(visible).includes(squash(question.acceptedAnswer.text)),
      `answer for "${question.name}" is not visible on the page verbatim`,
    );
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-reviewing-an-invoice-by-eye\.html"|href="vs-reviewing-an-invoice-by-eye\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-reviewing-an-invoice-by-eye\.html/);
});

test('the comparison page links back to the calculator and to the whole-invoice walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-to-audit-a-whole-freight-invoice\.html"/);
});

test('names the mechanical findings a skim misses: duplicates, free-time-and-cap math, and fuel percent', () => {
  assert.match(html, /duplicate/i);
  assert.match(html, /free time|free allowance/i);
  assert.match(html, /percent of linehaul/i);
  assert.match(html, /never uploaded/);
});

test('does not disparage a manual review', () => {
  const text = html.replace(/<[^>]+>/g, ' ').toLowerCase();
  for (const word of ['worse', 'rip-off', 'ripoff', 'overpriced', 'scam', 'useless', 'stupid', 'lazy']) {
    assert.ok(!text.includes(word), `disparaging word on the page: ${word}`);
  }
});

test('adds no third-party script, font, stylesheet or network call', () => {
  assert.equal(/<script[^>]+src=/i.test(html), false);
  assert.equal(/<link[^>]+href="https?:/i.test(html), false);
  assert.equal(/@import|fonts\.googleapis|cdn\./i.test(html), false);
});

test('the page is structured for a reader and a crawler', () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<meta name="description" content="[^"]{80,}"/);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
});
