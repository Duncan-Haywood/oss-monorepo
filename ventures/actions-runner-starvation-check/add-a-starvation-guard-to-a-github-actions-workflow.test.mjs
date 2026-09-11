import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./add-a-starvation-guard-to-a-github-actions-workflow.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
});

test('carries the best-effort hosting disclaimer', () => {
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="add-a-starvation-guard-to-a-github-actions-workflow\.html">/);
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
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="(\.\/)?add-a-starvation-guard-to-a-github-actions-workflow\.html"/);
});

test('the page is listed in the sitemap', () => {
  assert.match(sitemap, /add-a-starvation-guard-to-a-github-actions-workflow\.html/);
});

test('the page links back to the checker', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('the workflow example requests actions: read explicitly rather than relying on default token permissions', () => {
  assert.match(html, /permissions:\s*\n\s*actions: read/);
});

test('the workflow example uses workflow_run, not a step inside the guarded job', () => {
  assert.match(html, /workflow_run:/);
});

test('does not tell a reader to fetch check.py from a URL that does not serve it', () => {
  // check.py is a .py file, deliberately excluded from the Pages build
  // (platform/pages/build.mjs NON_WEB_EXTENSIONS), and this repository is
  // private, so neither the Pages origin nor a raw.githubusercontent.com
  // URL actually serves it to an anonymous visitor. The example workflow
  // must not instruct a reader to curl either.
  assert.ok(!/curl[^\n]*check\.py/.test(html), 'must not curl check.py from an unpublished or private-repo URL');
});

test('does not overclaim about the guard job failing CI on its own', () => {
  // The example step as written always exits success (tee does not
  // propagate a non-zero exit from a starved verdict), so the page must not
  // claim the job fails automatically without the optional grep addition.
  assert.match(html, /always exits success/);
});
