import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-honeybook.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('states it is not affiliated with HoneyBook', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by HoneyBook\./);
});

test('no unverifiable price is claimed for HoneyBook', () => {
  // honeybook.com is not reachable from this session's egress proxy to
  // confirm today's specific plan names or dollar pricing, and third-party
  // aggregator write-ups disagree with each other on the exact figures, so no
  // dollar amount for HoneyBook is stated -- same discipline
  // backflow-test-fee-calculator/vs-jobber.html uses for the same reason.
  // Only well-documented, non-numeric identity facts (product category, that
  // it publishes its own bridal hair/makeup templates) are stated.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-honeybook\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ text', () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const parsed = blocks.map((b) => JSON.parse(b));
  const faq = parsed.find((p) => p['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD');
  assert.ok(faq.mainEntity.length >= 2);
  for (const qa of faq.mainEntity) {
    assert.ok(html.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(html.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-honeybook\.html"|href="vs-honeybook\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-honeybook\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('the comparison page carries the privacy line', () => {
  assert.match(html, /Nothing leaves your browser/);
});
