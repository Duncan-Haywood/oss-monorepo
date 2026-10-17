import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('./vs-checking-each-package-on-npmjs-by-hand.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the checker links to its npmjs-by-hand comparison page and the sitemap lists it', () => {
  assert.match(html, /href="\.?\/?vs-checking-each-package-on-npmjs-by-hand\.html"/);
  assert.match(sitemap, /vs-checking-each-package-on-npmjs-by-hand\.html/);
});

test('the comparison page names the target and links back to the checker', () => {
  assert.match(page, /<title>npm Provenance Check vs\. checking each package on npmjs\.com by hand<\/title>/);
  assert.match(page, /<h1>npm Provenance Check vs\. checking each package on npmjs\.com by hand<\/h1>/);
  assert.match(page, /name="description"/);
  assert.match(page, /<a href="\.\/">/);
});

// platform/pages/build.mjs derives the compared product for the catalogue's
// /compare/ index from the text after the last "vs." in the <h1>, falling
// back to the <title>. Same shape assert as this repo's other generic-method
// comparison pages (e.g. pypi-provenance-check's own
// vs-checking-each-package-on-pypi-by-hand.test.mjs, which this page mirrors).
test('the <h1> ends in the comparison target the build.mjs angle-reader expects', () => {
  const h1 = page.match(/<h1>([^<]+)<\/h1>/)[1];
  const after = h1.split(/\svs\.?\s/i).pop().trim();
  assert.equal(after, 'checking each package on npmjs.com by hand');
});

// This is a generic-method comparison (checking npmjs.com by hand), not a
// named product, so it carries no nominative-fair-use / "not affiliated"
// clause -- see platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT,
// which this page's path is added to in the same commit.
test('the page names no competing product or company as the subject of comparison', () => {
  assert.doesNotMatch(page, /pypi-provenance-check|dependency-confusion-check|socket\.dev|snyk/i);
});

test('the standard clauses and the sponsor link are present', () => {
  assert.match(page, /No warranty/);
  assert.match(page, /provided free and as-is, without warranty/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
});

test('the page discloses the read-only npm registry requests rather than claiming no network call at all', () => {
  assert.match(page, /npm registry/i);
  assert.match(page, /read-only/i);
});

test('the page has no script src and records no usage counter', () => {
  assert.doesNotMatch(page, /<script src=/);
  assert.doesNotMatch(page, /recordUsage|countUsage/);
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
