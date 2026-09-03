// Structural tests for the skip vs insurance vs signature page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column, forgets to render a advertised figure, or formats null
// with .toFixed. Kept dependency-free so CI stays `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { comparePackageProtection } from './calc.mjs';

const html = readFileSync(new URL('./should-i-add-shipping-insurance-on-ebay.html', import.meta.url), 'utf8');
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
  assert.match(scriptSource, /comparePackageProtection/);
  assert.match(scriptSource, /package_protection_compared/);
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
    ['skip vs insurance vs signature after item-not-received claims', /result\.skip|result\.insure|result\.signature/],
    ['skip claim rate that ties insurance', /result\.breakEvenSkipClaimRate/],
    ['insurance premium that ties skip', /result\.breakEvenInsurancePremium/],
    ['expected leftover after returns and claims', /result\.skip\.expectedProfit|result\.insure\.expectedProfit/],
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
  const comparison = comparePackageProtection({
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
    skipClaimRatePercent: 2.5,
    insurancePremium: 1.8,
    insuranceClaimRatePercent: 0.6,
    insurancePayout: 18,
    signatureFee: 3.45,
    signatureClaimRatePercent: 0.4,
    monthlyProtectionShipments: 40,
  });
  assert.ok(Math.abs(comparison.skip.expectedProfit - 17.4358875) < 1e-5, 'default skip');
  assert.ok(Math.abs(comparison.insure.expectedProfit - 16.434433) < 1e-5, 'default insure');
  assert.ok(Math.abs(comparison.signature.expectedProfit - 14.749122) < 1e-5, 'default signature');
  assert.match(html, /\$17\.44/);
  assert.match(html, /\$16\.43/);
  assert.match(html, /\$14\.75/);
  assert.match(html, /\$1\.00/);
  assert.match(html, /\$40\.06/);
  assert.match(html, /\$2\.69/);
  assert.match(html, /\$107\.47/);
  assert.match(html, /5\.3%/);
  assert.match(html, /\$0\.80/);
  assert.match(html, /\$21\.61/);
  assert.match(html, /\$19\.80/);
  assert.match(html, /−\$18\.00|-\$18\.00/);
  assert.match(html, /\$15\.44/);
  assert.match(html, /\$54\.01/);
  assert.match(html, /\$55\.79/);
  assert.match(html, /\$1\.78/);
  assert.match(html, /1\.4%/);
  assert.match(html, /\$53\.86/);
});

test('disclaimers, privacy, sponsors, and cross-links are on the page', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /Do Not Track|Global Privacy Control/);
  assert.match(markup, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(markup, /is-ebay-standard-envelope-worth-it\.html/);
  assert.match(markup, /is-ebay-authenticity-guarantee-worth-it\.html/);
  assert.match(markup, /href="\.\/"/);
});

test('the sitemap and index point at the new page', () => {
  assert.match(sitemap, /should-i-add-shipping-insurance-on-ebay\.html/);
  assert.match(index, /should-i-add-shipping-insurance-on-ebay\.html/);
  assert.match(index, /id="packageProtection"/);
});
