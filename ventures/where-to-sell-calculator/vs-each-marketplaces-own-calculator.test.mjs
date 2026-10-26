import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-each-marketplaces-own-calculator.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not tax, financial, or\s+business advice/i);
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
  // each channel's own calculator and reconcile the answers -- rather than one
  // company's product. It still names real marketplaces to say which channels
  // the ranking covers, so it carries the disclaimer anyway rather than
  // relying on the exemption to excuse its absence.
  assert.match(html, /not affiliated with, endorsed by, or sponsored by any marketplace/);
});

test('no figure is attributed to any marketplace', () => {
  // The fee *shapes* are durable and safe to describe ("commission that
  // already includes processing", "a flat monthly plan"). The *rates* are not:
  // they change, this page is maintained separately from every schedule it
  // would be quoting, and a stale number here would be a false claim about a
  // named company rather than a stale default in a calculator the reader can
  // edit. So the page states no rate and no currency amount at all, which
  // makes "nothing here goes stale into a falsehood" checkable rather than a
  // promise. Same reasoning as vs-vendoo.test.mjs's no-invented-pricing test.
  // The stylesheet is excluded rather than the rule relaxed: `width: 100%` is
  // a layout declaration, not a claim about anyone's fees, and letting it
  // weaken the pattern would let a real rate through beside it.
  const prose = html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<link rel="icon"[^>]*>/g, '');
  assert.doesNotMatch(prose, /\$\s?\d/);
  assert.doesNotMatch(prose, /\d\s?%/);
});

test('concedes that each marketplace calculator is the authority on its own fees', () => {
  // The honest half. A reader must not leave thinking this page supersedes
  // the official calculator for the channel they end up picking -- it does
  // not, and saying so is what makes the rest of the comparison credible.
  assert.match(html, /<h3>Is this page more accurate than the marketplace's own calculator\?<\/h3>/);
  assert.match(html, /should be treated as the authority/);
  assert.match(html, /What the marketplaces&rsquo; own calculators do better/);
});

test('names the four cross-channel differences it exists to catch', () => {
  for (const heading of [
    'The headline percentages are not the same kind of number',
    'A monthly plan is not a per-sale fee',
    'Returns are not symmetrical between channels',
    'A listing occupies shelf time, and shelf time is finite',
  ]) {
    assert.ok(html.includes(heading), `missing section: ${heading}`);
  }
});

test('says the shelf-time defaults are illustrative, not measurements', () => {
  // The shelf-time ranking is the page's strongest claim and the one most
  // sensitive to an input the page cannot supply. Overstating it would be the
  // easiest way for this page to mislead a seller.
  assert.match(html, /illustrative\s+defaults, not measurements of how fast any marketplace sells/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-each-marketplaces-own-calculator\.html">/);
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

test('links back to the calculator and to two siblings that cover the other angles', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/does-it-actually-sell-there\.html"/);
  assert.match(html, /href="\.\/returns-change-the-ranking\.html"/);
});

test('the calculator links out to this page, so it is reachable without the sitemap', () => {
  // A page only the sitemap knows about is a page no visitor walks to, and
  // this catalogue's sitemap is not auto-discovered from its Pages subpath
  // (platform/ci/pages_state.py, `indexing` row). The inbound link is the
  // route that does not depend on that being fixed.
  assert.match(indexHtml, /href="vs-each-marketplaces-own-calculator\.html"/);
});

test('the sitemap lists this page', () => {
  assert.match(sitemap, /where-to-sell-calculator\/vs-each-marketplaces-own-calculator\.html/);
});
