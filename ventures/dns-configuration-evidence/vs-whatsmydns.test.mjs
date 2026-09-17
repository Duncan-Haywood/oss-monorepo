import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-whatsmydns.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal or professional advice/i);
});

test('states it is not affiliated with whatsmydns.net', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by whatsmydns\.net/);
});

test('no unverifiable numeric claim is made about whatsmydns.net', () => {
  // whatsmydns.net is not reachable from the sandboxed worker that runs this
  // repo's routine sessions (network egress there is proxied and does not
  // permit fetching arbitrary vendor sites), so no location count, uptime
  // figure, or dollar amount for it could be confirmed against a primary
  // source from that environment. Only its well-documented, non-numeric
  // category — a free, no-account, global DNS propagation checker — is
  // stated. No dollar figure appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-whatsmydns\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
    assert.ok(html.includes(question.acceptedAnswer.text), `FAQ schema answer for "${question.name}" is not visible verbatim on the page`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-whatsmydns\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-whatsmydns\.html/);
});

test('the comparison page links back to the tool and to the propagation walkthrough', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-long-does-dns-propagation-take\.html"/);
});

test('describes the actual browser resolvers rather than inventing whatsmydns.net-scale coverage', () => {
  assert.match(html, /Cloudflare, Google, and Quad9/);
});
