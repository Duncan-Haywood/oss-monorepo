import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-fence-cloud.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, tax, financial, engineering, or business advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('states it is not affiliated with Fence Cloud', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Fence Cloud/);
});

test('no unverifiable price is claimed for Fence Cloud', () => {
  // fence.cloud is not reachable from this session -- WebFetch to
  // fence.cloud returned EGRESS_BLOCKED, confirmed live. A web search (a
  // separate tool from WebFetch, not blocked) surfaced Fence Cloud's own
  // marketing copy describing its category (cloud-based CRM and estimating
  // platform for fence contractors), feature set (lead/project tracking,
  // material-breakdown estimating across chain link, wood, vinyl,
  // ornamental, and agricultural/split-rail fence, auto-filled contracts,
  // packing lists, labor worksheets, gate cut sheets, work orders, and
  // foreman reports), and subscription-account sales model, corroborated
  // across two independent searches. A single third-party review site
  // (not Fence Cloud's own site) mentioned a monthly price, but that figure
  // could not be verified against Fence Cloud's own current pricing page,
  // so it is not repeated as fact here -- same discipline vs-rfms.html
  // uses for RFMS and vs-marketsharp.html uses for MarketSharp. Only
  // well-documented, non-numeric identity facts are stated; no dollar
  // figure for Fence Cloud appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-fence-cloud\.html">/);
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

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-fence-cloud\.html"|href="vs-fence-cloud\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-fence-cloud\.html/);
});

test('the comparison page links back to the calculator and to the bidding walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-to-bid-a-fence-job\.html"/);
});
