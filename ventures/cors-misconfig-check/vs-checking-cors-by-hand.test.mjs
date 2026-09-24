import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('./vs-checking-cors-by-hand.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the checker links to its checking-by-hand comparison page and the sitemap lists it', () => {
  assert.match(html, /href="vs-checking-cors-by-hand\.html"/);
  assert.match(sitemap, /vs-checking-cors-by-hand\.html/);
});

test('the comparison page names what a manual curl request can and cannot show and links back to the checker', () => {
  assert.match(page, /<title>This checker vs\. checking CORS by hand with curl/);
  assert.match(page, /<h1>This checker vs\. checking CORS by hand with curl<\/h1>/);
  assert.match(page, /name="description"/);
  assert.match(page, /href="index\.html"/);
});

// `platform/pages/build.mjs` derives the compared product for the catalogue's
// /compare/ index from the text after the last "vs." in the <h1>, falling
// back to the <title>. Same shape assert as this venture's own
// vs-burp-suite.test.mjs.
test('the <h1> ends in the comparison target the build.mjs angle-reader expects', () => {
  const h1 = page.match(/<h1>([^<]+)<\/h1>/)[1];
  const after = h1.split(/\svs\.?\s/i).pop().trim();
  assert.equal(after, 'checking CORS by hand with curl');
});

// This is a generic-method comparison (running curl by hand), not a named
// product, so it carries no nominative-fair-use / "not affiliated" clause --
// see platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT, which this
// page's path is added to in the same commit. It does cross-link to this
// venture's own named-product comparison page (vs-burp-suite.html), so it
// mentions that competitor's name in passing -- that link, not a comparison
// FAQ about Burp Suite, is why the name appears here at all.
test('the page names no competing product or company as the subject of comparison', () => {
  assert.doesNotMatch(page, /PortSwigger/);
});

test('the standard clauses and the sponsor link are present', () => {
  assert.match(page, /No warranty/);
  assert.match(page, /provided free and as-is, without warranty/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /href="LICENSE"/);
  assert.match(page, /MIT licen[cs]e/);
  assert.match(page, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
});

test('the "only test what you are authorised to" caution carries onto this page too', () => {
  assert.match(page, /authoris(?:ed|ation)/i);
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
