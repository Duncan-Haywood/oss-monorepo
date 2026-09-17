import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-mobiletechrx.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not business, tax, financial, or professional advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('states it is not affiliated with Mobile Tech RX', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Mobile Tech RX/);
});

test('no unverifiable price is claimed for Mobile Tech RX', () => {
  // www.mobiletechrx.com is not reachable from this session (assumed
  // unreachable, same discipline as fence.cloud and www.smartmoving.com in
  // vs-fence-cloud.html and vs-smartmoving.html -- no WebFetch was attempted
  // against the competitor's own domain). A web search (a separate tool from
  // WebFetch) surfaced Mobile Tech RX's own marketing copy describing its
  // category (web-based business management software for the auto
  // reconditioning industry), feature set (text-message marketing, employee
  // scheduling, estimates, invoicing, credit-card payment processing,
  // QuickBooks integration, mobile app), founding story (founded 2014 by a
  // former PDR technician), and subscription-account sales model, corroborated
  // across independent sources: Mobile Tech RX's own site, a BusinessWire
  // press release (Series A funding round led by Silverton Partners), and
  // Repairer Driven News, an independent trade publication (2021 acquisition
  // by AsTech, reporting roughly six thousand users at the time). No dollar
  // figure for Mobile Tech RX -- including the funding round amount -- could
  // be verified against its own current pricing, so none is repeated as fact
  // here. Only well-documented, non-numeric identity facts are stated; no
  // dollar figure appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-mobiletechrx\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-mobiletechrx\.html"|href="vs-mobiletechrx\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-mobiletechrx\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge\.html"/);
});
