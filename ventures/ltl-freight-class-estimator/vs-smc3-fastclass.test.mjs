import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-smc3-fastclass.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or shipping advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with SMC³', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by SMC/);
});

test('names a checkable source for what FastClass is, instead of a figure only SMC³ could confirm', () => {
  assert.match(html, /smc3\.com\/fastclass\.htm/);
  // This page has no legitimate reason to state a price for FastClass -- SMC³
  // does not publish current pricing, so any dollar figure here would be a
  // fabricated or stale claim (a 2000-era press figure exists but is not
  // current). Same guard pattern owner-operator-cpm-calculator's vs-atbs
  // test uses for the same reason.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/ltl-freight-class-estimator\/vs-smc3-fastclass\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('does not claim FastClass performs a density estimate itself, only NMFC lookup', () => {
  // FastClass includes a density calculator as one of its features (per
  // SMC³'s own product materials), so a claim that FastClass "cannot"
  // compute density would be false. The page instead distinguishes on the
  // commodity-lookup job, not on density math.
  assert.doesNotMatch(html, /FastClass[^.]*\bcannot\b[^.]*density/i);
  assert.doesNotMatch(html, /FastClass[^.]*\bno\b[^.]*density calculat/i);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-smc3-fastclass\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-smc3-fastclass\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});
