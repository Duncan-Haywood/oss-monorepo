import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-smartcat.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('carries the support paragraph', () => {
  assert.match(html, /Optional support/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with Smartcat', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Smartcat/);
});

test('no unverifiable price is claimed for Smartcat', () => {
  // Smartcat's own pricing and plan terms are not reachable from this
  // session to confirm today's figures, so no dollar amount for Smartcat is
  // invented here -- only its well-documented scope as a CAT-tool and
  // localization-management platform is described, same discipline as
  // cam-reconciliation-check/vs-yardi.html.
  const smartcatSection = html.split('Common questions')[0];
  assert.doesNotMatch(smartcatSection, /Smartcat[^.]*\$\d/);
  assert.doesNotMatch(html, /\$\d[\d,]*(\.\d+)?\s*(\/|per)\s*(year|yr|month|mo)/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-smartcat\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-smartcat\.html"|href="vs-smartcat\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-smartcat\.html/);
});

test('the comparison page links back to the calculator and to the quoting guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/how-to-quote-a-translation-project\.html"/);
});

test('the page never claims a network call, matching every other page on this static site', () => {
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|<script src=/);
});
