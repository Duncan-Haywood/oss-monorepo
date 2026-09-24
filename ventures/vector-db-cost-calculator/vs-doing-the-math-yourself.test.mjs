import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-doing-the-math-yourself.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial or engineering advice/i);
});

test('carries the best-effort hosting and support paragraphs', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no vendor or competing product in its own title or comparison', () => {
  // This page compares against the generic manual method of reading pricing
  // pages and doing the arithmetic by hand, not a named product, so it is
  // listed in platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT
  // rather than carrying a "not affiliated" clause -- there is no company to
  // disclaim a relationship with. Same shape as this venture's own
  // vs-pinecone.html, which does name Pinecone and does carry that clause.
  // The "More:" footnote legitimately cross-links to vs-pinecone.html, so
  // the check is scoped to the title and lede rather than the whole document.
  assert.doesNotMatch(html, /<title>[^<]*Pinecone/i);
  const h1 = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/i)[0];
  assert.doesNotMatch(h1, /Pinecone|Weaviate|Qdrant/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-doing-the-math-yourself\.html">/);
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

test('the worked example matches estimatedStorageGb and compareProviders on the numbers described', async () => {
  const { estimatedStorageGb, compareProviders } = await import('./calc.mjs');

  const rawOnlyGb = (1_000_000 * 1536 * 4) / 1024 ** 3;
  const fullGb = estimatedStorageGb({
    vectorCount: 1_000_000,
    dimension: 1536,
    metadataBytesPerVector: 200,
    indexOverhead: 1.3,
  });
  assert.equal(rawOnlyGb.toFixed(2), '5.72');
  assert.equal(fullGb.toFixed(2), '7.68');

  const queriesMillion = 5;
  const providersFor = (storageGb) => [
    { name: 'Provider A', storageGb, queriesMillion, storageRate: 0.33, queryRate: 8, freeStorageGb: 0, freeQueriesMillion: 0 },
    { name: 'Provider B', storageGb, queriesMillion, storageRate: 0.25, queryRate: 5, freeStorageGb: 1, freeQueriesMillion: 1 },
  ];

  const manual = compareProviders(providersFor(rawOnlyGb));
  const withTool = compareProviders(providersFor(fullGb));

  assert.equal(manual.results.find((r) => r.name === 'Provider A').total.toFixed(2), '41.89');
  assert.equal(manual.results.find((r) => r.name === 'Provider B').total.toFixed(2), '21.18');
  assert.equal(withTool.results.find((r) => r.name === 'Provider A').total.toFixed(2), '42.53');
  assert.equal(withTool.results.find((r) => r.name === 'Provider B').total.toFixed(2), '21.67');

  assert.match(html, /5\.72 GB/);
  assert.match(html, /7\.68 GB/);
  assert.match(html, /\$41\.89\/month/);
  assert.match(html, /\$21\.18\/month/);
  assert.match(html, /\$42\.53\/month/);
  assert.match(html, /\$21\.67\/month/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-doing-the-math-yourself\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-doing-the-math-yourself\.html/);
});

test('the comparison page links back to the tool and to the overhead guide', () => {
  assert.match(html, /href="\.\/">/);
  assert.match(html, /href="what-is-vector-index-overhead\.html"/);
});
