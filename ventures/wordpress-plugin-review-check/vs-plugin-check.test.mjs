import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-plugin-check.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /provided free and as-is, without warranty/);
});

test('carries the best-effort hosting disclaimer', () => {
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
});

test('states it is not affiliated with the WordPress Foundation', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by the WordPress Foundation/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-plugin-check\.html">/);
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
  assert.match(indexHtml, /href="vs-plugin-check\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-plugin-check\.html/);
});

test('the comparison page links back to the checker', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('the page is clear that this checker uploads nothing and makes no network call of its own', () => {
  assert.match(html, /never uploaded/);
  assert.match(html, /makes no network call of its own/);
});

test('does not claim Plugin Check runs outside WordPress', () => {
  // The one fact this page must never get backwards: Plugin Check needs a
  // real or virtual WordPress site to run at all. If a later edit drops
  // that qualifier, the comparison stops being honest.
  assert.match(html, /install(?:ed)? (?:it )?(?:and activate(?:d)? )?(?:it )?(?:on|into) a real (?:or virtual )?WordPress site/);
});

test('names the sourcing for the Plugin Check facts', () => {
  // Positive assertion that the sourcing hedge is present: a later edit that
  // quietly adds a confident, unsourced claim about Plugin Check should fail
  // here rather than ship.
  assert.match(html, /wordpress\.org\/plugins\/plugin-check\//);
});
