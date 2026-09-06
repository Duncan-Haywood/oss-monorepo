import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-survey-rates.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not agronomic, tax, financial, or business advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /GitHub Sponsors/);
});

test('does not name or link a specific survey publisher', () => {
  // Unlike a "vs a named competitor" page, this one compares against a
  // category (published custom rate surveys) with no single primary source
  // to cite -- so it must not attribute any figure to a specific named
  // publisher it cannot verify, and says so explicitly.
  assert.match(html, /does not name or link to any specific survey publisher/i);
});

test('makes no numeric claim about survey figures', () => {
  // Every other vs-*.html page in this repo that cites a competitor's fee
  // or rate must source it within 900 chars of a citation link
  // (see vs-rover.test.mjs). This page instead avoids the problem: no
  // primary source for "the" custom rate survey exists to cite, so it must
  // carry zero dollar or percent figures anywhere in the body.
  const body = html.slice(html.indexOf('<body>'));
  assert.doesNotMatch(body, /\$\d/, 'no dollar figures expected on this page');
  assert.doesNotMatch(body, /\d+(\.\d+)?%/, 'no percentage figures expected on this page');
});

test('is linked from the calculator page', () => {
  assert.match(indexHtml, /href="\.\/vs-survey-rates\.html"/);
});

test('is listed in the sitemap', () => {
  assert.match(sitemap, /vs-survey-rates\.html/);
});

test('links back to the calculator', () => {
  assert.match(html, /href="\.\/"/);
});

test('has a canonical link and FAQ structured data', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-survey-rates\.html">/);
  assert.match(html, /"@type":"FAQPage"/);
});
