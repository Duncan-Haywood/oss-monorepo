import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-doing-it-by-hand.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal or business advice/i);
});

test('disclaims a service-of-process validity determination, not just a warranty', () => {
  assert.match(html, /does not determine whether service was validly effected/);
});

test('names no specific competitor as the subject of its own comparison, so it stays out of COMPARISON_DISCLAIMER_EXEMPT for a real reason', () => {
  // This page compares against a generic method (hand tally / spreadsheet),
  // not a named product, so it carries no "not affiliated" trademark clause.
  // It does cross-link the venture's own vs-servemanager.html once (checked
  // below), which is expected -- what it must not do is turn into a second
  // ServeManager comparison, e.g. by naming it inside the FAQ schema or the
  // comparison table where a competitor claim would need sourcing.
  const mentions = (html.match(/ServeManager/g) || []).length;
  assert.equal(mentions, 1, `expected exactly one cross-link mention of ServeManager, found ${mentions}`);
  assert.doesNotMatch(JSON.stringify(html.match(/<script type="application\/ld\+json">.*?<\/script>/s)?.[0] ?? ''), /ServeManager/);
});

test('the canonical tag names this file', () => {
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/example\.invalid\/process-server-fee-calculator\/vs-doing-it-by-hand\.html">/,
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
  assert.match(indexHtml, /href="\.\/vs-doing-it-by-hand\.html"|href="vs-doing-it-by-hand\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-doing-it-by-hand\.html/);
});

test('the comparison page links back to the calculator and to the worked-example guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="is-this-process-server-fee-schedule-worth-it\.html"/);
});

test('the comparison page also cross-links the named-competitor page', () => {
  assert.match(html, /href="vs-servemanager\.html"/);
});

test('does not claim a dollar figure for any unverified third party', () => {
  // Same discipline as vs-servemanager.test.mjs: this page argues a generic
  // method, so it should not need to invent or claim pricing for any
  // spreadsheet product either.
  assert.doesNotMatch(html, /\$\d+(\.\d+)?\s*\/\s*(month|year|mo|yr)/i);
});
