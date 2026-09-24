import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-homelights-net-proceeds-calculator.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or real-estate advice/i);
});

test('carries the not-affiliated trademark disclaimer, PRODUCT_PLAYBOOK.md §5f', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by HomeLight/i);
  assert.match(html, /HomeLight is a trademark of HomeLight, Inc\./);
});

test('states HomeLight facts as sourced, not an attack', () => {
  // The claims on this page that would be unsafe if they drifted into
  // unsourced or unverifiable statements about a named competitor's
  // product. Each is attributed to HomeLight's own published description,
  // per §5f rule 2.
  assert.match(html, /HomeLight's own description/);
  assert.doesNotMatch(html, /HomeLight[^.]{0,80}\b(bad|broken|scam|worse value)\b/i);
  assert.doesNotMatch(html, /\b(bad|broken|scam|worse value)\b[^.]{0,80}HomeLight/i);
});

test('names no address, price, or live figure attributed to HomeLight', () => {
  // This page describes HomeLight's calculator in general terms only -- it
  // cannot make a live comparison against HomeLight's actual output, since
  // outbound HTTPS to arbitrary hosts is proxied and denied from this
  // environment (see vs-zillows-home-sale-calculator.test.mjs for the same
  // constraint on a different comparison page in this venture).
  assert.match(html, /makes no live comparison against HomeLight's actual output/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-homelights-net-proceeds-calculator\.html">/);
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

test('every FAQPage answer is on the page verbatim', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const question of schema.mainEntity) {
    const answer = question.acceptedAnswer.text;
    assert.ok(html.includes(`<p>${answer}</p>`), `FAQ answer for "${question.name}" is not on the page verbatim`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-homelights-net-proceeds-calculator\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-homelights-net-proceeds-calculator\.html/);
});

test('the comparison page links back to the calculator and to the offer comparison', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="offer-comparison\.html"/);
});
