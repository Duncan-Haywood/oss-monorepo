// Structural tests for the quantity-discount vs selling-separately page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column, forgets to render a advertised figure, or formats null
// with .toFixed. Kept dependency-free so CI stays `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareQuantityDiscount } from './calc.mjs';

const html = readFileSync(new URL('./should-i-offer-an-ebay-quantity-discount.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

function parse(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = '';
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) return { markup: markup + rest, scripts, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, 'i').exec(rest.slice(contentStart));
    if (!closer) return { markup, scripts, unclosed: tag };
    if (tag === 'script') scripts.push(rest.slice(contentStart, contentStart + closer.index));
    markup += closer[0];
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

const { markup, scripts, unclosed } = parse(html);
const scriptSource = scripts.join('\n');
const rowTemplate = scriptSource.match(/<tr class="\$\{row\.expectedProfit === best[\s\S]*?<\/tr>/);

test('every raw-text element is closed', () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test('the page imports the comparison it claims to run', () => {
  assert.match(scriptSource, /compareQuantityDiscount/);
  assert.match(scriptSource, /quantity_discount_compared/);
});

test('every results column has a cell, and every cell has a column', () => {
  assert.ok(rowTemplate, 'could not find the per-path <tr> template');
  const headers = [...markup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim());
  const cells = (rowTemplate[0].match(/<t[hd][\s>]/g) || []).length;
  assert.equal(
    cells,
    headers.length,
    `table declares ${headers.length} columns (${headers.join(' | ')}) but the row emits ${cells} cells`,
  );
});

test('figures named in schema.org featureList are actually rendered', () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, 'no schema.org featureList found');
  const claims = [
    ['quantity discount vs selling separately after sell-through', /result\.singles|result\.discount/],
    ['take rate that ties singles', /result\.breakEvenTakePct/],
    ['discount-percent ceiling on leftover', /result\.breakEvenDiscountPercent/],
    ['expected listing profit after returns', /result\.singles\.expectedProfit|result\.discount\.expectedProfit/],
  ];
  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"`,
    );
    assert.match(scriptSource, rendered, `featureList advertises "${claim}" but the page never renders it`);
  }
});

test('default inputs on the page match the worked example', () => {
  const comparison = compareQuantityDiscount({
    price: 40,
    shippingCharged: 6,
    finalValueRate: 13.25,
    fixedFee: 0.3,
    costOfGoods: 12,
    shippingCost: 5,
    packagingCost: 1,
    returnShippingCost: 5,
    feeRefundOnReturnPercent: 100,
    returnRatePercent: 10,
    qtyDiscountUnits: 2,
    qtyDiscountPercent: 10,
    qtyShippingCharged: 6,
    qtyShippingCost: 5.5,
    qtyPackagingCost: 1.25,
    qtyReturnShippingCost: 5.5,
    singlesSellThroughPct: 55,
    qtyTakePct: 70,
    monthlyQtyOrders: 20,
  });
  assert.ok(Math.abs(comparison.singles.expectedProfit - 20.17895) < 1e-6, 'default singles');
  assert.ok(Math.abs(comparison.discount.expectedProfit - 22.20995) < 1e-6, 'default discount');
  assert.ok(Math.abs(comparison.breakEvenTakePct - 63.59881494555369) < 1e-6, 'default take floor');
  assert.match(html, /\$20\.18/);
  assert.match(html, /\$22\.21/);
  assert.match(html, /\$2\.03/);
  assert.match(html, /\$40\.62/);
  assert.match(html, /63\.6%/);
  assert.match(html, /2\.1%/);
  assert.match(html, /\$4\.96/);
  assert.match(html, /\$36\.69/);
  assert.match(html, /\$31\.73/);
  assert.match(html, /\$17\.84/);
  assert.match(html, /\$17\.45/);
});

test('disclaimers, privacy, sponsors, and cross-links are on the page', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /Do Not Track|Global Privacy Control/);
  assert.match(markup, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(markup, /should-i-offer-ebay-combined-shipping\.html/);
  assert.match(markup, /should-i-send-an-ebay-offer-to-watchers\.html/);
  assert.match(markup, /is-ebay-promoted-offsite-worth-it\.html/);
  assert.match(markup, /should-i-break-an-ebay-lot-into-individual-listings\.html/);
  assert.match(markup, /href="\.\/"/);
});

test('the sitemap and index point at the new page', () => {
  assert.match(sitemap, /should-i-offer-an-ebay-quantity-discount\.html/);
  assert.match(index, /should-i-offer-an-ebay-quantity-discount\.html/);
  assert.match(index, /id="quantityDiscount"/);
});

test('the result panel is announced to screen readers when it updates', () => {
  // The result section re-renders its hero figure and breakdown in place
  // on every keystroke, with no page reload, but had no aria-live -- so a
  // screen-reader user changing an input got no announcement that the
  // result had changed. Same gap already fixed fleet-wide (see #3125-#3127
  // and prior sessions' aria-live commits).
  assert.match(
    html,
    /<section class="result" aria-live="polite">/,
    'the result section is not a live region, so updates are never announced',
  );
});
