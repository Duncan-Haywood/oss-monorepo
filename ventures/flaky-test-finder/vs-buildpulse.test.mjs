import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-buildpulse.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not a substitute for investigating why a test is flaky/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('states it is not affiliated with BuildPulse', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by BuildPulse/);
});

test('no dollar figure is claimed for BuildPulse', () => {
  // buildpulse.io is not reachable from this session with WebFetch (the
  // egress proxy blocks it), but a web search (a separate tool, not
  // blocked) surfaced BuildPulse's own pricing and documentation pages,
  // which agree that: it is a paid subscription, tiered by daily test-result
  // volume, with a free tier that connects a repository via a GitHub Action
  // uploading results to BuildPulse's servers, and a dashboard that can
  // auto-quarantine flaky tests. No specific dollar figure from those pages
  // is stable enough to restate here without risking staleness, so none is
  // claimed -- the same discipline this repo's other vs-*.html pages use
  // for a competitor's pricing (e.g. vs-jobnimbus.html, vs-dat-rateview.html).
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-buildpulse\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-buildpulse\.html"|href="vs-buildpulse\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-buildpulse\.html/);
});

test('the comparison page links back to the tool and to the flaky-CI guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="why-are-my-tests-flaky-in-ci\.html"/);
});

test('never sends the pasted XML anywhere, and says so', () => {
  assert.match(html, /never sends it anywhere/);
  assert.match(html, /no network call at all/);
});
