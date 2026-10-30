import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-servicecore.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, engineering, or health-department advice/i);
});

test('states it is not affiliated with ServiceCore', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by ServiceCore/);
});

test('no unverifiable price is claimed for ServiceCore', () => {
  // ServiceCore's own pricing page is not reachable from this session
  // (network egress here is proxied and does not permit fetching arbitrary
  // vendor sites), so no current plan name or dollar figure could be
  // confirmed against a primary source -- same discipline the other vs-*
  // pages in this repo use (see retaining-wall-bid-calculator/vs-aspire.html,
  // pool-route-pricing/vs-skimmer.html). Only well-documented, non-numeric
  // identity facts (founding year, product category, and that it targets
  // portable restroom/septic/dumpster operators specifically) are stated;
  // no dollar figure for ServiceCore appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-servicecore\.html">/);
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

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-servicecore\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-servicecore\.html/);
});

test('the comparison page links back to the calculator and to the fleet-size estimate', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-many\.html"/);
});

test('has no external script or stylesheet resources, and no fetch/network calls', () => {
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"/i);
  // The GitHub Sponsors link and the schema.org JSON-LD context are the only
  // https:// references on the page, and neither is a network call the page
  // itself makes -- one is a human-navigable hyperlink, the other a plain
  // string inside static JSON-LD.
  const externalHrefs = [...html.matchAll(/https?:\/\/[^"'\s)]+/g)].map((m) => m[0]);
  for (const href of externalHrefs) {
    assert.ok(
      href.startsWith('https://schema.org') || href === 'http://www.w3.org/2000/svg' || href.startsWith('https://github.com/sponsors/'),
      `unexpected external reference: ${href}`,
    );
  }
});

test('the outbound GitHub Sponsors link carries rel="nofollow noopener"', () => {
  const match = html.match(/<a[^>]+href="https:\/\/github\.com\/sponsors\/[^"]+"[^>]*>/);
  assert.ok(match, 'no GitHub Sponsors link found');
  assert.match(match[0], /rel="nofollow noopener"/);
});
