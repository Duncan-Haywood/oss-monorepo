import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REVERB_DEFAULTS,
  compareOfferToList,
  compareReverbToEbay,
  calculateEbaySale,
  offerThatMatchesEbayList,
  compareShippingPaths,
  compareBump,
} from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const seo = readFileSync(new URL('./should-i-take-this-reverb-offer.html', import.meta.url), 'utf8');
const shippingSeo = readFileSync(new URL('./should-i-include-shipping-on-reverb.html', import.meta.url), 'utf8');
const bumpSeo = readFileSync(new URL('./should-i-bump-this-reverb-listing.html', import.meta.url), 'utf8');

function money(value) {
  return `$${(Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2)}`;
}
function signed(value) {
  return `${value < 0 ? '−' : '+'}${money(Math.abs(value))}`;
}

test('the calculator page wires the compare the schema.org featureList names', () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, 'no schema.org featureList found');
  assert.match(featureList[1], /offer versus list/i);
  assert.match(featureList[1], /Reverb versus eBay/i);
  assert.match(featureList[1], /shipping included versus buyer-pays/i);
  assert.match(featureList[1], /bump versus take the offer/i);
  assert.match(html, /id="offerPrice"/);
  assert.match(html, /id="compareRows"/);
  assert.match(html, /id="crossoverOffer"/);
  assert.match(html, /id="shippingRows"/);
  assert.match(html, /id="bumpRows"/);
  assert.match(html, /offerThatMatchesEbayList/);
  assert.match(html, /compareShippingPaths/);
  assert.match(html, /compareBump/);
  assert.match(html, /no SLA/i);
  assert.match(html, /GitHub Sponsors/);
  assert.match(html, /should-i-take-this-reverb-offer.html/);
  assert.match(html, /should-i-include-shipping-on-reverb.html/);
  assert.match(html, /should-i-bump-this-reverb-listing.html/);
});

test('the SEO page uses the same worked example the calculator defaults produce', () => {
  const offer = compareOfferToList(REVERB_DEFAULTS);
  const vsEbay = compareReverbToEbay(REVERB_DEFAULTS, 800);
  const ebayOffer = calculateEbaySale(REVERB_DEFAULTS, 720);
  const match = offerThatMatchesEbayList(REVERB_DEFAULTS);
  assert.match(seo, /Should I take this Reverb offer/i);
  assert.match(seo, /href="\.\/#offer-compare"/);
  assert.match(seo, /No warranty/);
  assert.match(seo, /no SLA/i);
  assert.ok(seo.includes(money(offer.list.profit)), `missing list profit ${money(offer.list.profit)}`);
  assert.ok(seo.includes(money(offer.offer.profit)), `missing offer profit ${money(offer.offer.profit)}`);
  assert.ok(seo.includes(money(vsEbay.ebay.profit)), `missing eBay list profit ${money(vsEbay.ebay.profit)}`);
  assert.ok(seo.includes(money(ebayOffer.profit)), `missing eBay offer profit ${money(ebayOffer.profit)}`);
  assert.ok(seo.includes(signed(-offer.leaveOnTable)), `missing leave-on-table ${signed(-offer.leaveOnTable)}`);
  assert.ok(seo.includes(money(match.offerPrice)), `missing crossover ${money(match.offerPrice)}`);
});

test('the shipping SEO page uses the same worked example the calculator defaults produce', () => {
  const shipping = compareShippingPaths(REVERB_DEFAULTS);
  assert.match(shippingSeo, /Should I include shipping on Reverb/i);
  assert.match(shippingSeo, /href="\.\/#shipping-compare"/);
  assert.match(shippingSeo, /No warranty/);
  assert.match(shippingSeo, /no SLA/i);
  assert.ok(shippingSeo.includes(money(shipping.buyerPays.profit)), `missing buyer-pays ${money(shipping.buyerPays.profit)}`);
  assert.ok(shippingSeo.includes(money(shipping.included.profit)), `missing included ${money(shipping.included.profit)}`);
  assert.ok(shippingSeo.includes(money(shipping.pickup.profit)), `missing pickup ${money(shipping.pickup.profit)}`);
  assert.ok(shippingSeo.includes(signed(shipping.rows[1].vsBuyerPays)), `missing included delta ${signed(shipping.rows[1].vsBuyerPays)}`);
  assert.ok(shippingSeo.includes(signed(shipping.rows[2].vsBuyerPays)), `missing pickup delta ${signed(shipping.rows[2].vsBuyerPays)}`);
  assert.ok(shippingSeo.includes(money(shipping.includedListThatMatchesBuyerPays)), `missing match list ${money(shipping.includedListThatMatchesBuyerPays)}`);
  assert.ok(shippingSeo.includes(money(shipping.extraMarketplaceOnIncluded)), `missing extra marketplace ${money(shipping.extraMarketplaceOnIncluded)}`);
});

test('the bump SEO page uses the same worked example the calculator defaults produce', () => {
  const bump = compareBump(REVERB_DEFAULTS);
  assert.match(bumpSeo, /Should I bump this Reverb listing/i);
  assert.match(bumpSeo, /href="\.\/#bump-compare"/);
  assert.match(bumpSeo, /No warranty/);
  assert.match(bumpSeo, /no SLA/i);
  assert.ok(bumpSeo.includes(money(bump.offerNoBump.profit)), `missing offer no-bump ${money(bump.offerNoBump.profit)}`);
  assert.ok(bumpSeo.includes(money(bump.offerWithBump.profit)), `missing offer with bump ${money(bump.offerWithBump.profit)}`);
  assert.ok(bumpSeo.includes(money(bump.listNoBump.profit)), `missing list no-bump ${money(bump.listNoBump.profit)}`);
  assert.ok(bumpSeo.includes(money(bump.listWithBump.profit)), `missing list with bump ${money(bump.listWithBump.profit)}`);
  assert.ok(bumpSeo.includes(signed(bump.rows[1].vsOfferNoBump)), `missing offer-with-bump delta ${signed(bump.rows[1].vsOfferNoBump)}`);
  assert.ok(bumpSeo.includes(signed(bump.rows[3].vsOfferNoBump)), `missing list-with-bump delta ${signed(bump.rows[3].vsOfferNoBump)}`);
  assert.ok(bumpSeo.includes(money(bump.offerThatCoversBump)), `missing cover offer ${money(bump.offerThatCoversBump)}`);
  assert.ok(bumpSeo.includes(money(bump.extraSaleToCoverBump)), `missing extra sale ${money(bump.extraSaleToCoverBump)}`);
  assert.ok(bumpSeo.includes(money(bump.cashBumpSavesVsOfferIfYouReachList)), `missing list save ${money(bump.cashBumpSavesVsOfferIfYouReachList)}`);
});
