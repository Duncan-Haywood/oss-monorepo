import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-the-flat-10-percent-rule.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or selling advice/);
});

test('carries the best-effort hosting notice and the licence/sponsors paragraph', () => {
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('carries the Mercari trademark / not-affiliated disclaimer', () => {
  assert.match(html, /not\s+affiliated\s+with/i);
  assert.match(html, /trademark of its owner/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-the-flat-10-percent-rule\.html">/);
});

test('has a meta description', () => {
  const match = html.match(/<meta name="description" content="([^"]+)">/);
  assert.ok(match, 'no meta description found');
  assert.ok(match[1].length > 40);
});

test('is indexable, with exactly one robots directive', () => {
  assert.match(html, /<meta name="robots" content="index, follow">/);
  assert.equal((html.match(/<meta name="robots"/g) || []).length, 1);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(
      html.includes(`<h3>${question.name}</h3>`),
      `FAQ schema question "${question.name}" has no matching <h3> on the page`,
    );
  }
});

test('every FAQ answer in the schema matches the visible answer text', () => {
  const decode = (s) =>
    s
      .replace(/&mdash;/g, '—')
      .replace(/&amp;/g, '&')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const schema = JSON.parse(
    html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s)[1],
  );
  for (const question of schema.mainEntity) {
    const heading = `<h3>${question.name}</h3>`;
    const after = html.slice(html.indexOf(heading) + heading.length);
    const visible = decode(after.slice(0, after.indexOf('</p>')));
    assert.equal(
      visible,
      decode(question.acceptedAnswer.text),
      `FAQ answer for "${question.name}" differs between the schema and the visible copy`,
    );
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-the-flat-10-percent-rule\.html"|href="vs-the-flat-10-percent-rule\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-the-flat-10-percent-rule\.html/);
});

test('the comparison page links back to the calculator and to the guide page', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-does-mercari-take\.html"/);
});

// This page compares against a generic mental-math habit (taking 10% off the
// item price and assuming shipping passes through free), not a named
// competing marketplace or product -- Mercari itself is named throughout
// because it is the platform whose published fee schedule this calculator
// computes, the same as index.html and how-much-does-mercari-take.html. It
// carries its own "not affiliated with Mercari" trademark clause (checked
// above) for that reason, so it does not need an entry in clauses.mjs's
// COMPARISON_DISCLAIMER_EXEMPT.
test('names no competing marketplace or third-party tool', () => {
  const bodyOnly = html.replace(/<a\b[^>]*href="[^"]*"[^>]*>/gi, '');
  assert.doesNotMatch(bodyOnly, /eBay|Etsy|Poshmark|Depop|Whatnot|OfferUp|Facebook Marketplace|Vendoo|List Perfectly/i);
});

// The worked-example figures are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's calculateSale or its rates
// ever change, this page's numbers must be re-derived, not left stale.
test('every worked-example figure matches calc.mjs run on the stated sale', async () => {
  const { calculateSale } = await import('./calc.mjs');
  const money = (n) => `$${n.toFixed(2)}`;

  const sale = { itemPrice: 45, buyerShipping: 15, labelCost: 0, itemCost: 0, otherCost: 0, targetProfit: 0 };

  function naiveGuess({ itemPrice, buyerShipping }) {
    const fee = itemPrice * 0.10;
    const revenue = itemPrice + buyerShipping;
    return { fee, payout: revenue - fee };
  }

  const naive = naiveGuess(sale);
  const current = calculateSale({ ...sale, legacySchedule: false });
  const legacy = calculateSale({ ...sale, legacySchedule: true });

  assert.ok(current.ok);
  assert.ok(legacy.ok);

  // Pin the underlying arithmetic first, so a failure here points at the
  // computation rather than at a copy/paste mismatch in the page text.
  assert.equal(naive.payout.toFixed(2), '55.50');
  assert.equal(current.payout.toFixed(2), '54.00');
  assert.equal(legacy.payout.toFixed(2), '53.26');
  assert.equal((naive.payout - current.payout).toFixed(2), '1.50');
  assert.equal((naive.payout - legacy.payout).toFixed(2), '2.24');
  assert.equal(((naive.payout - current.payout) * 20).toFixed(2), '30.00');
  assert.equal(((naive.payout - legacy.payout) * 20).toFixed(2), '44.80');

  // The one case where the guess is exactly right: current schedule, no
  // buyer-paid shipping -- the same $50 sale how-much-does-mercari-take.html
  // already uses.
  const clean = calculateSale({ itemPrice: 50, buyerShipping: 0, labelCost: 0, itemCost: 0, otherCost: 0, targetProfit: 0, legacySchedule: false });
  assert.ok(clean.ok);
  assert.equal(clean.sellingFee.toFixed(2), '5.00');
  assert.equal(clean.payout.toFixed(2), '45.00');

  // Then assert every one of those figures is the one printed on the page.
  for (const value of [
    money(naive.payout),
    money(current.payout),
    money(legacy.payout),
    money(naive.payout - current.payout),
    money(naive.payout - legacy.payout),
    money((naive.payout - current.payout) * 20),
    money((naive.payout - legacy.payout) * 20),
    money(legacy.processingFee),
    money(clean.sellingFee),
    money(clean.payout),
  ]) {
    assert.ok(html.includes(value), `page never states ${value}, which the calculator actually produces`);
  }
});
