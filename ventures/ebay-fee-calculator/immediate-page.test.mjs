// Structural tests for the immediate-payment vs unpaid-checkout page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column, forgets to render a advertised figure, or formats null
// with .toFixed. Kept dependency-free so CI stays `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareImmediatePayment } from './calc.mjs';

const html = readFileSync(new URL('./should-i-require-immediate-payment-on-ebay.html', import.meta.url), 'utf8');
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
  assert.match(scriptSource, /compareImmediatePayment/);
  assert.match(scriptSource, /immediate_payment_compared/);
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
    ['immediate payment vs unpaid checkouts after sell-through', /result\.later|result\.immediate/],
    ['unpaid rate that ties later checkout', /result\.breakEvenUnpaidRate/],
    ['immediate sell-through that ties later checkout', /result\.breakEvenImmediateSellThroughPct/],
    ['expected listing profit after returns', /result\.later\.expectedProfit|result\.immediate\.expectedProfit/],
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
  const comparison = compareImmediatePayment({
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
    unpaidRatePercent: 8,
    laterSellThroughPct: 55,
    immediateSellThroughPct: 45,
    unpaidRelistFee: 0.35,
    unpaidMinutes: 20,
    unpaidHourlyWage: 18,
    monthlyImmediateListings: 40,
  });
  assert.ok(Math.abs(comparison.later.expectedProfit - 9.002917) < 1e-5, 'default later');
  assert.ok(Math.abs(comparison.immediate.expectedProfit - 8.255025) < 1e-5, 'default immediate');
  assert.match(html, /\$9\.00/);
  assert.match(html, /\$8\.26/);
  assert.match(html, /\$0\.75/);
  assert.match(html, /\$29\.92/);
  assert.match(html, /13\.5%/);
  assert.match(html, /49\.1%/);
  assert.match(html, /\$16\.37/);
  assert.match(html, /\$18\.34/);
  assert.match(html, /\$1\.98/);
  assert.match(html, /\$6\.35/);
  assert.match(html, /\$7\.37/);
  assert.match(html, /\$9\.17/);
});

test('disclaimers, privacy, sponsors, and cross-links are on the page', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /Do Not Track|Global Privacy Control/);
  assert.match(markup, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(markup, /should-i-send-an-ebay-offer-to-watchers\.html/);
  assert.match(markup, /should-i-offer-an-ebay-coupon\.html/);
  assert.match(markup, /should-i-offer-ebay-local-pickup\.html/);
  assert.match(markup, /href="\.\/"/);
});

test('the sitemap and index point at the new page', () => {
  assert.match(sitemap, /should-i-require-immediate-payment-on-ebay\.html/);
  assert.match(index, /should-i-require-immediate-payment-on-ebay\.html/);
  assert.match(index, /id="immediatePayment"/);
});
