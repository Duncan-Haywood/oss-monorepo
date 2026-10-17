import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(
  new URL('./vs-tracking-mrr-in-a-spreadsheet.html', import.meta.url),
  'utf8',
);
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial or business advice/i);
  assert.match(html, /Nothing leaves your browser/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-tracking-mrr-in-a-spreadsheet\.html">/);
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
  assert.match(html, /names no specific product/);
});

test('the worked-example figures match calc.mjs', async () => {
  const { calculateWaterfall } = await import('./calc.mjs');
  const r = calculateWaterfall({
    startingMrr: 10000,
    newMrr: 1200,
    expansionMrr: 1500,
    reactivationMrr: 100,
    contractionMrr: 400,
    churnedMrr: 600,
  });
  assert.equal(r.endingMrr, 11800);
  assert.equal(r.grossRevenueRetention, 90);
  assert.equal(r.netRevenueRetention, 106);
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
  assert.match(indexHtml, /href="(\.\/)?vs-tracking-mrr-in-a-spreadsheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-tracking-mrr-in-a-spreadsheet\.html/);
});
