import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import {
  REVERB_DEFAULTS,
  compareOfferToList,
  compareReverbToEbay,
  calculateEbaySale,
  offerThatMatchesEbayList,
  compareShippingPaths,
  compareSafeShipping,
  compareConsignment,
  compareBump,
  compareReturnResolution,
} from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const seo = readFileSync(new URL('./should-i-take-this-reverb-offer.html', import.meta.url), 'utf8');
const shippingSeo = readFileSync(new URL('./should-i-include-shipping-on-reverb.html', import.meta.url), 'utf8');
const absorbSeo = readFileSync(new URL('./should-i-eat-the-shipping-on-reverb.html', import.meta.url), 'utf8');
const safeShippingSeo = readFileSync(new URL('./should-i-buy-reverb-safe-shipping.html', import.meta.url), 'utf8');
const consignmentSeo = readFileSync(new URL('./should-i-consign-this-reverb-listing.html', import.meta.url), 'utf8');
const bumpSeo = readFileSync(new URL('./should-i-bump-this-reverb-listing.html', import.meta.url), 'utf8');
const returnSeo = readFileSync(new URL('./should-i-take-the-return-or-refund-on-reverb.html', import.meta.url), 'utf8');
const vsSeo = readFileSync(new URL('./vs-reverbs-selling-fees-page.html', import.meta.url), 'utf8');

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
  assert.match(featureList[1], /absorb the label/i);
  assert.match(html, /id="offerPrice"/);
  assert.match(html, /id="meetupCost"/);
  assert.match(html, /id="compareRows"/);
  assert.match(html, /id="crossoverOffer"/);
  assert.match(html, /id="shippingRows"/);
  assert.match(html, /offerThatMatchesEbayList/);
  assert.match(html, /compareShippingPaths/);
  assert.match(featureList[1], /Safe Shipping versus own label/i);
  assert.match(html, /id="safeShippingCost"/);
  assert.match(html, /id="claimCost"/);
  assert.match(html, /id="unprotectedLossRatePct"/);
  assert.match(html, /id="safeShippingRows"/);
  assert.match(html, /compareSafeShipping/);
  assert.match(html, /no SLA/i);
  assert.match(html, /GitHub Sponsors/);
  assert.match(html, /should-i-take-this-reverb-offer.html/);
  assert.match(html, /should-i-include-shipping-on-reverb.html/);
  assert.match(html, /should-i-eat-the-shipping-on-reverb.html/);
  assert.match(html, /should-i-buy-reverb-safe-shipping.html/);
  assert.match(featureList[1], /shop consignment versus self-list/i);
  assert.match(html, /id="shopSalePrice"/);
  assert.match(html, /id="consignmentRate"/);
  assert.match(html, /id="shopCashOffer"/);
  assert.match(html, /id="consignmentRows"/);
  assert.match(html, /compareConsignment/);
  assert.match(html, /should-i-consign-this-reverb-listing.html/);
  assert.match(featureList[1], /bump versus take the offer/i);
  assert.match(html, /id="bumpRows"/);
  assert.match(html, /compareBump/);
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

test('the absorb-the-label SEO page uses the same fourth path the calculator paints', () => {
  const shipping = compareShippingPaths(REVERB_DEFAULTS);
  assert.match(absorbSeo, /Should I eat the shipping on Reverb/i);
  assert.match(absorbSeo, /href="\.\/#shipping-compare"/);
  assert.match(absorbSeo, /No warranty/);
  assert.match(absorbSeo, /no SLA/i);
  assert.ok(absorbSeo.includes(money(shipping.absorbed.profit)), `missing absorbed ${money(shipping.absorbed.profit)}`);
  assert.ok(absorbSeo.includes(signed(shipping.rows[3].vsBuyerPays)), `missing absorbed delta ${signed(shipping.rows[3].vsBuyerPays)}`);
  assert.ok(absorbSeo.includes(signed(shipping.absorbVsIncluded)), `missing absorb vs included ${signed(shipping.absorbVsIncluded)}`);
  assert.ok(absorbSeo.includes(money(shipping.included.profit)), `missing included ${money(shipping.included.profit)}`);
});

