import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { calculateChangeOrder } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-rough-lump-sum.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial, engineering, or construction advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

// This page compares against a generic pricing method (a rough lump sum),
// not a named competitor, so it names no company or product and carries no
// affiliation disclaimer -- unlike this venture's own vs-buildertrend.html,
// which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /Buildertrend|JobTread|CoConstruct|Procore|Houzz/i);
});

test('the worked example matches calc.mjs', () => {
  // Pins the walk-away price, target price, capped billable price, and margin
  // at the cap quoted in the page's worked example against the calculator's
  // own arithmetic, so a later change to calc.mjs cannot silently strand the
  // page's numbers.
  const result = calculateChangeOrder({
    hours: 24,
    wage: 32,
    burdenPercent: 28,
    materials: 1800,
    subcontractor: 2200,
    daysAdded: 4,
    dailyGeneralConditions: 350,
    markupCapPercent: 15,
    overheadPercent: 10,
    targetMarginPercent: 20,
  });
  assert.equal(result.directCost.toFixed(2), '6383.04');
  assert.equal(result.walkAwayPrice.toFixed(2), '7021.34');
  assert.equal(result.targetPrice.toFixed(2), '8776.68');
  assert.equal(result.cappedPrice.toFixed(2), '7340.50');
  assert.equal((result.marginAtCap * 100).toFixed(1), '4.3');

  assert.match(html, /\$6,383\.04/);
  assert.match(html, /\$7,021\.34/);
  assert.match(html, /\$8,776\.68/);
  assert.match(html, /\$7,340\.50/);
  assert.match(html, /4\.3% margin/);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/change-order-margin-calculator\/vs-a-rough-lump-sum\.html">/);
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
  // The JSON-LD carries a literal em dash (unescaped in JSON, so `—`
  // rather than the `&mdash;` HTML entity), while the visible <p> uses the
  // entity so the markup stays ASCII -- the two render identically but are
  // different bytes, so the visible-copy side is normalized before matching.
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  const normalizedHtml = html.replace(/&mdash;/g, '—');
  for (const question of schema.mainEntity) {
    const answer = question.acceptedAnswer.text;
    assert.ok(normalizedHtml.includes(`<p>${answer}</p>`), `FAQ answer for "${question.name}" is not on the page verbatim`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.?\/?vs-a-rough-lump-sum\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-rough-lump-sum\.html/);
});

test('the comparison page links back to the calculator and the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-to-price-a-change-order\.html"/);
});
