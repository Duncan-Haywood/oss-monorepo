// Structural tests for the combined-shipping vs separate-labels page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column, forgets to render a advertised figure, or formats null
// with .toFixed. Kept dependency-free so CI stays `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareCombinedShipping } from './calc.mjs';

const html = readFileSync(new URL('./should-i-offer-ebay-combined-shipping.html', import.meta.url), 'utf8');
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
  assert.match(scriptSource, /compareCombinedShipping/);
  assert.match(scriptSource, /combined_shipping_compared/);
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
    ['combined shipping vs separate labels after returns', /result\.separate|result\.combined/],
    ['combined charge that ties two labels', /result\.breakEvenCombinedCharged/],
    ['combined postage ceiling', /result\.breakEvenCombinedPostage/],
    ['expected profit after returns', /result\.separate\.expectedProfit|result\.combined\.expectedProfit/],
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
  const comparison = compareCombinedShipping({
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
    combinedItemCount: 2,
    combinedShippingCharged: 8,
    combinedShippingCost: 6.5,
    combinedPackagingCost: 1.25,
    combinedReturnShippingCost: 6.5,
    combinedFixedFee: 0.3,
    combinedReturnRatePercent: 10,
    monthlyCombinedOrders: 12,
  });
  assert.ok(Math.abs(comparison.separate.expectedProfit - 36.689) < 1e-6, 'default separate');
  assert.ok(Math.abs(comparison.combined.expectedProfit - 38.436) < 1e-6, 'default combined');
  assert.ok(Math.abs(comparison.breakEvenCombinedCharged - 5.762407941082289) < 1e-6, 'default charge floor');
  assert.match(html, /\$36\.69/);
  assert.match(html, /\$38\.44/);
  assert.match(html, /\$1\.75/);
  assert.match(html, /\$20\.96/);
  assert.match(html, /\$5\.76/);
  assert.match(html, /\$8\.25/);
  assert.match(html, /\$35\.31/);
  assert.match(html, /\$1\.38/);
});

test('disclaimers, privacy, sponsors, and cross-links are on the page', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /Do Not Track|Global Privacy Control/);
  assert.match(markup, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(markup, /do-ebay-returns-wipe-the-profit\.html/);
  assert.match(markup, /should-i-offer-a-partial-refund-on-ebay\.html/);
  assert.match(markup, /is-ebay-standard-envelope-worth-it\.html/);
  assert.match(markup, /should-i-offer-ebay-local-pickup\.html/);
  assert.match(markup, /should-i-break-an-ebay-lot-into-individual-listings\.html/);
  assert.match(markup, /should-i-list-ebay-auction-or-buy-it-now\.html/);
  assert.match(markup, /href="\.\/"/);
});

test('the sitemap and index point at the new page', () => {
  assert.match(sitemap, /should-i-offer-ebay-combined-shipping\.html/);
  assert.match(index, /should-i-offer-ebay-combined-shipping\.html/);
  assert.match(index, /id="combinedShipping"/);
});
