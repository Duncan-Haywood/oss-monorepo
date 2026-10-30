import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-scoring-every-job-out-of-ten.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial, legal, or business advice/i);
});

test('names no vendor, competing tool, or field-service platform', () => {
  // This page compares against a generic manual habit (scoring each job on
  // a 1-10 scale), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no competing product to
  // disclaim a relationship with. Distinct from this venture's own
  // vs-jobber.html, which names Jobber specifically.
  assert.doesNotMatch(html, /Jobber/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-scoring-every-job-out-of-ten\.html">/);
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
  assert.match(indexHtml, /href="vs-scoring-every-job-out-of-ten\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-scoring-every-job-out-of-ten\.html/);
});

test('the comparison page links back to the tool and to the decision walkthrough', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-do-i-decide-which-job-to-take-first\.html"/);
});

test('has no external script or stylesheet resources', () => {
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"/i);
  const externalHrefs = [...html.matchAll(/https?:\/\/[^"'\s)]+/g)].map((m) => m[0]);
  for (const href of externalHrefs) {
    assert.ok(
      href.startsWith('https://schema.org') || href === 'http://www.w3.org/2000/svg' || href.startsWith('https://github.com/sponsors/Duncan-Haywood'),
      `unexpected external reference: ${href}`,
    );
  }
});
