import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./vs-doing-it-by-hand.html', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the calculator links to its by-hand comparison page and is listed in the sitemap', () => {
  assert.match(indexHtml, /vs-doing-it-by-hand\.html/);
  assert.match(sitemap, /vs-doing-it-by-hand\.html/);
});

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not licensing, legal, tax, or financial advice/i);
});

test('carries the best-effort hosting disclaimer', () => {
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
});

test('names no specific product or company -- this is a generic-method comparison', () => {
  // This page compares against pricing tuition by hand or in a spreadsheet --
  // a generic method every center director already has access to, not a
  // company or product a reader could mistake this for. It is therefore
  // exempt from the "not affiliated" clause in platform/pages/clauses.mjs's
  // COMPARISON_DISCLAIMER_EXEMPT set, and this test pins the very sentence
  // that exemption depends on staying true: an author who later named a
  // specific spreadsheet app or childcare platform here would be claiming an
  // exemption for a page that had become the thing it exempts.
  assert.match(html, /names no spreadsheet application, childcare management platform, or vendor at all/);
  assert.doesNotMatch(html, /not affiliated with/i);
});

test('the canonical tag names this file, matching the venture\'s own relative convention', () => {
  assert.match(html, /<link rel="canonical" href="vs-doing-it-by-hand\.html">/);
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

test('the FAQPage JSON-LD answers are verbatim on the visible page, not only inside the script tag', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(visible.includes(acceptedAnswer.text), `answer not found verbatim outside the JSON-LD script tag: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the page never claims a network call, matching every other page on this static site', () => {
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|<script src=/);
});

test('the comparison page is linked from the tool page and links back to it', () => {
  assert.match(indexHtml, /href="vs-doing-it-by-hand\.html"/);
  assert.match(html, /<a href="\.\/">/);
});

test('links to the existing named-product comparison page rather than orphaning it', () => {
  assert.match(html, /href="vs-procare\.html"/);
});

test('explains the empty-seat cost and the occupancy break-even that a spreadsheet does not set up on its own', () => {
  assert.match(html, /empty seat/i);
  assert.match(html, /occupancy table/i);
});
