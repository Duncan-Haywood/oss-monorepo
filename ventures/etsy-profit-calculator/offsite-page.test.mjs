import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compareOffsiteAdRates, maxAffordableOffsiteRate, offsiteAdsNote } from './calc.mjs';

const tightListing = {
  price: 14,
  shippingCharged: 3,
  listingFee: 0.2,
  transactionRate: 6.5,
  paymentRate: 3,
  paymentFixed: 0.25,
  shippingCost: 5.5,
  materialCost: 7,
};

test('offsite ads page exposes the comparison inputs and disclaimer', async () => {
  const page = await readFile(new URL('./are-etsy-offsite-ads-worth-it.html', import.meta.url), 'utf8');
  assert.match(page, /id="offsiteAdRate"/);
  assert.match(page, /id="price"/);
  assert.match(page, /compareOffsiteAdRates/);
  assert.match(page, /maxAffordableOffsiteRate/);
  assert.match(page, /offsiteAdsNote/);
  assert.match(page, /offsite_ads_compared/);
  assert.match(page, /not tax, financial, or business advice/);
  assert.match(page, /no SLA/);
  assert.match(page, /GitHub Sponsors/);
  assert.match(page, /etsy-offsite-ads-inputs/);
  assert.match(page, /does not opt a shop in or out/);
  assert.doesNotMatch(page, /should opt|must turn off|must opt/i);
});

test('order calculator points at the offsite ads page', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /are-etsy-offsite-ads-worth-it\.html/);
  assert.match(page, /id="offsite-ads"/);
  assert.match(page, /Offsite Ads 12%\/15% comparison/);
});

test('sitemap lists the offsite ads page', async () => {
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /are-etsy-offsite-ads-worth-it\.html/);
});

test('FAQ copy uses the same leftover the calculator defaults produce', async () => {
  const page = await readFile(new URL('./are-etsy-offsite-ads-worth-it.html', import.meta.url), 'utf8');
  const money = (value) => {
    const rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    const sign = rounded < 0 ? '−' : '';
    return `${sign}$${Math.abs(rounded).toFixed(2)}`;
  };
  const rows = compareOffsiteAdRates(tightListing);
  const cap = maxAffordableOffsiteRate(tightListing);
  const organic = rows.find((row) => row.offsiteAdRate === 0);
  const at12 = rows.find((row) => row.offsiteAdRate === 12);
  const at15 = rows.find((row) => row.offsiteAdRate === 15);
  assert.ok(page.includes(money(organic.profit)), `missing organic ${money(organic.profit)}`);
  assert.ok(page.includes(money(at12.profit)), `missing 12% ${money(at12.profit)}`);
  assert.ok(page.includes(money(at15.profit)), `missing 15% ${money(at15.profit)}`);
  assert.ok(page.includes(money(organic.cashInvested)), `missing cash ${money(organic.cashInvested)}`);
  assert.ok(page.includes(`${cap.toFixed(1)}%`), `missing ceiling ${cap.toFixed(1)}%`);
  const defaultOrder = compareOffsiteAdRates({
    price: 30, shippingCharged: 5, listingFee: 0.2, transactionRate: 6.5,
    paymentRate: 3, paymentFixed: 0.25, shippingCost: 6, materialCost: 4,
  });
  const default15 = defaultOrder.find((row) => row.offsiteAdRate === 15);
  assert.ok(page.includes(money(default15.profit)), `missing default 15% ${money(default15.profit)}`);
  assert.equal(offsiteAdsNote(rows, cap).includes(money(at15.profit)), true);
});
