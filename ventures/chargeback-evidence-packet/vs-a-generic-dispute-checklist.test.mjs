import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { DISPUTE_REASONS } from './packet.mjs';

const html = fs.readFileSync(new URL('./vs-a-generic-dispute-checklist.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or payment advice/i);
});

test('carries the best-effort hosting and support paragraphs', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no specific checklist product or company', () => {
  // Compares against the generic habit of reusing one downloaded chargeback
  // checklist for every dispute, not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Same shape as this venture's own vs-chargeflow.html,
  // which does name Chargeflow and does carry that clause.
  const h1 = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/i)[0];
  assert.doesNotMatch(h1, /Chargeflow/i);
  assert.doesNotMatch(html, /<title>[^<]*Chargeflow/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-generic-dispute-checklist\.html">/);
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

test('the required-evidence table matches packet.mjs for every modeled reason', () => {
  // The table's claim is that the seven reasons genuinely need different
  // records -- pin it against the same module the tool itself reads from,
  // so a future change to a reason's required set cannot silently make the
  // comparison page's table wrong.
  assert.equal(Object.keys(DISPUTE_REASONS).length, 7);
  assert.deepEqual(DISPUTE_REASONS['Merchandise not received'].required, ['order', 'payment', 'fulfillment', 'tracking']);
  assert.deepEqual(DISPUTE_REASONS['Fraudulent transaction'].required, ['payment', 'avs', 'address', 'tracking']);
  assert.deepEqual(DISPUTE_REASONS['Merchandise not as described'].required, ['order', 'listing', 'contact', 'terms']);
  assert.deepEqual(DISPUTE_REASONS['Subscription canceled'].required, ['terms', 'contact', 'payment']);
  assert.match(html, /AVS\/CVV verification result/);
  assert.match(html, /signup terms and the cancellation record/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-generic-dispute-checklist\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-generic-dispute-checklist\.html/);
});

test('the comparison page links back to the tool', () => {
  assert.match(html, /href="\.\/">/);
});
