// Structural tests for the store-subscription vs no-store page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column, forgets to render an advertised figure, or formats null
// with .toFixed. Kept dependency-free so CI stays `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareStoreTiers } from './calc.mjs';

const html = readFileSync(new URL('./is-an-ebay-store-worth-it.html', import.meta.url), 'utf8');
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
const rowTemplate = scriptSource.match(/<tr class="\$\{row\.monthlyProfit === best[\s\S]*?<\/tr>/);

test('every raw-text element is closed', () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test('the page imports the comparison it claims to run', () => {
  assert.match(scriptSource, /compareStoreTiers/);
  assert.match(scriptSource, /store_compared/);
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
    ['no-store vs Starter vs Basic vs Premium', /result\.current|result\.starter|result\.basic|result\.premium/],
    ['monthly leftover after the subscription', /result\.current\.monthlyProfit|result\.starter\.monthlyProfit/],
    ['break-even order count that ties staying off a store', /result\.starter\.breakEvenOrders/],
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
  const comparison = compareStoreTiers({
    price: 40,
    shippingCharged: 6,
    finalValueRate: 13.25,
    fixedFee: 0.3,
    costOfGoods: 12,
    shippingCost: 5,
    packagingCost: 1,
  });
  assert.equal(comparison.winner, 'current');
  assert.ok(Math.abs(comparison.current.monthlyProfit - 864.2) < 1e-6);
  assert.ok(Math.abs(comparison.starter.monthlyProfit - 861.77) < 1e-6);
  assert.ok(Math.abs(comparison.extraKeptOnStarter + 2.43) < 1e-6);
  assert.match(html, /id="monthlyStoreOrders"[^>]*value="40"/);
  assert.match(html, /id="monthlyStoreFee"[^>]*value="0"/);
  assert.match(html, /\$864\.20/);
  assert.match(html, /\$861\.77/);
  assert.match(html, /\$2\.43/);
  assert.match(html, /\$849\.13/);
  assert.match(html, /\$815\.01/);
  assert.match(html, /58/);
  assert.match(html, /\$3\.09/);
});

test('disclaimers, privacy, sponsors, and cross-links are on the page', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /Do Not Track|Global Privacy Control/);
  assert.match(markup, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(markup, /are-ebay-promoted-listings-worth-it\.html/);
  assert.match(markup, /is-ebay-top-rated-plus-worth-it\.html/);
  assert.match(markup, /href="\.\/"/);
  assert.doesNotMatch(markup, /should subscribe|must enroll|buy a store/i);
});

test('the sitemap and index point at the new page', () => {
  assert.match(sitemap, /is-an-ebay-store-worth-it\.html/);
  assert.match(index, /is-an-ebay-store-worth-it\.html/);
  assert.match(index, /id="storeTiers"/);
});
