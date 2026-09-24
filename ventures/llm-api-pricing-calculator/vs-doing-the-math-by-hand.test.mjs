import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-doing-the-math-by-hand.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer with the pricing-advice wording', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial, procurement, or vendor-pricing advice/i);
});

test('carries the best-effort hosting and support paragraphs', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no vendor or competing product in its own title or lede', () => {
  // This page compares against the generic manual method of reading pricing
  // pages and doing the arithmetic by hand, not a named product, so it is
  // listed in platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT
  // rather than carrying a "not affiliated" clause -- there is no company to
  // disclaim a relationship with. Same shape as
  // vector-db-cost-calculator/vs-doing-the-math-yourself.html. The index
  // page legitimately names Anthropic/OpenAI/Google as illustrative provider
  // labels, so the check is scoped to this page's own title and lede.
  const h1 = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/i)[0];
  assert.doesNotMatch(h1, /Anthropic|Claude|OpenAI|GPT|Google|Gemini/i);
  const lede = html.match(/<p class="lede">[\s\S]*?<\/p>/i)[0];
  assert.doesNotMatch(lede, /Anthropic|Claude|OpenAI|GPT|Google|Gemini/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-doing-the-math-by-hand\.html">/);
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

test('the worked example matches providerMonthlyCost, compareProviders, and cacheSavings on the numbers described', async () => {
  const { providerMonthlyCost, compareProviders, cachedInputShare, cacheSavings } = await import('./calc.mjs');

  const workload = { freshInputTokens: 2_000_000, cachedInputTokens: 18_000_000, outputTokens: 3_000_000 };
  const share = cachedInputShare(workload);
  assert.equal(share, 0.9);

  const providerA = { name: 'Provider A', ...workload, inputRate: 3.0, cachedInputRate: 0.3, outputRate: 15.0 };
  const providerB = { name: 'Provider B', ...workload, inputRate: 2.0, cachedInputRate: 0.2, outputRate: 10.0 };

  const correct = compareProviders([providerA, providerB]);
  assert.equal(correct.results.find((r) => r.name === 'Provider A').total.toFixed(2), '56.40');
  assert.equal(correct.results.find((r) => r.name === 'Provider B').total.toFixed(2), '37.60');

  // The "blended by hand" mistake: all 20M input tokens priced at the fresh
  // rate, ignoring the cached discount entirely.
  const blended = (rate, outputRate) =>
    providerMonthlyCost({
      name: 'blended',
      freshInputTokens: workload.freshInputTokens + workload.cachedInputTokens,
      cachedInputTokens: 0,
      outputTokens: workload.outputTokens,
      inputRate: rate,
      cachedInputRate: 0,
      outputRate,
    }).total;

  const blendedA = blended(3.0, 15.0);
  const blendedB = blended(2.0, 10.0);
  assert.equal(blendedA.toFixed(2), '105.00');
  assert.equal(blendedB.toFixed(2), '70.00');

  const savingsA = cacheSavings({ cachedInputTokens: workload.cachedInputTokens, inputRate: 3.0, cachedInputRate: 0.3 });
  const savingsB = cacheSavings({ cachedInputTokens: workload.cachedInputTokens, inputRate: 2.0, cachedInputRate: 0.2 });
  assert.equal(savingsA.toFixed(2), '48.60');
  assert.equal(savingsB.toFixed(2), '32.40');
  assert.equal((blendedA - correct.results.find((r) => r.name === 'Provider A').total).toFixed(2), savingsA.toFixed(2));
  assert.equal((blendedB - correct.results.find((r) => r.name === 'Provider B').total).toFixed(2), savingsB.toFixed(2));

  assert.match(html, /\$105\.00/);
  assert.match(html, /\$70\.00/);
  assert.match(html, /\$56\.40/);
  assert.match(html, /\$37\.60/);
  assert.match(html, /\$48\.60/);
  assert.match(html, /\$32\.40/);
  assert.match(html, /86%/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-doing-the-math-by-hand\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-doing-the-math-by-hand\.html/);
});

test('the comparison page links back to the tool and to the caching guide', () => {
  assert.match(html, /href="\.\/">/);
  assert.match(html, /href="why-prompt-caching-changes-the-math\.html"/);
});
