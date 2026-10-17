import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-comparing-manifests-by-eye.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, financial, security, or compliance advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('names no vendor or competing platform in its own title or comparison', () => {
  // This page compares against a generic manual habit (reading two JSON
  // manifest exports side by side, or diffing them with a text tool), not a
  // named product, so it is listed in platform/pages/clauses.mjs's
  // COMPARISON_DISCLAIMER_EXEMPT rather than carrying a "not affiliated"
  // clause -- there is no company to disclaim a relationship with. Same
  // shape as flaky-test-finder's vs-eyeballing-two-ci-logs-by-hand.html. The
  // "Open MCP Supply-Chain Watch..." footnote legitimately cross-links to
  // this venture's own vs-snyk.html sibling, which does name Snyk, so this
  // check is scoped to the title and the h1/comparison body rather than the
  // whole document.
  assert.doesNotMatch(html, /<title>[^<]*Snyk/i);
  const h1 = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/i)[0];
  assert.doesNotMatch(h1, /Snyk/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-comparing-manifests-by-eye\.html">/);
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

test('the worked example matches compare() on the tool\'s own shipped fixture', async () => {
  const { EXAMPLE_BEFORE, EXAMPLE_AFTER, compare, parseManifest, formatChange } = await import('./compare.mjs');

  const report = compare(parseManifest(JSON.stringify(EXAMPLE_BEFORE)), parseManifest(JSON.stringify(EXAMPLE_AFTER)));

  const searchChange = report.changes.find((c) => c.tool === 'search_inventory');
  const deleteChange = report.changes.find((c) => c.tool === 'delete_inventory');

  assert.equal(searchChange.severity, 'alert');
  assert.equal(searchChange.bucket, 'instruction-bearing');
  assert.equal(deleteChange.kind, 'tool_added');
  assert.equal(deleteChange.severity, 'review');

  // The page's copy states these two verdicts as prose; pin the exact
  // classification words so a future compare.mjs change that silently
  // reclassifies either case fails this test rather than only going stale
  // in the page's copy.
  assert.match(formatChange(searchChange), /ALERT description_changed: search_inventory \(instruction-bearing\)/);
  assert.match(formatChange(deleteChange), /REVIEW tool_added: delete_inventory/);

  assert.match(html, /search_inventory/);
  assert.match(html, /delete_inventory/);
  assert.match(html, /ALERT.*instruction-bearing/s);
  assert.match(html, /REVIEW.*tool added/is);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-comparing-manifests-by-eye\.html"|href="vs-comparing-manifests-by-eye\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-comparing-manifests-by-eye\.html/);
});

test('the comparison page links back to the tool and to the tool-poisoning explainer', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/what-is-mcp-tool-poisoning\.html"/);
});
