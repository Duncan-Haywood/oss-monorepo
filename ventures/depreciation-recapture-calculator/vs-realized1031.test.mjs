import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-realized1031.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, legal, or financial advice/i);
});

test('states it is not affiliated with Realized', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Realized/);
});

test('no unverifiable price is claimed for Realized', () => {
  // realized1031.com is not reachable from this session (network egress in
  // this environment is proxied and does not permit fetching arbitrary
  // vendor sites), so no current fee or pricing figure could be confirmed
  // against a primary source -- same discipline the basement venture's
  // vs-buildxact.html uses for its own named-product page. Only
  // well-documented, non-numeric identity facts (business model, category)
  // are stated; no dollar figure for Realized appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file, relative to the venture root', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-realized1031\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings and answers verbatim', () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD');
  assert.ok(faq.mainEntity.length >= 3);
  for (const { name, acceptedAnswer } of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${name}</h3>`), `FAQ schema question "${name}" has no matching <h3> on the page`);
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim for: ${name}`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-realized1031\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-realized1031\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});
