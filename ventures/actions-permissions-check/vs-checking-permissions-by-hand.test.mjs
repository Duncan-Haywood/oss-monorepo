import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-checking-permissions-by-hand.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not a security audit/);
});

test('carries the best-effort hosting disclaimer', () => {
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
});

test('names no specific competing product or company', () => {
  // This is the generic-method comparison ("checking by hand"), not the
  // named-product one (vs-openssf-scorecard.html) -- it must not name
  // Scorecard or any other product, which is what makes the trademark
  // disclaimer inapplicable here (see clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT).
  assert.doesNotMatch(html, /Scorecard/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-checking-permissions-by-hand\.html">/);
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
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="(\.\/)?vs-checking-permissions-by-hand\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-checking-permissions-by-hand\.html/);
});

test('the comparison page links back to the checker', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('the page is clear that this checker uploads nothing and makes no network call', () => {
  assert.match(html, /never uploaded/);
  assert.match(html, /makes no network call/);
});

test('the page never claims a clean scan means the workflow is secure', () => {
  const prose = html.replace(/<script[\s\S]*?<\/script>/g, '');
  const claims = /\b(?:is|are|was|were)\s+secure\b/gi;
  for (const match of prose.matchAll(claims)) {
    const preceding = prose.slice(Math.max(0, match.index - 60), match.index);
    const denied = /\b(?:never|not|no|cannot|does not|doesn't)\b/i.test(preceding);
    assert.ok(denied, `unqualified security claim near: ${JSON.stringify(prose.slice(Math.max(0, match.index - 60), match.index + 40))}`);
  }
});

test('describes the inheritance behaviour that a manual read of the workflow can miss', () => {
  assert.match(html, /inherit/i);
});