test('the Safe Shipping SEO page uses the same worked example the calculator defaults produce', () => {
  const comparison = compareSafeShipping(REVERB_DEFAULTS);
  assert.match(safeShippingSeo, /Should I buy Reverb Safe Shipping/i);
  assert.match(safeShippingSeo, /href="\.\/#safe-shipping-compare"/);
  assert.match(safeShippingSeo, /No warranty/);
  assert.match(safeShippingSeo, /no SLA/i);
  assert.ok(safeShippingSeo.includes(money(comparison.own.profit)), `missing own-if-nothing ${money(comparison.own.profit)}`);
  assert.ok(safeShippingSeo.includes(money(comparison.ownExpectedProfit)), `missing own expected ${money(comparison.ownExpectedProfit)}`);
  assert.ok(safeShippingSeo.includes(money(comparison.safe.profit)), `missing Safe Shipping ${money(comparison.safe.profit)}`);
  assert.ok(safeShippingSeo.includes(money(comparison.extraLabelCost)), `missing extra label ${money(comparison.extraLabelCost)}`);
  assert.ok(safeShippingSeo.includes(money(comparison.expectedClaim)), `missing expected claim ${money(comparison.expectedClaim)}`);
  assert.ok(safeShippingSeo.includes(comparison.breakEvenLossRatePct.toFixed(2)), `missing break-even ${comparison.breakEvenLossRatePct.toFixed(2)}`);
  assert.ok(safeShippingSeo.includes(signed(comparison.rows[2].vsOwnExpected)), `missing Safe delta ${signed(comparison.rows[2].vsOwnExpected)}`);
});

