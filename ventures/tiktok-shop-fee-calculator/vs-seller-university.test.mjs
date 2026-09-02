import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(
  new URL('./vs-tiktok-shops-seller-university.html', import.meta.url),
  'utf8',
);
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('states it is not affiliated with TikTok', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by TikTok/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-tiktok-shops-seller-university\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(
    /<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s,
  );
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  for (const question of schema.mainEntity) {
    assert.ok(
      html.includes(`<h3>${question.name}</h3>`),
      `FAQ schema question "${question.name}" has no matching <h3> on the page`,
    );
  }
});

test('does not claim TikTok has no fee schedule of its own, since it does', () => {
  // TikTok Shop's own Seller University knowledge base does publish a
  // referral-fee schedule and a refund-administration-fee policy. A page
  // that claimed TikTok publishes nothing would be false; the true gap is
  // that TikTok publishes no standalone what-if calculator.
  assert.doesNotMatch(html, /TikTok[^.]*\bno\b[^.]*fee schedule/i);
  assert.doesNotMatch(html, /TikTok[^.]*publishes nothing/i);
});

test('every internal link on the page resolves to a file in this venture', () => {
  const internalHrefs = [...html.matchAll(/href="(\.\/|(?!https?:)[a-z0-9#-]+\.html)([^"]*)"/gi)]
    .map((m) => (m[1] === './' ? './' : m[1] + m[2]))
    .filter((href) => href !== './');
  for (const href of internalHrefs) {
    const target = new URL(href, import.meta.url);
    assert.ok(fs.existsSync(target), `broken internal link: ${href}`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="(\.\/)?vs-tiktok-shops-seller-university\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-tiktok-shops-seller-university\.html/);
});
