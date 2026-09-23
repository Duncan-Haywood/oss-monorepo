import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-card-fee-guess.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('carries the best-effort hosting notice and the licence/sponsors paragraph', () => {
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-card-fee-guess\.html">/);
});

test('has a meta description', () => {
  const match = html.match(/<meta name="description" content="([^"]+)">/);
  assert.ok(match, 'no meta description found');
  assert.ok(match[1].length > 40);
});

test('is indexable, with exactly one robots directive', () => {
  assert.match(html, /<meta name="robots" content="index, follow">/);
  // Two disagreeing robots directives is the defect injectMirrorTags guards
  // against on the mirrored copy -- see vs-beprofit.test.mjs.
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
  // Same regression vs-beprofit.test.mjs pins: JSON-LD that has drifted from
  // the copy a reader sees is a structured-data mismatch search engines
  // treat as one. Compare on text, after decoding the entities the visible
  // copy uses and the JSON-LD does not.
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
  assert.match(indexHtml, /href="\.\/vs-a-flat-card-fee-guess\.html"|href="vs-a-flat-card-fee-guess\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-card-fee-guess\.html/);
});

test('the comparison page links back to the calculator and to a sibling page', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="why-paypal-costs-more\.html"/);
});

// This page compares against a generic habit (a flat "2.9% + 30 cents"
// card-fee rule of thumb), not a named competitor, so it names no company
// and carries no affiliation disclaimer -- unlike vs-beprofit.html, which
// does both. It is added to clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT for
// exactly this reason, and surface-budget.mjs reads that same set to count
// it as this venture's one generic-method page.
test('names no competitor product or company as the subject of comparison', () => {
  const bodyOnly = html.replace(/<a\b[^>]*href="[^"]*"[^>]*>/gi, '');
  assert.doesNotMatch(bodyOnly, /PayPal|Stripe|Square|BeProfit/i);
});

// The worked-example figures are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's calculateOrder or its rates
// ever change, this page's numbers must be re-derived, not left stale. Both
// example orders use the calculator's own shipped-default processing rates
// (index.html): 2.9% + $0.30 Shopify Payments, 2% Shopify third-party
// transaction fee, 3.49% + $0.49 processor.
test('every worked-example figure matches calc.mjs run against the shipped default rates', async () => {
  const { calculateOrder } = await import('./calc.mjs');
  const money = (n) => `$${n.toFixed(2)}`;

  const rates = {
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    shopifyTxnRate: 2,
    processorRate: 3.49,
    processorFixed: 0.49,
  };

  // Row 1: this calculator's own shipped default order (index.html).
  const orderA = {
    ...rates,
    price: 48,
    shippingCharged: 6,
    costOfGoods: 14,
    shippingCost: 5,
    packagingCost: 1,
    otherCost: 0,
    monthlyPlan: 39,
    monthlyOrders: 100,
  };
  // Row 2: a bigger order, same plan and volume, higher cost of goods,
  // shipping, and packaging -- not a scope picked to prove a point, just a
  // larger version of the same shape.
  const orderB = {
    ...orderA,
    price: 150,
    shippingCharged: 12,
    costOfGoods: 60,
    shippingCost: 9,
    packagingCost: 2,
  };

  function naiveGuess(order) {
    const revenue = order.price + order.shippingCharged;
    const fee = revenue * 0.029 + 0.3;
    return { fee, profit: revenue - fee };
  }

  const naiveA = naiveGuess(orderA);
  const naiveB = naiveGuess(orderB);
  const spA = calculateOrder({ ...orderA, paymentMethod: 'shopify_payments' });
  const tpA = calculateOrder({ ...orderA, paymentMethod: 'third_party' });
  const spB = calculateOrder({ ...orderB, paymentMethod: 'shopify_payments' });
  const tpB = calculateOrder({ ...orderB, paymentMethod: 'third_party' });

  // Pin the underlying arithmetic first, so a failure here points at the
  // computation rather than at a copy/paste mismatch in the page text.
  assert.equal(naiveA.profit.toFixed(2), '52.13');
  assert.equal(spA.selected.profit.toFixed(2), '31.74');
  assert.equal(tpA.selected.profit.toFixed(2), '30.16');
  assert.equal(naiveB.profit.toFixed(2), '157.00');
  assert.equal(spB.selected.profit.toFixed(2), '85.61');
  assert.equal(tpB.selected.profit.toFixed(2), '81.23');
  assert.equal(tpA.extraCostVsShopifyPayments.toFixed(2), '1.59');
  assert.equal(tpB.extraCostVsShopifyPayments.toFixed(2), '4.39');

  // Then assert every one of those figures is the one printed on the page.
  for (const value of [
    money(naiveA.profit),
    money(spA.selected.profit),
    money(tpA.selected.profit),
    money(naiveB.profit),
    money(spB.selected.profit),
    money(tpB.selected.profit),
    money(naiveA.profit - spA.selected.profit),
    money(naiveA.profit - tpA.selected.profit),
    money(naiveB.profit - spB.selected.profit),
    money(naiveB.profit - tpB.selected.profit),
    money(tpA.extraCostVsShopifyPayments),
    money(tpB.extraCostVsShopifyPayments),
    money(tpB.extraCostVsShopifyPayments * 100),
    money(spA.selected.feeTotal),
    money(tpA.selected.feeTotal),
    money(naiveB.fee),
  ]) {
    assert.ok(html.includes(value), `page never states ${value}, which the calculator actually produces`);
  }
});
