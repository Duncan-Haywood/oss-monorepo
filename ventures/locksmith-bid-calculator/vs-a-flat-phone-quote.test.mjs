import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { calculateQuote, DEFAULTS } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-flat-phone-quote.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, licensing, or business advice/i);
});

test('names no specific competitor as the subject of its own comparison, so it stays out of COMPARISON_DISCLAIMER_EXEMPT for a real reason', () => {
  // This page compares against a generic method (a flat phone quote), not a
  // named product, so it carries no "not affiliated" trademark clause. It
  // does cross-link the venture's own vs-jobber.html once (checked below),
  // which is expected -- what it must not do is turn into a second Jobber
  // comparison, e.g. by naming it inside the FAQ schema.
  const mentions = (html.match(/Jobber/g) || []).length;
  assert.equal(mentions, 1, `expected exactly one cross-link mention of Jobber, found ${mentions}`);
  assert.doesNotMatch(JSON.stringify(html.match(/<script type="application\/ld\+json">.*?<\/script>/s)?.[0] ?? ''), /Jobber/);
});

test('the canonical tag names this file', () => {
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/example\.invalid\/locksmith-bid-calculator\/vs-a-flat-phone-quote\.html">/,
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
  assert.match(indexHtml, /href="\.\/vs-a-flat-phone-quote\.html"|href="vs-a-flat-phone-quote\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-phone-quote\.html/);
});

test('the comparison page links back to the calculator and to the worked-example guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-should-a-locksmith-charge-for-a-service-call\.html"/);
});

test('the comparison page also cross-links the named-competitor page', () => {
  assert.match(html, /href="vs-jobber\.html"/);
});

test('the worked figures match calc.mjs exactly', () => {
  const standard = calculateQuote(DEFAULTS);
  assert.equal(DEFAULTS.laborMinutes, 30);
  assert.equal(DEFAULTS.travelMinutes, 20);
  assert.equal(DEFAULTS.partsCost, 40);
  assert.equal(standard.finalPrice.toFixed(2), '283.62');
  assert.match(html, /\$283\.62/);

  const short = calculateQuote({ ...DEFAULTS, laborMinutes: 5, travelMinutes: 5, partsCost: 0 });
  assert.equal(short.target.toFixed(2), '85.43');
  assert.equal(short.finalPrice, DEFAULTS.minimumServiceCharge);
  assert.ok(short.minimumApplied);
  assert.match(html, /\$85\.43/);
});

test('does not claim a dollar figure for any unverified third party', () => {
  // Same discipline as vs-doing-it-by-hand.test.mjs elsewhere in the
  // portfolio: this page argues a generic method, so it should not need to
  // invent or claim pricing for any app, franchise, or vendor either.
  assert.doesNotMatch(html, /\$\d+(\.\d+)?\s*\/\s*(month|year|mo|yr)/i);
});
