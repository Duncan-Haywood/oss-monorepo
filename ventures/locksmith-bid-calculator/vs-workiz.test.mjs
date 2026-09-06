import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-workiz.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, licensing, or business advice/i);
});

test('states it is not affiliated with Workiz', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Workiz Inc\./);
});

test('no unverifiable price is claimed for Workiz', () => {
  // workiz.com is not reachable from this session (network egress in this
  // environment is proxied and does not permit fetching arbitrary vendor
  // sites), so no current plan name or dollar figure could be confirmed
  // against a primary source -- same discipline
  // junk-removal-bid-calculator/vs-workiz.html uses for the same reason.
  // Only well-documented, non-numeric identity facts (product category,
  // founding, who it serves) are stated; no dollar figure for Workiz
  // appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/example\.invalid\/locksmith-bid-calculator\/vs-workiz\.html">/,
  );
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings and answer text', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    const h3tag = `<h3>${question.name}</h3>`;
    assert.ok(html.includes(h3tag), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
    const after = html.slice(html.indexOf(h3tag) + h3tag.length);
    const answer = after.slice(after.indexOf('<p>') + 3, after.indexOf('</p>'));
    assert.equal(answer, question.acceptedAnswer.text, `visible answer for "${question.name}" does not match the JSON-LD text`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-workiz\.html"|href="vs-workiz\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-workiz\.html/);
});

test('the comparison page links back to the calculator and to the worked-example guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-should-a-locksmith-charge-for-a-service-call\.html"/);
});
