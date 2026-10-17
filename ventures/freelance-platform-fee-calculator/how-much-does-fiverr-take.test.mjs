import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./how-much-does-fiverr-take.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial, tax, or legal advice/);
});

test('carries the not-affiliated disclaimer naming Fiverr', () => {
  assert.match(html, /Not affiliated with, endorsed by, or sponsored by Fiverr/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/how-much-does-fiverr-take\.html">/);
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

test('the guide states the flat 20% Fiverr commission, matching FIVERR_FEE_PERCENT in calc.mjs', async () => {
  const { FIVERR_FEE_PERCENT } = await import('./calc.mjs');
  assert.equal(FIVERR_FEE_PERCENT, 20);
  assert.match(html, /flat 20%/);
});

test('the guide links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('the guide is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="how-much-does-fiverr-take\.html"/);
});

test('the guide is listed in the sitemap', () => {
  assert.match(sitemap, /how-much-does-fiverr-take\.html/);
});
