// Structural tests for the lot vs individual listings page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column, forgets to render a advertised figure, or formats null
// with .toFixed. Kept dependency-free so CI stays `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareLotVsSingles } from './calc.mjs';

const html = readFileSync(new URL('./should-i-break-an-ebay-lot-into-individual-listings.html', import.meta.url), 'utf8');
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
  assert.match(scriptSource, /compareLotVsSingles/);
  assert.match(scriptSource, /lot_vs_singles_compared/);
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
    ['lot vs individual listings after sell-through', /result\.lot|result\.singles/],
    ['listing time cost', /result\.singles\.timeCost/],
    ['expected listing profit', /result\.lot\.expectedProfit|result\.singles\.expectedProfit/],
    ['break-even single price', /result\.breakEvenSinglePrice/],
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
  const comparison = compareLotVsSingles({
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
    lotPieceCount: 5,
    singleExpectedPrice: 14,
    lotSellThroughPct: 80,
    singleSellThroughPct: 55,
    singleInsertionFee: 0.35,
    singleShippingCharged: 5,
    singleShippingCost: 4,
    singlePackagingCost: 1,
    lotListingMinutes: 8,
    singleListingMinutes: 8,
    lotListingWage: 18,
    monthlyLotDecisions: 6,
  });
  assert.ok(Math.abs(comparison.lot.expectedProfit - 12.2756) < 1e-6, 'default lot');
  assert.ok(Math.abs(comparison.singles.expectedProfit - 5.2366875) < 1e-6, 'default singles');
  assert.ok(Math.abs(comparison.breakEvenSinglePrice - 17.278391989054818) < 1e-6, 'default single-price ceiling');
  assert.match(html, /\$12\.28/);
  assert.match(html, /\$5\.24/);
  assert.match(html, /\$7\.04/);
  assert.match(html, /−\$7\.04|-\$7\.04/);
  assert.match(html, /−\$42\.23|-\$42\.23/);
  assert.match(html, /\$17\.28/);
  assert.match(html, /75\.4%/);
  assert.match(html, /\$42\.37/);
  assert.match(html, /\$30\.09/);
});

test('disclaimers, privacy, sponsors, and cross-links are on the page', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /Do Not Track|Global Privacy Control/);
  assert.match(markup, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(markup, /do-ebay-returns-wipe-the-profit\.html/);
  assert.match(markup, /should-i-offer-a-partial-refund-on-ebay\.html/);
  assert.match(markup, /is-ebay-authenticity-guarantee-worth-it\.html/);
  assert.match(markup, /should-i-offer-ebay-local-pickup\.html/);
  assert.match(markup, /should-i-list-ebay-auction-or-buy-it-now\.html/);
  assert.match(markup, /href="\.\/"/);
});

test('the sitemap and index point at the new page', () => {
  assert.match(sitemap, /should-i-break-an-ebay-lot-into-individual-listings\.html/);
  assert.match(index, /should-i-break-an-ebay-lot-into-individual-listings\.html/);
  assert.match(index, /id="lotVsSingles"/);
});
