// Structural tests for the Promoted Listings Advanced vs skip page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column, forgets to render a billed figure, or formats null
// with .toFixed. Kept dependency-free so CI stays `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { comparePromotedAdvanced } from './calc.mjs';

const html = readFileSync(new URL('./are-ebay-promoted-listings-advanced-worth-it.html', import.meta.url), 'utf8');
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
  assert.match(scriptSource, /comparePromotedAdvanced/);
  assert.match(scriptSource, /promoted_advanced_compared/);
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
    ['Promoted Listings Advanced vs skip after a click bill charged either way', /result\.skip|result\.advanced/],
    ['extra-sale floor that ties skip', /result\.breakEvenExtraOrders/],
    ['CPC ceiling that ties skip', /result\.breakEvenCpc/],
    ['click ceiling that ties skip', /result\.breakEvenClicks/],
    ['leftover after zero extra sales', /result\.noLiftExpectedProfit/],
    ['expected profit after returns', /result\.skip\.expectedProfit|result\.advanced\.expectedProfit/],
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
  const comparison = comparePromotedAdvanced({
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
    advancedCpc: 0.4,
    advancedClicks: 40,
    advancedExtraOrders: 1,
    monthlyAdvancedCampaigns: 20,
  });
  assert.ok(Math.abs(comparison.skip.expectedProfit - 18.3445) < 1e-6, 'default skip');
  assert.ok(Math.abs(comparison.advanced.expectedProfit - 20.689) < 1e-6, 'default Advanced');
  assert.ok(Math.abs(comparison.breakEvenExtraOrders - 16 / 18.3445) < 1e-6, 'default extra-sale floor');
  assert.match(html, /\$18\.34/);
  assert.match(html, /\$20\.69/);
  assert.match(html, /\$2\.34/);
  assert.match(html, /\$46\.89/);
  assert.match(html, /0\.87/);
  assert.match(html, /\$0\.46/);
  assert.match(html, /45\.86/);
  assert.match(html, /\$16\.00/);
  assert.match(html, /\$2\.34/);
});

test('disclaimers, privacy, sponsors, and cross-links are on the page', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /Do Not Track|Global Privacy Control/);
  assert.match(markup, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(markup, /are-ebay-promoted-listings-worth-it\.html/);
  assert.match(markup, /is-ebay-promoted-offsite-worth-it\.html/);
  assert.match(markup, /do-ebay-returns-wipe-the-profit\.html/);
  assert.match(markup, /should-i-offer-a-partial-refund-on-ebay\.html/);
  assert.match(markup, /is-ebay-standard-envelope-worth-it\.html/);
  assert.match(markup, /should-i-offer-ebay-combined-shipping\.html/);
  assert.match(markup, /should-i-offer-an-ebay-quantity-discount\.html/);
  assert.match(markup, /should-i-offer-ebay-local-pickup\.html/);
  assert.match(markup, /should-i-list-ebay-auction-or-buy-it-now\.html/);
  assert.match(markup, /href="\.\/"/);
});

test('the sitemap and index point at the new page', () => {
  assert.match(sitemap, /are-ebay-promoted-listings-advanced-worth-it\.html/);
  assert.match(index, /are-ebay-promoted-listings-advanced-worth-it\.html/);
  assert.match(index, /id="promotedAdvanced"/);
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
