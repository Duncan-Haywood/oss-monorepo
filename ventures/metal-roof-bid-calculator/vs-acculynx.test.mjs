import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-acculynx.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, legal, tax, financial, or engineering advice/i);
});

test('states it is not affiliated with AccuLynx or Verisk', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by AccuLynx or Verisk Analytics, Inc\./);
});

test('no invented subscription price is claimed for AccuLynx', () => {
  // acculynx.com is not reachable from this session (network egress in this
  // environment is proxied and does not permit fetching arbitrary vendor
  // sites), so no current plan name or subscription price could be confirmed
  // against AccuLynx's own site -- same discipline the other vs-* pages in
  // this repo use. The one dollar figure on this page ($2.35 billion) is the
  // publicly reported, widely-covered Verisk acquisition price, not a made-up
  // AccuLynx subscription cost, so it is checked for specifically rather than
  // banning "$" outright.
  const dollarFigures = html.match(/\$[\d.]+(?:\s*billion)?/g) || [];
  for (const figure of dollarFigures) {
    assert.match(figure, /\$2\.35\s*billion/, `unexpected dollar figure on the page: ${figure}`);
  }
  assert.ok(dollarFigures.length > 0, 'expected the verified $2.35 billion acquisition figure to appear');
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-acculynx\.html">/);
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

test('the FAQPage JSON-LD answers are verbatim on the page (word for word)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-acculynx\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-acculynx\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-for-a-metal-roof\.html"/);
});
