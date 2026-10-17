import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('./vs-checking-a-post-by-eye.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the checker links to its checking-by-eye comparison page and the sitemap lists it', () => {
  assert.match(html, /href="\.\/vs-checking-a-post-by-eye\.html"/);
  assert.match(sitemap, /vs-checking-a-post-by-eye\.html/);
});

test('the comparison page names the target and links back to the checker', () => {
  assert.match(page, /<title>Affiliate Disclosure Checker vs\. checking a post by eye<\/title>/);
  assert.match(page, /<h1>Affiliate Disclosure Checker vs\. checking a post by eye<\/h1>/);
  assert.match(page, /name="description"/);
  assert.match(page, /<a href="\.\/">/);
});

// platform/pages/build.mjs derives the compared product for the catalogue's
// /compare/ index from the text after the last "vs." in the <h1>, falling
// back to the <title>. Same shape assert as this venture's own
// vs-post-affiliate-pro.test.mjs sibling.
test('the <h1> ends in the comparison target the build.mjs angle-reader expects', () => {
  const h1 = page.match(/<h1>([^<]+)<\/h1>/)[1];
  const after = h1.split(/\svs\.?\s/i).pop().trim();
  assert.equal(after, 'checking a post by eye');
});

// This is a generic-method comparison (re-reading a post by eye), not a
// named product, so it carries no nominative-fair-use / "not affiliated"
// clause -- see platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT,
// which this page's path is added to in the same commit. It does cross-link
// to this venture's own named-product comparison page
// (vs-post-affiliate-pro.html), whose link text names that product in
// passing -- that link, not a comparison FAQ about it, is why the name
// appears here at all.
test('the page names no competing product or company as the subject of comparison', () => {
  const withoutCrossLink = page.replace(
    /<a href="\.\/vs-post-affiliate-pro\.html">this checker vs\. Post Affiliate Pro's Disclosure Generator<\/a>/,
    '',
  );
  assert.doesNotMatch(withoutCrossLink, /Post Affiliate Pro/);
});

test('the standard clauses and the sponsor link are present', () => {
  assert.match(page, /No warranty/);
  assert.match(page, /provided free and as-is, without warranty/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
});

test('the page is static: no script src, no network call, no usage counter', () => {
  assert.doesNotMatch(page, /fetch\(|XMLHttpRequest|<script src=/);
  assert.doesNotMatch(page, /recordUsage/);
});

test('the page is structured for a reader and a crawler', () => {
  assert.match(page, /<html lang="en">/);
  assert.match(page, /<meta name="viewport"/);
  assert.match(page, /<link rel="canonical"/);
  assert.match(page, /<meta name="description" content="[^"]{80,}"/);
  assert.equal((page.match(/<h1[ >]/g) || []).length, 1);
});

test('every FAQPage schema question has a matching visible heading', () => {
  const match = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'no JSON-LD found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length >= 3);
  for (const question of schema.mainEntity) {
    assert.ok(page.includes(`<h3>${question.name}</h3>`), `FAQ question "${question.name}" has no matching <h3>`);
  }
});

test('the FAQPage answers appear verbatim on the visible page, not only in the script tag', () => {
  const match = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const schema = JSON.parse(match[1]);
  const visible = page.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(
      visible.includes(acceptedAnswer.text),
      `answer not found verbatim outside the JSON-LD: ${acceptedAnswer.text.slice(0, 60)}...`,
    );
  }
});
