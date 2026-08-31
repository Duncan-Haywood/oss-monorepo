import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateListingRenewal, listingRenewalNote } from './calc.mjs';

const renewalInput = {
  price: 30,
  shippingCharged: 5,
  listingFee: 0.2,
  transactionRate: 6.5,
  paymentRate: 3,
  paymentFixed: 0.25,
  offsiteAdRate: 0,
  shippingCost: 6,
  materialCost: 4,
  otherCost: 1,
  renewalMonths: 4,
};

test('listing renewal page exposes the allocation inputs and disclaimer', async () => {
  const page = await readFile(new URL('./listing-renewal.html', import.meta.url), 'utf8');
  assert.match(page, /id="expectedSales"/);
  assert.match(page, /id="renewalMonths"/);
  assert.match(page, /id="listingFee"/);
  assert.match(page, /calculateListingRenewal/);
  assert.match(page, /listingRenewalNote/);
  assert.match(page, /listing_renewal_compared/);
  assert.match(page, /not tax, financial, or business advice/);
  assert.match(page, /no SLA/);
  assert.match(page, /GitHub Sponsors/);
  assert.match(page, /etsy-listing-renewal-inputs/);
  assert.match(page, /no sales to allocate/);
});

test('order calculator points at the listing renewal page', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /listing-renewal\.html/);
  assert.match(page, /listing auto-renew allocation/);
});

test('sitemap lists the listing renewal page', async () => {
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /listing-renewal\.html/);
});

test('FAQ copy uses the same leftover the calculator defaults produce', async () => {
  const page = await readFile(new URL('./listing-renewal.html', import.meta.url), 'utf8');
  const money = (value) => {
    const rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    const sign = rounded < 0 ? '−' : '';
    return `${sign}$${Math.abs(rounded).toFixed(2)}`;
  };
  const two = calculateListingRenewal({ ...renewalInput, expectedSales: 2 });
  const zero = calculateListingRenewal({ ...renewalInput, expectedSales: 0 });
  const five = calculateListingRenewal({ ...renewalInput, expectedSales: 5 });
  assert.ok(page.includes(money(two.contributionExListing)), `missing contribution ${money(two.contributionExListing)}`);
  assert.ok(page.includes(money(two.periodProfitAfterListing)), `missing two-sale leftover ${money(two.periodProfitAfterListing)}`);
  assert.ok(page.includes(money(two.listingPerSale)), `missing two-sale allocation ${money(two.listingPerSale)}`);
  assert.ok(page.includes(money(zero.periodProfitAfterListing)), `missing unpaid leftover ${money(zero.periodProfitAfterListing)}`);
  assert.ok(page.includes(money(zero.annualListingCost)), `missing annual ${money(zero.annualListingCost)}`);
  assert.ok(page.includes(money(five.listingPerSale)), `missing five-sale allocation ${money(five.listingPerSale)}`);
  assert.ok(page.includes('does not turn auto-renew on or off'));
  assert.equal(listingRenewalNote(two).includes(money(two.periodProfitAfterListing)), true);
});