test('the consignment SEO page uses the same worked example the calculator defaults produce', () => {
  const comparison = compareConsignment(REVERB_DEFAULTS);
  assert.match(consignmentSeo, /Should I consign this Reverb listing/i);
  assert.match(consignmentSeo, /href="\.\/#consignment-compare"/);
  assert.match(consignmentSeo, /No warranty/);
  assert.match(consignmentSeo, /no SLA/i);
  assert.ok(consignmentSeo.includes(money(comparison.selfList.profit)), `missing list profit ${money(comparison.selfList.profit)}`);
  assert.ok(consignmentSeo.includes(money(comparison.consignProfit)), `missing consign profit ${money(comparison.consignProfit)}`);
  assert.ok(consignmentSeo.includes(money(comparison.cashProfit)), `missing cash profit ${money(comparison.cashProfit)}`);
  assert.ok(consignmentSeo.includes(money(comparison.shopPayout)), `missing shop payout ${money(comparison.shopPayout)}`);
  assert.ok(consignmentSeo.includes(signed(comparison.rows[1].vsSelfList)), `missing consign delta ${signed(comparison.rows[1].vsSelfList)}`);
  assert.ok(consignmentSeo.includes(signed(comparison.rows[2].vsSelfList)), `missing cash delta ${signed(comparison.rows[2].vsSelfList)}`);
  assert.ok(consignmentSeo.includes(comparison.breakEvenConsignmentRatePct.toFixed(2)), `missing break-even cut ${comparison.breakEvenConsignmentRatePct.toFixed(2)}`);
  assert.ok(consignmentSeo.includes(money(comparison.breakEvenShopSalePrice)), `missing break-even shop price ${money(comparison.breakEvenShopSalePrice)}`);
  assert.ok(consignmentSeo.includes(money(comparison.breakEvenShopCash)), `missing break-even cash ${money(comparison.breakEvenShopCash)}`);
  assert.match(consignmentSeo, /listing it yourself still leaves/i);
  assert.doesNotMatch(consignmentSeo, /you should consign/i);
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

// This page had no test at all until now: five of its six SEO siblings were
// checked against calc.mjs above and this one was not, so a rate change could
// silently leave it quoting stale numbers with nothing to notice.
test('the return/refund SEO page uses the same worked example the calculator defaults produce', () => {
  const comparison = compareReturnResolution(REVERB_DEFAULTS);
  assert.match(returnSeo, /Should I take the return or refund part of it on Reverb/i);
  assert.match(returnSeo, /href="\.\/#return-compare"|href="\.\/"/, 'the page should link back to the calculator');
  assert.match(returnSeo, /No warranty/);
  assert.match(returnSeo, /no SLA/i);
  assert.ok(returnSeo.includes(money(comparison.saleStandsPosition)), `missing sale-stands profit ${money(comparison.saleStandsPosition)}`);
  assert.ok(returnSeo.includes(money(comparison.returnPosition)), `missing return position ${money(comparison.returnPosition)}`);
  assert.ok(returnSeo.includes(money(comparison.costOfTakingTheReturn)), `missing cost of the return ${money(comparison.costOfTakingTheReturn)}`);
  assert.ok(returnSeo.includes(money(comparison.freightOnReturnPath)), `missing freight total ${money(comparison.freightOnReturnPath)}`);
  assert.ok(returnSeo.includes(money(comparison.unrefundedFees)), `missing unrefunded fees ${money(comparison.unrefundedFees)}`);
  assert.ok(returnSeo.includes(money(comparison.relistHaircut)), `missing relist haircut ${money(comparison.relistHaircut)}`);
  assert.ok(returnSeo.includes(money(comparison.breakEvenPartialRefund)), `missing break-even partial refund ${money(comparison.breakEvenPartialRefund)}`);
});

// A page missing og:* renders as a bare link with no preview when shared —
// PRODUCT_PLAYBOOK.md 5e requires Open Graph tags "so a shared link renders".
// should-i-eat-the-shipping-on-reverb.html, should-i-take-the-return-or-
// refund-on-reverb.html, and should-i-take-this-reverb-offer.html shipped
// without them; the last of those was also missing robots/canonical entirely.
test('the incumbent-comparison page links back, names Reverb\'s own resources honestly, and cross-links to real anchors', () => {
  assert.match(html, /vs-reverbs-selling-fees-page\.html/);
  assert.match(vsSeo, /<a href="\.\/">/);
  // Names Reverb's own domain and help center so a reader can check the
  // source directly, and states the published rate figures Reverb itself
  // publishes (a schedule, not a black-box calculator's output) rather than
  // guessing at anything only Reverb's live systems could confirm.
  assert.match(vsSeo, /reverb\.com\/selling\/selling-fees/);
  assert.match(vsSeo, /help\.reverb\.com/);
  assert.match(vsSeo, /5% selling fee/);
  assert.match(vsSeo, /3\.19% \+ \$0\.49/);
  assert.match(vsSeo, /2\.99% \+ \$0\.49/);
  assert.match(vsSeo, /Preferred Seller/);
  assert.match(vsSeo, /Earnings/);
  assert.match(vsSeo, /not affiliated with, endorsed by, or sponsored by Reverb/i);
  assert.match(vsSeo, /trademarks of Reverb\.com, Inc\./i);
  assert.match(vsSeo, /No warranty/);
  assert.match(vsSeo, /no SLA/i);
  // Every cross-link this page makes back into the calculator must resolve
  // to an id that actually exists there, or a reader following it lands
  // nowhere useful.
  for (const anchor of ['offer-compare', 'shipping-compare', 'safe-shipping-compare', 'consignment-compare', 'bump-compare', 'return-compare']) {
    assert.match(vsSeo, new RegExp(`#${anchor}"`), `vs-page should link to #${anchor}`);
    assert.match(html, new RegExp(`id="${anchor}"`), `index.html should have id="${anchor}"`);
  }
});

test('every published page carries Open Graph tags', () => {
  const dir = new URL('./', import.meta.url);
  const pages = readdirSync(dir).filter((name) => name.endsWith('.html'));
  assert.ok(pages.length >= 9, 'expected at least the 9 known pages in this venture');
  for (const page of pages) {
    const source = readFileSync(new URL(page, dir), 'utf8');
    assert.match(source, /<meta property="og:title" content="[^"]+">/, `${page} is missing og:title`);
    assert.match(source, /<meta property="og:description" content="[^"]+">/, `${page} is missing og:description`);
  }
});

test('the result panel is announced to screen readers when it updates', () => {
  // paint() rewrites the hero number, the <dl> breakdown, and the #paths
  // table body in place on every keystroke, with no page reload. Before
  // this fix the only aria-live element on the page was #status (the
  // copy-link message render() never touches), so a screen-reader user
  // changing an input got no announcement that the offer had changed.
  assert.match(
    html,
    /<section class="result" aria-live="polite">/,
    'the result section is not a live region, so updates are never announced',
  );
});

test('every worked-example sub-page carries a robots meta and a matching canonical link', () => {
  // index.html is the app shell and does not follow this convention; every
  // "should-i-..." doc page does, and should-i-take-this-reverb-offer.html
  // shipped without either while its five siblings had both.
  const dir = new URL('./', import.meta.url);
  const pages = readdirSync(dir).filter((name) => name.endsWith('.html') && name !== 'index.html');
  for (const page of pages) {
    const source = readFileSync(new URL(page, dir), 'utf8');
    assert.match(source, /<meta name="robots" content="index, follow">/, `${page} is missing a robots meta tag`);
    assert.match(source, new RegExp(`<link rel="canonical" href="${page.replace('.', '\\.')}"`), `${page} is missing (or has a mismatched) canonical link`);
  }
});
