import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('listing renewal page exposes the allocation inputs and disclaimer', async () => {
  const page = await readFile(new URL('./listing-renewal.html', import.meta.url), 'utf8');
  assert.match(page, /id="expectedSales"/);
  assert.match(page, /id="renewalMonths"/);
  assert.match(page, /id="listingFee"/);
  assert.match(page, /calculateListingRenewal/);
  assert.match(page, /listing_renewal_compared/);
  assert.match(page, /not tax, financial, or business advice/);
  assert.match(page, /etsy-listing-renewal-inputs/);
  assert.match(page, /no sales to allocate/);
});

test('order calculator points at the listing renewal page', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /listing-renewal\.html/);
});

test('sitemap lists the listing renewal page', async () => {
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /listing-renewal\.html/);
});
