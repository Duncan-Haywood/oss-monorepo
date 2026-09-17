import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-servicetitan.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, engineering, or fire-safety advice/i);
});

test('states it is not affiliated with ServiceTitan', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by ServiceTitan\./);
});

test('no unverifiable price is claimed for ServiceTitan', () => {
  // servicetitan.com is not reachable from this session (network egress in
  // this environment is proxied and does not permit fetching arbitrary vendor
  // sites), so no current plan name or price could be confirmed against a
  // primary source -- the same discipline every other vs-* page in this repo
  // uses. Only the non-numeric identity facts (product category, the areas the
  // product covers, that it is sold as a subscription account) are stated.
  //
  // The assertion is a bare `$<digit>` scan, which also pins a second thing
  // worth keeping true: this page describes the calculator's own worked
  // example in words ("a 28-dollar wage into 53.76 per billable hour") rather
  // than with currency symbols, so a future edit that reaches for `$28` would
  // trip this test and have to decide deliberately whether a dollar sign on
  // this page could be misread as a ServiceTitan price.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
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

test('every FAQPage answer is on the page verbatim', () => {
  // Google's structured-data guidance is that the marked-up answer must be the
  // answer the visitor sees. The headings test above pairs the questions; this
  // pairs the bodies, which is where a later copy edit to one side actually
  // drifts -- the visible paragraph gets reworded and the JSON-LD keeps the
  // old wording, leaving the page marked up with text nobody can read.
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const question of schema.mainEntity) {
    const answer = question.acceptedAnswer.text;
    assert.ok(html.includes(`<p>${answer}</p>`), `FAQ answer for "${question.name}" is not on the page verbatim`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.?\/?vs-servicetitan\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-servicetitan\.html/);
});

test('the comparison page links back to the calculator and to the rate walkthrough', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="what-should-i-charge-per-hour\.html"/);
});
