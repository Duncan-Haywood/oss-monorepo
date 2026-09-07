import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-vendsoft.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('carries the licence and sponsor paragraph', () => {
  assert.match(html, /MIT licensed/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('states it is not affiliated with VendSoft', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by VendSoft/);
});

test('every dollar or percentage figure about VendSoft sits near a citation to its own pricing page', () => {
  // WebFetch cannot reach vendsoft.com directly from this sandbox (egress
  // proxy blocks the domain), but WebSearch independently surfaced and
  // cross-corroborated (GetApp, SoftwareFinder, Software Advice, wifitalents)
  // VendSoft's own published pricing: a Basic plan at $1/machine/month with a
  // $19/month minimum, and a Premium plan at $2/machine/month with a
  // $49/month minimum. That is VendSoft's own published pricing, not a guess,
  // so every such figure on this page must stay within reach of a citation to
  // vendsoft.com/pricing/ rather than standing as a bare, unattributed number.
  const sourceUrl = 'https://www.vendsoft.com/pricing/';
  assert.ok(html.includes(sourceUrl), 'the VendSoft pricing page must be cited on the page');
  const body = html.slice(html.indexOf('<body>'));
  const numberPattern = /\$\d|\d+(\.\d+)?%/g;
  let match;
  const numberIndexes = [];
  while ((match = numberPattern.exec(body))) numberIndexes.push(match.index);
  assert.ok(numberIndexes.length > 0, 'expected at least one cited pricing figure on the page');
  const citations = [];
  let cIdx = body.indexOf(sourceUrl);
  while (cIdx > -1) {
    citations.push(cIdx);
    cIdx = body.indexOf(sourceUrl, cIdx + 1);
  }
  for (const idx of numberIndexes) {
    const near = citations.some((c) => Math.abs(c - idx) < 900);
    assert.ok(near, `number at body offset ${idx} is not near a VendSoft pricing citation`);
  }
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-vendsoft\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-vendsoft\.html"|href="vs-vendsoft\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-vendsoft\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('the anchors this page links to actually exist on the tool page', () => {
  assert.match(indexHtml, /id="price"/);
  assert.match(indexHtml, /id="routeRevenue"/);
});
