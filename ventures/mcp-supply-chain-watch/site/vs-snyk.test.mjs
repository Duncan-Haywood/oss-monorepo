import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-snyk.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, financial, security, or compliance advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('states it is not affiliated with Snyk', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Snyk/);
});

test('no unverifiable price is claimed for Snyk', () => {
  // Snyk's own pricing pages are not reachable from this session -- WebSearch
  // surfaced only agent-scan's public product-category description (an
  // open-source static security scanner for AI agents, MCP servers, and
  // agent skills, covering prompt injection / tool poisoning / toxic flows),
  // never a dollar figure. Only well-documented, non-numeric identity facts
  // are stated here -- same discipline vs-fence-cloud.html and
  // vs-miniorange.html use for their own competitors.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-snyk\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-snyk\.html"|href="vs-snyk\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-snyk\.html/);
});

test('the comparison page links back to the calculator and to the tool-poisoning explainer', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/what-is-mcp-tool-poisoning\.html"/);
});
