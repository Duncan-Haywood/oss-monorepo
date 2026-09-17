import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-extensiv.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not engineering, legal, tax, financial, or compliance advice/i);
});

test('carries the support paragraph', () => {
  assert.match(html, /Optional support/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with Extensiv', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Extensiv, Inc\./);
});

test('no unverifiable price is claimed for Extensiv', () => {
  // Extensiv's own pricing and current feature set are not reachable from
  // this session to confirm today's figures, so no dollar amount for
  // Extensiv is invented here -- only its well-documented scope as a 3PL
  // warehouse-management platform is described.
  const extensivSection = html.split('Common questions')[0];
  assert.doesNotMatch(extensivSection, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/fifo-pick-evidence\/vs-extensiv\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-extensiv\.html"|href="vs-extensiv\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-extensiv\.html/);
});

test('the comparison page links back to the tool and to the FIFO-exception explainer', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/what-counts-as-a-fifo-exception\.html"/);
});
