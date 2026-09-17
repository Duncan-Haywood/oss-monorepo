import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const docsPage = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = docsPage('vs-shopvox.html');
const index = docsPage('index.html');

test('index links to the ShopVOX comparison page', () => {
  assert.match(index, /vs-shopvox\.html/);
});

test('carries the no-warranty and best-effort hosting disclaimers', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or business advice/i);
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
});

test('states it is not affiliated with ShopVOX', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by ShopVOX/);
});

test('no unverifiable price is claimed for ShopVOX', () => {
  // ShopVOX's pricing page is not reachable from this session (network
  // egress here is proxied and does not permit fetching arbitrary vendor
  // sites), so no current plan name or dollar figure could be confirmed
  // against a primary source -- same discipline the other vs-* pages in
  // this repo use.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file at the real GitHub Pages origin', () => {
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/duncan-haywood\.github\.io\/monorepo-projects\/vehicle-wrap-bid-calculator\/vs-shopvox\.html">/,
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

test('the FAQPage JSON-LD answers are verbatim on the visible page (word for word, not just inside the script tag)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(visible.includes(acceptedAnswer.text), `answer not found verbatim outside the JSON-LD script tag: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the comparison page links back to the calculator and to the guide page', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-for-a-vehicle-wrap\.html"/);
});

test('the page is clear this calculator stops at price, not shop management', () => {
  assert.match(html, /stops at the price, not the job record/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = docsPage('robots.txt');
  const sitemap = docsPage('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /vs-shopvox\.html/);
});
