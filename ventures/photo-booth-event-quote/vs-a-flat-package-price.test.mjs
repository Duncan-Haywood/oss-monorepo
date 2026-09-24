import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-package-price.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

// This page compares against a generic pricing method (a flat package), not
// a named competitor, so it names no company and carries no affiliation
// disclaimer -- unlike vs-photobooth-supply-co.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /Photobooth Supply Co/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-package-price\.html">/);
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

test('the FAQPage JSON-LD answers are verbatim on the page (word for word)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const question of schema.mainEntity) {
    const acceptedAnswer = question.acceptedAnswer;
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-package-price\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-package-price\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

// The three worked-example rows are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's defaults ever change, this
// page's numbers must be re-derived, not left stale.
test('the worked-example table figures match calc.mjs run against its own DEFAULTS', async () => {
  const { calculateQuote, DEFAULTS } = await import('./calc.mjs');

  function run(overrides) {
    return calculateQuote({ ...DEFAULTS, ...overrides });
  }

  const base = run({});
  const busy = run({ expectedPrints: 400, milesRoundTrip: 40, driveMinutesRoundTrip: 60 });
  const wedding = run({
    attendantCount: 2,
    expectedPrints: 500,
    milesRoundTrip: 60,
    driveMinutesRoundTrip: 80,
  });

  assert.equal(base.price.toFixed(2), '468.68');
  assert.equal(busy.price.toFixed(2), '640.38');
  assert.equal(wedding.price.toFixed(2), '1032.50');

  assert.equal((500 - base.price).toFixed(2), '31.32');
  assert.equal((busy.price - 500).toFixed(2), '140.38');
  assert.equal((wedding.price - 500).toFixed(2), '532.50');

  assert.match(html, /\$468\.68/);
  assert.match(html, /\$640\.38/);
  assert.match(html, /\$1,032\.50/);
  assert.match(html, /\$31\.32/);
  assert.match(html, /\$140\.38/);
  assert.match(html, /\$532\.50/);
});
