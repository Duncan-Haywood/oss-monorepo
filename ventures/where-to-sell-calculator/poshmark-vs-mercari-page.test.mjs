// The worked example on poshmark-vs-mercari-vs-ebay-fees.html must be what the
// calculator actually computes. Same reason as reverb-vs-ebay-page.test.mjs:
// the page is static HTML, so a preset edit would otherwise leave it asserting
// old arithmetic under a headline that says it is the calculator's own.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CHANNEL_PRESETS, compareChannels } from './calc.mjs';

const html = readFileSync(new URL('poshmark-vs-mercari-vs-ebay-fees.html', import.meta.url), 'utf8');

const ITEM = {
  price: 60,
  shippingCharged: 0,
  shippingCost: 7.5,
  itemCost: 12,
  packagingCost: 1,
  otherCost: 0,
  monthlyOrders: 1,
};

const compared = compareChannels(
  CHANNEL_PRESETS
    .filter((preset) => ['poshmark', 'mercari', 'ebay'].includes(preset.id))
    .map((preset) => ({ ...preset, enabled: true })),
  ITEM,
);
const row = (id) => compared.results.find((result) => result.id === id);
const posh = row('poshmark');
const mercari = row('mercari');
const ebay = row('ebay');
const money = (value) => `$${(Math.round(value * 100) / 100).toFixed(2)}`;

test('the page describes the item the test priced', () => {
  assert.match(html, /\$60 jacket with \$0 shipping charged/);
  assert.match(html, /\$12 to source, \$7\.50 to ship, and \$1 to pack/);
});

test('fees, profit, expected profit and velocity figures match the calculator', () => {
  for (const [name, result] of [['Poshmark', posh], ['Mercari', mercari], ['eBay', ebay]]) {
    for (const [what, value] of [
      ['selling fee', result.fees.commission],
      ['total fees', result.feeTotal],
      ['profit', result.profit],
      ['expected profit', result.expectedProfit],
      ['profit per day', result.profitPerDay],
      ['value per 30 days of shelf', result.velocity.valuePer30Days],
    ]) {
      assert.ok(html.includes(money(value)), `${name}: ${what} ${money(value)} is not on the page`);
    }
  }
  assert.ok(html.includes(money(posh.profit - mercari.profit)));
});

test('the page\'s central claim holds: most per sale is last on speed', () => {
  assert.ok(posh.profit > mercari.profit && posh.profit > ebay.profit, 'Poshmark pays most per sale');
  assert.ok(posh.feeTotal > mercari.feeTotal && posh.feeTotal > ebay.feeTotal, 'Poshmark has the biggest fee');
  assert.ok(posh.profitPerDay < mercari.profitPerDay && posh.profitPerDay < ebay.profitPerDay);
  assert.ok(posh.velocity.valuePer30Days < mercari.velocity.valuePer30Days);
  assert.ok(posh.velocity.valuePer30Days < ebay.velocity.valuePer30Days);
  assert.ok(mercari.profitPerDay > ebay.profitPerDay, 'Mercari wins per day');
  assert.ok(ebay.velocity.valuePer30Days > mercari.velocity.valuePer30Days, 'eBay wins per month of shelf');
});

test('the days to sell and sell-through stated in prose are the presets', () => {
  assert.equal(posh.velocity.daysToSell, 60);
  assert.equal(mercari.velocity.daysToSell, 18);
  assert.equal(ebay.velocity.daysToSell, 21);
  assert.equal(posh.velocity.sellThroughPct, 30);
  assert.equal(mercari.velocity.sellThroughPct, 55);
  assert.equal(ebay.velocity.sellThroughPct, 65);
  assert.match(html, /60 on Poshmark, 18 on Mercari and 21 on\s+eBay, with sell-through of 30%, 55% and 65%/);
  assert.equal(posh.percentRate, 20);
  assert.equal(mercari.percentRate, 10);
});

test('the match prices are the ones the calculator solves for', () => {
  assert.ok(html.includes(`about\n    $${Math.round(mercari.priceToMatchBest)}`) || html.includes(`$${Math.round(mercari.priceToMatchBest)}</strong>`));
  assert.ok(html.includes(`$${Math.round(ebay.priceToMatchBest)}</strong>`));
});

test('the FAQ answers quote figures that are also in the tables', () => {
  assert.ok(html.includes('$11.75') && html.includes('$9.35') && html.includes('$3.81'));
  assert.ok(html.includes('$1.86') && html.includes('$1.47') && html.includes('$0.58'));
  assert.ok(html.includes('About $67 on Mercari and $69 on eBay'));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(ld['@type'], 'FAQPage');
  assert.equal(ld.mainEntity.length, 3);
});

test('the page carries the disclaimers and routes to the tools', () => {
  assert.match(html, /No warranty\./);
  assert.match(html, /not tax, financial, or business advice/);
  assert.match(html, /Best-effort hosting, no SLA\./);
  assert.match(html, /sponsors\/Duncan-Haywood/);
  assert.match(html, /not published schedules/);
  assert.match(html, /href="\."/);
  for (const slug of ['poshmark-fee-calculator', 'mercari-fee-calculator', 'ebay-fee-calculator']) {
    assert.match(html, new RegExp(`href="\\.\\./${slug}/"`));
  }
});
