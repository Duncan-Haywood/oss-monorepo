import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-servemanager.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal or business advice/i);
});

test('states it is not affiliated with ServeManager', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by ServeManager\./);
});

test('no unverifiable price is claimed for ServeManager', () => {
  // servemanager.com is not reachable from this session (network egress in
  // this environment is proxied and does not permit fetching arbitrary
  // vendor sites), so no current plan name or dollar figure could be
  // confirmed against a primary source -- same discipline
  // locksmith-bid-calculator/vs-jobber.html uses for the same reason. Only
  // well-documented, non-numeric identity facts (product category, what it
  // is used for) are stated; no dollar figure for ServeManager appears
  // anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/example\.invalid\/process-server-fee-calculator\/vs-servemanager\.html">/,
  );
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
  assert.match(indexHtml, /href="\.\/vs-servemanager\.html"|href="vs-servemanager\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-servemanager\.html/);
});

test('the comparison page links back to the calculator and to the worked-example guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="is-this-process-server-fee-schedule-worth-it\.html"/);
});
