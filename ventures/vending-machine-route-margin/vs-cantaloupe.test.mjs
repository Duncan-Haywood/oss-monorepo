import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-cantaloupe.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /MIT licensed/);
  assert.match(html, /GitHub Sponsors/);
});

test('states it is not affiliated with Cantaloupe', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Cantaloupe, Inc\./);
});

test('every numeric pricing claim about Cantaloupe is cited to its own pricing page', () => {
  // Verified via WebSearch (WebFetch cannot reach cantaloupe.com -- the
  // egress proxy blocks the domain, same limitation vs-rover.test.mjs
  // records for rover.com), which surfaced Cantaloupe's own published
  // pricing page for Cantaloupe One: base subscription plans starting
  // around $18.95/month, plus roughly $8-12/machine/month in telemetry and
  // software fees. That is Cantaloupe's own documentation, cited by URL
  // beside every figure below rather than stated as a bare number.
  const sourceUrl = 'https://www.cantaloupe.com/pricing/cantaloupe-one/';
  assert.ok(html.includes(sourceUrl), 'the Cantaloupe pricing page must be cited on the page');
  const body = html.slice(html.indexOf('<body>'));
  const numberPattern = /\$\d|\d+(\.\d+)?%/g;
  const citationIndex = body.indexOf(sourceUrl);
  assert.ok(citationIndex > -1, 'the citation must appear in the visible body, not only in head metadata');
  const citations = [];
  let cIdx = body.indexOf(sourceUrl);
  while (cIdx > -1) {
    citations.push(cIdx);
    cIdx = body.indexOf(sourceUrl, cIdx + 1);
  }
  let match;
  const numberIndexes = [];
  while ((match = numberPattern.exec(body))) numberIndexes.push(match.index);
  assert.ok(numberIndexes.length > 0, 'expected at least one cited pricing figure on the page');
  for (const idx of numberIndexes) {
    const near = citations.some((c) => Math.abs(c - idx) < 900);
    assert.ok(near, `number at body offset ${idx} is not near a Cantaloupe pricing citation`);
  }
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-cantaloupe\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-cantaloupe\.html"|href="vs-cantaloupe\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-cantaloupe\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('the anchors this page links to actually exist on the tool page', () => {
  assert.match(indexHtml, /id="profit"/);
  assert.match(indexHtml, /id="routeTotal"/);
});
