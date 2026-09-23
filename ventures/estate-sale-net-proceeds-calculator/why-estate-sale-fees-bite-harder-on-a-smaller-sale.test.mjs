import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { calculateSettlement } from './calc.mjs';

const page = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('why-estate-sale-fees-bite-harder-on-a-smaller-sale.html');
const index = page('index.html');
const sitemap = page('sitemap.xml');
const robots = page('robots.txt');

test('index links to the fee-bite guide', () => {
  assert.match(index, /why-estate-sale-fees-bite-harder-on-a-smaller-sale\.html/);
});

test('robots and sitemap let crawlers find the new page', () => {
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /estate-sale-net-proceeds-calculator\/<\/loc>/);
  assert.match(sitemap, /why-estate-sale-fees-bite-harder-on-a-smaller-sale\.html/);
});

test('the guide carries the required disclaimers and links back', () => {
  assert.match(html, /<title>Why Estate Sale Fees Bite Harder on a Smaller Sale/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /GitHub Sponsors/);
});

test('no real estate sale company is named, so no unverifiable pricing is claimed', () => {
  assert.match(html, /not a claim about any real company's pricing/);
});

test('the page never calls a fee stack a bad-faith practice', () => {
  for (const word of ['scam', 'ripoff', 'rip-off', 'predatory', 'a scam', 'rip you off']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(html), `the guide uses "${word}"`);
  }
});

// The three-sale-size table is the page's central claim -- recomputed here
// against the shipped calculator rather than restated, so the page cannot
// drift from what the calculator actually returns.
test('the worked figures match what the shipped calculator computes', () => {
  const quote = (grossSale) => calculateSettlement({
    grossSale,
    tier1Rate: 40, tier1Threshold: 2000,
    tier2Rate: 30, tier2Threshold: 8000,
    tier3Rate: 25,
    setupFee: 400, cardProcessingFee: 250, haulAwayFee: 300,
    minimumGuarantee: '',
  });

  const big = quote(12000);
  const mid = quote(4000);
  const small = quote(2000);
  assert.ok(big.ok && mid.ok && small.ok);

  assert.equal(big.commission.toFixed(2), '3600.00');
  assert.equal(big.fees.toFixed(2), '950.00');
  assert.equal(big.net.toFixed(2), '7450.00');
  assert.equal(big.totalRetained.toFixed(2), '37.92');

  assert.equal(mid.commission.toFixed(2), '1400.00');
  assert.equal(mid.fees.toFixed(2), '950.00');
  assert.equal(mid.net.toFixed(2), '1650.00');
  assert.equal(mid.totalRetained.toFixed(2), '58.75');

  assert.equal(small.commission.toFixed(2), '800.00');
  assert.equal(small.fees.toFixed(2), '950.00');
  assert.equal(small.net.toFixed(2), '250.00');
  assert.equal(small.totalRetained.toFixed(2), '87.50');

  // Both effects move in the same direction as the sale shrinks.
  assert.ok(small.totalRetained > mid.totalRetained);
  assert.ok(mid.totalRetained > big.totalRetained);

  const commissionOnlyPct = (r) => ((r.commission / r.grossSale) * 100).toFixed(2);
  const feesPctOfGross = (r) => ((r.fees / r.grossSale) * 100).toFixed(2);
  assert.equal(commissionOnlyPct(big), '30.00');
  assert.equal(commissionOnlyPct(mid), '35.00');
  assert.equal(commissionOnlyPct(small), '40.00');
  assert.equal(feesPctOfGross(big), '7.92');
  assert.equal(feesPctOfGross(mid), '23.75');
  assert.equal(feesPctOfGross(small), '47.50');

  for (const figure of [
    '30.00%', '35.00%', '40.00%',
    '7.92%', '23.75%', '47.50%',
    '37.92%', '58.75%', '87.50%',
    '$7,450.00', '$1,650.00', '$250.00',
  ]) {
    assert.ok(html.includes(figure), `guide is missing figure ${figure}`);
  }
});

test('FAQPage JSON-LD answers match the visible prose exactly', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?)<\/script>/s)[1]);
  const visible = html.replace(/&mdash;/g, '—').replace(/&rarr;/g, '→');
  for (const qa of ld.mainEntity) {
    assert.ok(visible.includes(qa.name), `visible prose is missing the exact FAQ question "${qa.name}"`);
    assert.ok(visible.includes(qa.acceptedAnswer.text), `visible prose is missing the exact FAQ answer for "${qa.name}"`);
  }
});
