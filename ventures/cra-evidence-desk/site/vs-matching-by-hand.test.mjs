import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-matching-by-hand.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, regulatory, or compliance advice/i);
});

test('carries the support paragraph', () => {
  assert.match(html, /Support on GitHub Sponsors/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no specific company or product, since this is a generic-method comparison', () => {
  assert.match(html, /names no specific company or product/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-matching-by-hand\.html"\s*\/?>/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">\s*(\{[\s\S]*?"@type":\s*"FAQPage"[\s\S]*?\})\s*<\/script>/);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-matching-by-hand\.html"|href="vs-matching-by-hand\.html"/);
});

test('the comparison page links back to the calculator and to the naming-mismatch explainer', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/sbom-and-advisory-package-names-dont-match\.html"/);
});

test('nothing is loaded from a third-party origin', () => {
  const external = [...html.matchAll(/(?:src|href)="(https?:)?\/\/([^"]+)"/g)].map((m) => m[2]);
  const allowed = external.filter((url) => url.startsWith('github.com/sponsors/'));
  assert.deepEqual(external.filter((url) => !allowed.includes(url)), []);
  assert.ok(!/<link[^>]+rel="(stylesheet|preconnect)"/.test(html), 'no external stylesheet or preconnect');
});
