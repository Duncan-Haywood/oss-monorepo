import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-checking-each-marketplace-separately.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, tax, financial,\s+or business advice/i);
});

test('carries the best-effort hosting disclaimer', () => {
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/i);
});

test('carries the support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('disclaims affiliation with every marketplace it names', () => {
  // This page is exempt from the `vs-<competitor>` trademark clause in
  // clauses.mjs, because the thing it compares against is a *method* -- open
  // each channel's own calculator and reconcile the answers by hand --
  // rather than one company's product. It still names real marketplaces to
  // say which channels the ranking covers, so it carries the disclaimer
  // anyway rather than relying on the exemption to excuse its absence. Same
  // reasoning as where-to-sell-calculator/vs-each-marketplaces-own-calculator.
  assert.match(html, /not affiliated with, endorsed by, or sponsored by any marketplace/);
});

test('no figure is attributed to any marketplace', () => {
  // The fee *shapes* this page describes are durable and safe (category-driven
  // vs. flat rates, a subscription amortized over volume, the percentage
  // applying to the whole order). The *rates* are not: they change, and a
  // stale number here would be a false claim about a named company rather
  // than a stale default in a calculator the reader can edit. So the page
  // states no rate and no currency amount at all, which makes "nothing here
  // goes stale into a falsehood" checkable rather than a promise. Same
  // reasoning as the sibling page's identical test.
  const prose = html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<link rel="icon"[^>]*>/g, '');
  assert.doesNotMatch(prose, /\$\s?\d/);
  assert.doesNotMatch(prose, /\d\s?%/);
});

test('concedes that each marketplace calculator is the authority on its own fees', () => {
  assert.match(html, /<h3>Is this page more accurate than a marketplace's own calculator\?<\/h3>/);
  assert.match(html, /should be treated as the authority/);
  assert.match(html, /What each marketplace's own calculator does better/);
});

test('names the three cross-channel differences it exists to catch', () => {
  for (const heading of [
    'Category changes the rate on some channels and not others',
    'A monthly plan is not a per-order fee',
    'The percentage is charged on the whole order, not just the item price',
  ]) {
    assert.ok(html.includes(heading), `missing section: ${heading}`);
  }
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-checking-each-marketplace-separately\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(
      html.includes(`<h3>${question.name}</h3>`),
      `FAQ schema question has no matching visible <h3>: ${question.name}`,
    );
  }
});

test('the FAQ JSON-LD answer text is also visible on the page', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  const prose = html.replace(/\s+/g, ' ');
  for (const question of schema.mainEntity) {
    const answer = question.acceptedAnswer.text.replace(/\s+/g, ' ');
    assert.ok(
      prose.includes(answer),
      `JSON-LD answer for "${question.name}" is not visible verbatim on the page`,
    );
  }
});

test('links back to the calculator and to a sibling covering another angle', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/which-marketplace-has-the-lowest-fees\.html"/);
  assert.match(html, /href="\.\/vs-sellerboard\.html"/);
});

test('the calculator links out to this page, so it is reachable without the sitemap', () => {
  // A page only the sitemap knows about is a page no visitor walks to, and
  // this catalogue's sitemap is not auto-discovered from its Pages subpath
  // (platform/ci/pages_state.py, `indexing` row). The inbound link is the
  // route that does not depend on that being fixed.
  assert.match(indexHtml, /href="\.\/vs-checking-each-marketplace-separately\.html"/);
});

test('the sitemap lists this page', () => {
  assert.match(sitemap, /marketplace-fee-compare\/vs-checking-each-marketplace-separately\.html/);
});
