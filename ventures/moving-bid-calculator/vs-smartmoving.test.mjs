import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-smartmoving.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, tax, financial, or business advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('states it is not affiliated with SmartMoving', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by SmartMoving/);
});

test('no unverifiable price is claimed for SmartMoving', () => {
  // www.smartmoving.com is not reachable from this session -- WebFetch to
  // www.smartmoving.com/pricing returned EGRESS_BLOCKED, confirmed live. A
  // web search (a separate tool from WebFetch, not blocked) surfaced
  // SmartMoving's founding year (2018), founder (Tobe Thompson),
  // headquarters (Dallas, Texas), product category (CRM and operations
  // software for moving companies: leads/sales, binding/non-binding/
  // binding-not-to-exceed estimates, dispatch, inventory apps, storage
  // management, QuickBooks integration), and recognition (only moving
  // software on the 2024 Inc. 5000 list) from SmartMoving's own site and
  // independent coverage, but no dollar figure for SmartMoving from its own
  // current pricing page -- it is not publicly listed -- so none is
  // repeated as fact here. A reported funding raise for the company
  // ($41.5 million from Mainsail Partners) is deliberately left off this
  // page too: it is a funding amount, not a price the tool charges a
  // customer, and stating it would still put an invented-looking dollar
  // figure next to SmartMoving's name. Same discipline vs-rfms.html uses
  // for RFMS, vs-paintscout.html uses for PaintScout, and vs-moraware.html
  // uses for Moraware. Only well-documented, non-numeric identity facts are
  // stated; no dollar figure for SmartMoving appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-smartmoving\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-smartmoving\.html"|href="vs-smartmoving\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-smartmoving\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge\.html"/);
});
