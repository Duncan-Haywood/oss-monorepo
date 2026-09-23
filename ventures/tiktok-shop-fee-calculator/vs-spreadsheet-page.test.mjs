import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(
  new URL('./vs-tracking-it-in-a-spreadsheet.html', import.meta.url),
  'utf8',
);
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or business advice/i);
  assert.match(html, /Nothing leaves your browser/);
});

test('states it is not affiliated with TikTok', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by TikTok/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-tracking-it-in-a-spreadsheet\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(
    /<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s,
  );
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  for (const question of schema.mainEntity) {
    assert.ok(
      html.includes(`<h3>${question.name}</h3>`),
      `FAQ schema question "${question.name}" has no matching <h3> on the page`,
    );
  }
});

test('names no specific competing product -- this is the generic-method comparison', () => {
  // The venture already carries a tool-vs-tool page (vs-tiktok-shops-seller-university.html).
  // This one's angle is "vs doing it in a spreadsheet" and must stay generic, per
  // platform/pages/surface-budget.mjs's one-generic-method-page-per-venture budget.
  assert.match(html, /names no specific product/);
});

test('every internal link on the page resolves to a file in this venture', () => {
  const internalHrefs = [...html.matchAll(/href="(\.\/|(?!https?:)[a-z0-9#-]+\.html)([^"]*)"/gi)]
    .map((m) => (m[1] === './' ? './' : m[1] + m[2]))
    .filter((href) => href !== './' && !href.startsWith('../'));
  for (const href of internalHrefs) {
    const target = new URL(href, import.meta.url);
    assert.ok(fs.existsSync(target), `broken internal link: ${href}`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="(\.\/)?vs-tracking-it-in-a-spreadsheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-tracking-it-in-a-spreadsheet\.html/);
});
