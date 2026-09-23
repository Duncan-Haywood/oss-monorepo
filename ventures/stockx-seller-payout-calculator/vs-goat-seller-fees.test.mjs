// The StockX side of the worked example on vs-goat-seller-fees.html must be
// what calc.mjs actually computes, for the same reason
// reverb-vs-ebay-page.test.mjs in where-to-sell-calculator pins its own
// worked example: a static page's numbers do not recompute themselves, and a
// change to calc.mjs (a new fee, a changed default) would otherwise leave
// this page asserting arithmetic the calculator no longer agrees with.
//
// GOAT has no calculator in this portfolio and no shared calc.mjs to import,
// so its side is not "real" the way the StockX side is — it is an
// illustrative worked example the page itself says is not a published fee
// schedule. That number is still pinned here, against the same formula the
// page's own prose describes (a tiered commission plus a percentage-plus-flat
// cash-out fee), so an edit to one cannot silently drift from the other.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { calculate } from './calc.mjs';

const html = readFileSync(new URL('./vs-goat-seller-fees.html', import.meta.url), 'utf8');

const money = (value) => `$${(Math.round(value * 100) / 100).toFixed(2)}`;

// The exact StockX-side inputs the page's "The item" section describes.
const stockx = calculate({
  salePrice: 200,
  itemCostBasis: 120,
  sellerFeePct: 9,
  fastShippingDiscountPct: 0,
  paymentProcessingFeePct: 3,
  shippingCost: 6,
  otherCost: 2,
});

/** The illustrative GOAT-side formula the page's own prose describes. */
function goat({ salePrice, itemCostBasis, commissionPct, cashOutFeePct, cashOutFeeFlat, shippingCost, otherCost }) {
  const commissionAmount = salePrice * (commissionPct / 100);
  const cashOutFeeAmount = salePrice * (cashOutFeePct / 100) + cashOutFeeFlat;
  const totalFees = commissionAmount + cashOutFeeAmount + shippingCost + otherCost;
  const netPayout = salePrice - totalFees;
  const netProfit = netPayout - itemCostBasis;
  return { commissionAmount, cashOutFeeAmount, totalFees, netPayout, netProfit };
}

const goatResult = goat({
  salePrice: 200,
  itemCostBasis: 120,
  commissionPct: 20,
  cashOutFeePct: 2.9,
  cashOutFeeFlat: 0.30,
  shippingCost: 5,
  otherCost: 2,
});

test('the page describes the item the test priced', () => {
  assert.match(html, /\$200 pair, sold at a mid seller tier/);
  assert.match(html, /\$120 to acquire,\s+plus \$2 in packaging/);
});

test('the StockX side of the fee table matches what calc.mjs charges', () => {
  assert.ok(html.includes(money(stockx.totalFees)), `StockX total fees ${money(stockx.totalFees)} not on page`);
  assert.ok(html.includes(money(stockx.netPayout)), `StockX net payout ${money(stockx.netPayout)} not on page`);
  assert.ok(html.includes(money(stockx.netProfit)), `StockX net profit ${money(stockx.netProfit)} not on page`);
});

test('the GOAT side of the fee table matches the page\'s own stated formula', () => {
  assert.ok(html.includes(money(goatResult.commissionAmount)), `GOAT commission ${money(goatResult.commissionAmount)} not on page`);
  assert.ok(html.includes(money(goatResult.totalFees)), `GOAT total fees ${money(goatResult.totalFees)} not on page`);
  assert.ok(html.includes(money(goatResult.netPayout)), `GOAT net payout ${money(goatResult.netPayout)} not on page`);
  assert.ok(html.includes(money(goatResult.netProfit)), `GOAT net profit ${money(goatResult.netProfit)} not on page`);
});

test('the headline gap is the gap between the two worked examples', () => {
  const gap = Math.round(stockx.netProfit - goatResult.netProfit);
  assert.ok(html.includes(`about $${gap}`), `the gap "about $${gap}" is not on the page`);
  assert.ok(stockx.netProfit > goatResult.netProfit, 'the page says StockX nets more on this illustrative example');
});

test('the page is honest that both rates are illustrative, not published schedules', () => {
  assert.match(html, /[Ii]llustrative rates, not published schedules/);
  assert.match(html, /current published rates/i);
});

test('the page carries the GOAT trademark affiliation disclaimer', () => {
  assert.match(html, /not affiliated with/i);
  assert.match(html, /GOAT is a trademark of its owner/);
});

test('the page carries the venture\'s standard disclaimers, including the StockX-specific carve-out', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not tax, financial, or business advice/);
  assert.match(html, /not an authentication, inventory, or sourcing tool/);
  assert.match(html, /Best-effort hosting, no SLA\./);
  assert.match(html, /sponsors\/Duncan-Haywood/);
});

test('the page links back to the calculator', () => {
  assert.match(html, /href="\."/);
});

test('index.html links to the new comparison', () => {
  const indexHtml = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(indexHtml, /href="vs-goat-seller-fees\.html"/);
});
