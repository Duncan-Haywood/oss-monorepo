import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-yardi.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, tax, financial, or real-estate advice/i);
});

test('carries the support paragraph', () => {
  assert.match(html, /Optional support/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with Yardi', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Yardi Systems, Inc\./);
});

test('no unverifiable price is claimed for Yardi', () => {
  // Yardi's own pricing and licensing terms are not reachable from this
  // session to confirm today's figures, so no dollar amount for Yardi is
  // invented here -- only its well-documented scope as a property-management
  // and accounting platform is described.
  const yardiSection = html.split('Common questions')[0];
  assert.doesNotMatch(yardiSection, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-yardi\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-yardi\.html"|href="vs-yardi\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-yardi\.html/);
});

test('the comparison page links back to the calculator and to the square-footage explainer', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/how-much-cam-do-i-owe-based-on-square-footage\.html"/);
});
