// Structural tests for the free-shipping vs buyer-pays page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column, forgets to render a advertised figure, or formats null
// with .toFixed. Kept dependency-free so CI stays `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareFreeShipping } from './calc.mjs';

const html = readFileSync(new URL('./should-i-offer-free-shipping-on-ebay.html', import.meta.url), 'utf8');
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
  assert.match(scriptSource, /compareFreeShipping/);
  assert.match(scriptSource, /free_shipping_compared/);
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
    ['free shipping vs buyer-pays after sell-through', /result\.buyerPays|result\.freeShip/],
    ['sell-through that ties buyer-pays', /result\.breakEvenFreeShipSellThroughPct/],
    ['free-ship list that ties buyer-pays leftover', /result\.breakEvenFreeShipPrice/],
    ['bake-in leftover versus under-bake', /result\.bakeInPrice|result\.underBake/],
    ['expected listing profit after returns', /result\.buyerPays\.expectedProfit|result\.freeShip\.expectedProfit/],
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
  const comparison = compareFreeShipping({
    price: 40,
    shippingCharged: 6,
    finalValueRate: 13.6,
    fixedFee: 0.4,
    costOfGoods: 12,
    shippingCost: 5,
    packagingCost: 1,
    returnShippingCost: 5,
    feeRefundOnReturnPercent: 100,
    returnRatePercent: 10,
    freeShipPrice: 46,
    buyerPaysSellThroughPct: 55,
    freeShipSellThroughPct: 70,
    monthlyFreeShipListings: 40,
  });
  assert.ok(Math.abs(comparison.buyerPays.expectedProfit - 9.96028) < 1e-6, 'default buyer-pays');
  assert.ok(Math.abs(comparison.freeShip.expectedProfit - 12.67672) < 1e-6, 'default free-ship');
  assert.match(html, /\$9\.96/);
  assert.match(html, /\$12\.68/);
  assert.match(html, /\$2\.72/);
  assert.match(html, /\$108\.66/);
  assert.match(html, /55\.0%/);
  assert.match(html, /\$41\.01/);
  assert.match(html, /\$18\.11/);
  assert.match(html, /\$9\.41/);
  assert.match(html, /\$0\.55/);
  assert.match(html, /74\.1%/);
  assert.match(html, /\$1\.63/);
  assert.match(html, /\$9\.05/);
  assert.match(html, /\$0\.91/);
});

test('disclaimers, privacy, sponsors, and cross-links are on the page', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /Do Not Track|Global Privacy Control/);
  assert.match(markup, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(markup, /should-i-offer-ebay-local-pickup\.html/);
  assert.match(markup, /should-i-offer-ebay-combined-shipping\.html/);
  assert.match(markup, /should-i-offer-an-ebay-quantity-discount\.html/);
  assert.match(markup, /is-ebay-standard-envelope-worth-it\.html/);
  assert.match(markup, /should-i-offer-an-ebay-coupon\.html/);
  assert.match(markup, /do-ebay-returns-wipe-the-profit\.html/);
  assert.match(markup, /should-i-list-ebay-auction-or-buy-it-now\.html/);
  assert.match(markup, /href="\.\/"/);
});

test('the sitemap and index point at the new page', () => {
  assert.match(sitemap, /should-i-offer-free-shipping-on-ebay\.html/);
  assert.match(index, /should-i-offer-free-shipping-on-ebay\.html/);
  assert.match(index, /id="freeShipping"/);
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
