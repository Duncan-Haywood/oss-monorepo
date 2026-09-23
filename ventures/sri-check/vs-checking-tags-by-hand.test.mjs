import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('./vs-checking-tags-by-hand.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the checker links to its checking-by-hand comparison page and is listed in the sitemap', () => {
  assert.match(index, /vs-checking-tags-by-hand\.html/);
  assert.match(sitemap, /vs-checking-tags-by-hand\.html/);
});

test('the vs-checking-tags-by-hand page names no competing product and carries the standard disclaimer', () => {
  assert.match(page, /<title>SRI Checker &amp; Hash Generator vs\. checking tags by hand/);
  assert.match(page, /name="description"/);
  assert.match(page, /"@type":"FAQPage"/);
  assert.match(page, /href="\.\/"/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /No warranty/);
  assert.match(page, /GitHub Sponsors/);
});

// This is a generic-method comparison (checking tags by hand), not a named
// product, so it carries no nominative-fair-use / "not affiliated" clause --
// see platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT, which this
// page's path is added to in the same commit. It does cross-link to this
// venture's own named-product comparison page (vs-srihash.html), so it
// mentions that competitor's name in passing -- that link, not a comparison
// FAQ about srihash.org, is why the name appears here at all.
test('the vs-checking-tags-by-hand page never claims a network call, matching every other page on this static site', () => {
  assert.doesNotMatch(page, /fetch\(|XMLHttpRequest|<script src=/);
});

test('the vs-checking-tags-by-hand page never invokes the usage counter, matching every other comparison page in the catalogue', () => {
  assert.doesNotMatch(page, /recordUsage/);
});

test('the vs-checking-tags-by-hand page is structured for a reader and a crawler', () => {
  assert.match(page, /<html lang="en">/);
  assert.match(page, /<meta name="viewport"/);
  assert.match(page, /<link rel="canonical"/);
  assert.match(page, /<meta name="description" content="[^"]{80,}"/);
  assert.equal((page.match(/<h1[ >]/g) || []).length, 1);
});

test('the structured data on the vs-checking-tags-by-hand page is valid JSON', () => {
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
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(page.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
    assert.ok(page.includes(question.acceptedAnswer.text), `answer not found verbatim on the page: ${question.acceptedAnswer.text.slice(0, 60)}...`);
  }
});
