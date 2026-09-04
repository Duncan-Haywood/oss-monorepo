import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-servicetitan.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial, tax, legal, or engineering advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with ServiceTitan', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by ServiceTitan, Inc\./);
});

test('no unverifiable price is claimed for ServiceTitan', () => {
  // servicetitan.com is not reachable from this session (network egress in
  // this environment is proxied and does not permit fetching arbitrary
  // vendor sites), so no current feature list, plan name, or price could be
  // confirmed against a primary source -- same discipline vs-buildertrend.html
  // uses for Buildertrend and vs-acculynx.html uses for AccuLynx. Only
  // well-documented, non-numeric identity facts (founding year, founders,
  // headquarters city, product category, publicly described feature areas)
  // are stated; no dollar figure for ServiceTitan appears anywhere on the
  // page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/duncan-haywood\.github\.io\/monorepo-projects\/hvac-maintenance-contract-calculator\/vs-servicetitan\.html">/,
  );
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

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-servicetitan\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-servicetitan\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-for-an-hvac-maintenance-contract\.html"/);
});
