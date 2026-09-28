import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('./vs-checking-tags-by-eye.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the checker links to its by-eye comparison page and is listed in the sitemap', () => {
  assert.match(index, /vs-checking-tags-by-eye\.html/);
  assert.match(sitemap, /vs-checking-tags-by-eye\.html/);
});

test('names no vendor or competing product', () => {
  // Compares against a generic manual habit (reading the tags in
  // view-source or DevTools), not a named competitor, so this page claims
  // the no-vendor-named exemption in platform/pages/clauses.mjs's
  // COMPARISON_DISCLAIMER_EXEMPT set rather than carrying a
  // not-affiliated clause. Distinct from this venture's own
  // vs-facebook-sharing-debugger.html and vs-screamingfrog.html, which
  // each name a real product and carry that clause.
  assert.doesNotMatch(page, /not\s+affiliated\s+with/i);
});

test('the page is structured for a reader and a crawler, and carries the standard disclaimers', () => {
  assert.match(page, /<title>Social Preview Checker vs\. checking your tags by eye/);
  assert.match(page, /<html lang="en">/);
  assert.match(page, /<meta name="viewport"/);
  assert.match(page, /<link rel="canonical" href="\.\/vs-checking-tags-by-eye\.html">/);
  assert.match(page, /<meta name="description" content="[^"]{80,}"/);
  assert.equal((page.match(/<h1[ >]/g) || []).length, 1);
  assert.match(page, /"@type":"FAQPage"/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /No warranty/);
  assert.match(page, /GitHub Sponsors/);
});

test('the page never claims a network call or invokes the usage counter, matching every other static page in the catalogue', () => {
  assert.doesNotMatch(page, /fetch\(|XMLHttpRequest|<script src=/);
  assert.doesNotMatch(page, /recordUsage/);
});

test('the structured data on the page is valid JSON', () => {
  const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length > 0, 'no structured data found');
  for (const [, body] of blocks) {
    assert.doesNotThrow(() => JSON.parse(body), 'malformed JSON-LD block');
  }
});

test('every FAQ answer in the JSON-LD is also visible, verbatim, as page copy', () => {
  const match = page.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.ok(schema.mainEntity.length >= 3);
  for (const question of schema.mainEntity) {
    assert.ok(page.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
    assert.ok(page.includes(question.acceptedAnswer.text), `answer not found verbatim on the page: ${question.acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the page states the real, documented platform minimum image sizes rather than an invented figure', () => {
  // Pinned against analyze.mjs's own exported constants so this page can't
  // drift out of sync with the numbers the checker itself enforces.
  assert.match(page, /200x200/);
  assert.match(page, /300x157/);
});
