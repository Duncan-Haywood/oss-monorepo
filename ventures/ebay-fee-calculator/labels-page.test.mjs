// Structural tests for the eBay label vs Pirate Ship page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column, forgets to render a advertised figure, or formats null
// with .toFixed. Kept dependency-free so CI stays `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareEbayLabels } from './calc.mjs';

const html = readFileSync(new URL('./should-i-buy-ebay-shipping-labels.html', import.meta.url), 'utf8');
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
  assert.match(scriptSource, /compareEbayLabels/);
  assert.match(scriptSource, /ebay_labels_compared/);
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
    ['eBay label vs Pirate Ship after item-not-received claims', /result\.ebay|result\.third/],
    ['third-party claim rate that ties the eBay label', /result\.breakEvenThirdPartyClaimRate/],
    ['third-party quote that ties the eBay label', /result\.breakEvenThirdPartyLabelCost/],
    ['expected leftover after returns and claims', /result\.ebay\.expectedProfit|result\.third\.expectedProfit/],
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
  const comparison = compareEbayLabels({
    price: 40,
    shippingCharged: 6,
    finalValueRate: 13.25,
    fixedFee: 0.3,
    costOfGoods: 12,
    ebayLabelCost: 5,
    thirdPartyLabelCost: 4.25,
    packagingCost: 1,
    returnShippingCost: 5,
    feeRefundOnReturnPercent: 100,
    returnRatePercent: 10,
    ebayLabelClaimRatePercent: 0.8,
    thirdPartyClaimRatePercent: 2.5,
    labelUploadMinutes: 4,
    labelUploadWage: 18,
    monthlyLabelShipments: 40,
  });
  assert.ok(Math.abs(comparison.ebay.expectedProfit - 18.053744) < 1e-5, 'default eBay');
  assert.ok(Math.abs(comparison.third.expectedProfit - 16.9858875) < 1e-5, 'default third-party');
  assert.ok(Math.abs(comparison.postageOnly.expectedProfit - 18.1858875) < 1e-5, 'default postage-only');
  assert.match(html, /\$18\.05/);
  assert.match(html, /\$16\.99/);
  assert.match(html, /\$18\.19/);
  assert.match(html, /\$1\.07/);
  assert.match(html, /\$42\.71/);
  assert.match(html, /\$0\.13/);
  assert.match(html, /\$5\.29/);
  assert.match(html, /\$3\.18/);
  assert.match(html, /0\.4 minutes/);
  assert.match(html, /\$21\.61/);
  assert.match(html, /\$21\.16/);
  assert.match(html, /\$17\.64/);
  assert.match(html, /\$0\.41/);
  assert.match(html, /2\.9%/);
  assert.match(html, /\$56\.68/);
  assert.match(html, /\$55\.31/);
  assert.match(html, /\$1\.37/);
  assert.match(html, /1\.6%/);
});

test('disclaimers, privacy, sponsors, and cross-links are on the page', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /Do Not Track|Global Privacy Control/);
  assert.match(markup, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(markup, /should-i-add-shipping-insurance-on-ebay\.html/);
  assert.match(markup, /is-ebay-standard-envelope-worth-it\.html/);
  assert.match(markup, /href="\.\/"/);
});

test('the sitemap and index point at the new page', () => {
  assert.match(sitemap, /should-i-buy-ebay-shipping-labels\.html/);
  assert.match(index, /should-i-buy-ebay-shipping-labels\.html/);
  assert.match(index, /id="ebayLabels"/);
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
