// Structural tests for the incoming Best Offer vs waiting page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column, forgets to render an advertised figure, or formats null
// with .toFixed. Kept dependency-free so CI stays `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareBestOffer } from './calc.mjs';

const html = readFileSync(new URL('./should-i-accept-this-ebay-offer.html', import.meta.url), 'utf8');
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
  assert.match(scriptSource, /compareBestOffer/);
  assert.match(scriptSource, /best_offer_compared/);
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
    ['this offer vs waiting for list', /result\.offer\.profit|result\.expectedWaitProfit/],
    ['midpoint counter', /result\.midpoint\.price/],
    ['target-margin price', /result\.listing\.targetMarginPrice/],
    ['chance of list that still ties waiting', /result\.waitChanceCeiling/],
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
  const comparison = compareBestOffer({
    price: 40,
    shippingCharged: 6,
    finalValueRate: 13.25,
    fixedFee: 0.3,
    costOfGoods: 12,
    shippingCost: 5,
    packagingCost: 1,
    targetMargin: 20,
  });
  assert.equal(comparison.winner, 'offer');
  assert.ok(Math.abs(comparison.listing.profit - 21.605) < 1e-6);
  assert.ok(Math.abs(comparison.offer.profit - 16.4) < 1e-6);
  assert.ok(Math.abs(comparison.expectedWaitProfit - 10.8025) < 1e-6);
  assert.ok(Math.abs(comparison.extraKeptOnAccept - 5.5975) < 1e-6);
  assert.match(html, /id="incomingBestOffer"[^>]*value="34"/);
  assert.match(html, /id="incomingWaitChancePct"[^>]*value="50"/);
  assert.match(html, /\$21\.61/);
  assert.match(html, /\$16\.40/);
  assert.match(html, /\$10\.80/);
  assert.match(html, /\$5\.60/);
  assert.match(html, /\$5\.21/);
  assert.match(html, /75\.9%/);
  assert.match(html, /\$21\.42/);
  assert.match(html, /\$0\.08/);
});

test('disclaimers, privacy, sponsors, and cross-links are on the page', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /Do Not Track|Global Privacy Control/);
  assert.match(markup, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(markup, /should-i-send-an-ebay-offer-to-watchers\.html/);
  assert.match(markup, /should-i-list-ebay-auction-or-buy-it-now\.html/);
  assert.match(markup, /href="\.\/"/);
  assert.doesNotMatch(markup, /you should accept|must take this|decline this offer/i);
});

test('the sitemap and index point at the new page', () => {
  assert.match(sitemap, /should-i-accept-this-ebay-offer\.html/);
  assert.match(index, /should-i-accept-this-ebay-offer\.html/);
  assert.match(index, /id="bestOffer"/);
});
