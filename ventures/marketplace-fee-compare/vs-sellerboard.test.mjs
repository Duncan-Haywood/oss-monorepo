import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-sellerboard.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, tax, financial,\s+or business advice/i);
});

test('carries the best-effort hosting disclaimer', () => {
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/i);
});

test('carries the support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with Sellerboard', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Sellerboard/);
});

test('no price or figure is attributed to Sellerboard', () => {
  // Sellerboard's current pricing and plan terms are not reachable from the
  // session that wrote this page, so none is stated. The page describes only
  // the product shape Sellerboard documents publicly -- connected, paid,
  // after-the-fact analytics -- and carries no currency amount anywhere,
  // which makes "no invented pricing" checkable rather than a promise.
  assert.doesNotMatch(html, /\$\s?\d/);
});

test('does not claim to evaluate Sellerboard, only to describe its shape', () => {
  assert.match(html, /makes no claim about Sellerboard's accuracy,[\s\r\n]+features, or current terms, and does not evaluate it/);
});

test('states plainly that it does not replace connected analytics', () => {
  // The honest half of a comparison page: a reader must not leave thinking a
  // static fee calculator substitutes for reconciled order data.
  assert.match(html, /<h3>Can this page replace connected seller analytics\?<\/h3>/);
  assert.match(html, /never sees a real order/);
  assert.match(html, /does not know your refunds, returns, or advertising spend/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-sellerboard\.html">/);
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

test('every FAQ answer in the schema also appears as visible copy', () => {
  // The em-dash entity/unicode distinction has broken this repo's
  // faq-visible check before: schema text is plain JSON, so the visible
  // paragraph must be entity-free in the same places.
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const question of schema.mainEntity) {
    const answer = question.acceptedAnswer.text;
    assert.ok(
      html.includes(`<p>${answer}</p>`),
      `FAQ answer for "${question.name}" is not present verbatim as visible copy`,
    );
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-sellerboard\.html"|href="vs-sellerboard\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-sellerboard\.html/);
});

test('the comparison page links back to the tool and the worked example', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/which-marketplace-has-the-lowest-fees\.html"/);
});
