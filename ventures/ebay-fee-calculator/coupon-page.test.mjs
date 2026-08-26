// Structural tests for the seller-coupon vs stay-listed vs drop page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column, forgets to render a advertised figure, or formats null
// with .toFixed. Kept dependency-free so CI stays `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareSellerCoupon } from './calc.mjs';

const html = readFileSync(new URL('./should-i-offer-an-ebay-coupon.html', import.meta.url), 'utf8');
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
  assert.match(scriptSource, /compareSellerCoupon/);
  assert.match(scriptSource, /seller_coupon_compared/);
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
    ['seller coupon vs stay listed vs drop the list after sell-through', /result\.listed|result\.coupon|result\.drop/],
    ['coupon sell-through that ties listed', /result\.breakEvenCouponSellThroughPct/],
    ['dropped-list sell-through that ties the coupon', /result\.breakEvenDropSellThroughPct/],
    ['expected listing profit after returns', /result\.listed\.expectedProfit|result\.coupon\.expectedProfit/],
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
  const comparison = compareSellerCoupon({
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
    couponPercent: 15,
    couponRedeemPct: 40,
    listedSellThroughPct: 40,
    couponSellThroughPct: 55,
    dropSellThroughPct: 50,
    monthlyCouponListings: 40,
  });
  assert.ok(Math.abs(comparison.listed.expectedProfit - 7.3378) < 1e-6, 'default listed');
  assert.ok(Math.abs(comparison.coupon.expectedProfit - 9.058885) < 1e-6, 'default coupon');
  assert.ok(Math.abs(comparison.drop.expectedProfit - 6.83) < 1e-6, 'default drop');
  assert.ok(Math.abs(comparison.breakEvenCouponSellThroughPct - 44.5506262636075) < 1e-6, 'default coupon ST floor');
  assert.match(html, /\$7\.34/);
  assert.match(html, /\$9\.06/);
  assert.match(html, /\$1\.72/);
  assert.match(html, /\$68\.84/);
  assert.match(html, /44\.6%/);
  assert.match(html, /66\.3%/);
  assert.match(html, /\$1\.87/);
  assert.match(html, /\$18\.34/);
  assert.match(html, /\$16\.47/);
  assert.match(html, /\$6\.83/);
  assert.match(html, /\$13\.66/);
  assert.match(html, /\$6\.59/);
  assert.match(html, /\$5\.80/);
  assert.match(html, /\$10\.93/);
});

test('disclaimers, privacy, sponsors, and cross-links are on the page', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /Do Not Track|Global Privacy Control/);
  assert.match(markup, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(markup, /should-i-send-an-ebay-offer-to-watchers\.html/);
  assert.match(markup, /should-i-offer-an-ebay-quantity-discount\.html/);
  assert.match(markup, /is-ebay-promoted-offsite-worth-it\.html/);
  assert.match(markup, /href="\.\/"/);
});

test('the sitemap and index point at the new page', () => {
  assert.match(sitemap, /should-i-offer-an-ebay-coupon\.html/);
  assert.match(index, /should-i-offer-an-ebay-coupon\.html/);
  assert.match(index, /id="sellerCoupon"/);
});
