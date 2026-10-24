import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-checking-dns-by-hand.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal or professional advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

// This page compares against a generic manual habit (running dig by hand),
// not a named competitor, so it names no company or product and carries no
// affiliation disclaimer -- unlike vs-whatsmydns.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /whatsmydns|Cloudflare Radar|nslookup\.io|dnschecker\.org/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="vs-checking-dns-by-hand\.html">/);
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
  for (const question of schema.mainEntity) {
    const acceptedAnswer = question.acceptedAnswer;
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-checking-dns-by-hand\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-checking-dns-by-hand\.html/);
});

test('the comparison page links back to the tool', () => {
  assert.match(html, /<a href="index\.html">/);
});

// The tool's own status vocabulary (changed/unchanged/inconclusive, and the
// UNCERTAIN status set) is the page's factual claim about how the tool
// behaves -- if dns-evidence.mjs's statuses ever change, this page's claims
// must be re-derived, not left stale.
test("the page's status claims match dns-evidence.mjs's actual vocabulary", async () => {
  const { UNCERTAIN, RESOLVERS } = await import('./dns-evidence.mjs');

  assert.ok(UNCERTAIN.has('timeout'));
  assert.ok(UNCERTAIN.has('refused'));
  assert.ok(UNCERTAIN.has('error'));
  assert.match(html, /<code>timeout<\/code>/);
  assert.match(html, /<code>refused<\/code>/);
  assert.match(html, /<code>error<\/code>/);
  assert.match(html, /<code>inconclusive<\/code>/);
  assert.match(html, /<code>changed<\/code>/);
  assert.match(html, /<code>unchanged<\/code>/);

  const ids = RESOLVERS.map((r) => r.id);
  assert.deepEqual(ids.sort(), ['cloudflare', 'google', 'quad9']);
  assert.match(html, /Cloudflare, Google, and Quad9/);
});

test("the page's claim about observed_at matches the snapshot schema", async () => {
  const { utcNow } = await import('./dns-evidence.mjs');
  assert.equal(typeof utcNow(), 'string');
  assert.match(html, /observed_at/);
});
