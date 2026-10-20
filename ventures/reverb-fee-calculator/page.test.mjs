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
import { whereToSellUrl } from './to-where-to-sell.mjs';

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
  assert.match(html, /id="copyCounterOffer"/);
  assert.match(html, /counterOfferMessage/);
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

test('the generic-method comparison page links back, names no specific product, and is linked from index', () => {
  const spreadsheetSeo = readFileSync(
    new URL('./vs-tracking-offers-in-a-spreadsheet.html', import.meta.url),
    'utf8',
  );
  assert.match(html, /vs-tracking-offers-in-a-spreadsheet\.html/);
  assert.match(spreadsheetSeo, /<a href="\.\/">/);
  assert.match(spreadsheetSeo, /names no specific product/i);
  assert.match(spreadsheetSeo, /No warranty/);
  assert.match(spreadsheetSeo, /no SLA/i);
  assert.match(spreadsheetSeo, /where-to-sell-calculator\/"/);
});

test('every published page carries Open Graph tags', () => {
  const dir = new URL('./', import.meta.url);
  const pages = readdirSync(dir).filter((name) => name.endsWith('.html'));
  assert.ok(pages.length >= 10, 'expected at least the 10 known pages in this venture');
  for (const page of pages) {
    const source = readFileSync(new URL(page, dir), 'utf8');
    assert.match(source, /<meta property="og:title" content="[^"]+">/, `${page} is missing og:title`);
    assert.match(source, /<meta property="og:description" content="[^"]+">/, `${page} is missing og:description`);
    // og:type was missing on every page in this venture (index.html and all
    // nine "should-i-..."/"vs-..." pages) while the sibling
    // where-to-sell-calculator venture carried it everywhere — a fleet
    // consistency gap rather than a deliberate omission.
    assert.match(source, /<meta property="og:type" content="website">/, `${page} is missing og:type`);
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
  // should-i-take-this-reverb-offer.html once shipped without either while
  // its five siblings had both.
  const dir = new URL('./', import.meta.url);
  const pages = readdirSync(dir).filter((name) => name.endsWith('.html') && name !== 'index.html');
  for (const page of pages) {
    const source = readFileSync(new URL(page, dir), 'utf8');
    assert.match(source, /<meta name="robots" content="index, follow">/, `${page} is missing a robots meta tag`);
    assert.match(source, new RegExp(`<link rel="canonical" href="${page.replace('.', '\\.')}"`), `${page} is missing (or has a mismatched) canonical link`);
  }
});

// index.html used to be exempted from the check above as "the app shell",
// but where-to-sell-calculator/index.html — the same "app shell" shape —
// already carries a robots meta, a canonical link and a favicon on its own
// index.html, so the exemption was an inconsistency rather than a rule:
// the tool's own landing page is the one page in the venture most worth
// having a canonical URL, since the share-link feature appends a URL
// fragment to this exact page.
test('index.html itself carries a robots meta, a canonical link, a favicon, and og:type', () => {
  assert.match(html, /<meta name="robots" content="index, follow">/, 'index.html is missing a robots meta tag');
  assert.match(html, /<link rel="canonical" href="\.">/, 'index.html is missing (or has a mismatched) canonical link');
  assert.match(html, /<link rel="icon" href="data:image\/svg\+xml,/, 'index.html is missing a favicon');
  assert.match(html, /<meta property="og:type" content="website">/, 'index.html is missing og:type');
});

// where-to-sell-calculator already hands a Reverb comparison into this page;
// without a crawlable link back, a visitor who landed on Reverb first has no
// path to the multi-channel ranking that owns the handoff.
test('index links to the where-to-sell calculator', () => {
  assert.match(html, /href="\.\.\/where-to-sell-calculator\/"/);
});

// index.html carries a live, prefilled link into where-to-sell-calculator
// (built by to-where-to-sell.mjs from whatever the visitor typed) but the
// eight "should-i-..." worked-example pages are the actual search-landing
// pages for this venture's untested hypotheses, and none of them offered a
// way into the cross-channel comparison at all -- a seller who searched
// "should I take this Reverb offer" and landed there first had no path to
// the ranking against eBay, Etsy, Amazon, or their own store, only a path
// back to this same tool's own index. These pages are static, so the link
// carries the worked example's own numbers (REVERB_DEFAULTS) rather than a
// live value -- computed here from the same function index.html uses, so a
// change to the payload shape or the worked example fails this test instead
// of quietly landing eight dead or stale links.
test('every worked-example page hands its numbers to the where-to-sell calculator', () => {
  const dir = new URL('./', import.meta.url);
  const expectedHref = whereToSellUrl(REVERB_DEFAULTS);
  const pages = readdirSync(dir).filter(
    (name) => name.startsWith('should-i-') && name.endsWith('.html'),
  );
  assert.ok(pages.length >= 8, 'expected at least the 8 known worked-example pages');
  for (const page of pages) {
    const source = readFileSync(new URL(page, dir), 'utf8');
    assert.ok(
      source.includes(`href="${expectedHref}"`),
      `${page} is missing (or has a stale) link into the where-to-sell calculator`,
    );
  }
});

// ---------------------------------------------------------------------------
// Invalid input has a visible error state, not a silent freeze
// ---------------------------------------------------------------------------
//
// Every function in calc.mjs throws on an input it cannot price -- a blank
// field mid-edit, a negative number, percentage fees that add to 100% or
// more. Clearing a number input to retype it is an ordinary interaction, and
// before this the page's own render function had no try/catch around any of
// that arithmetic: the throw escaped the `input` listener uncaught and the
// calculator froze at its last good render with nothing on screen to say why.
// These checks are static (no DOM here, matching this file's existing
// jsdom-free style), so they assert the markup and wiring a real browser
// needs to show the error rather than executing the script.

test('calc.mjs genuinely throws on a blank or invalid input, so the page must handle it', () => {
  assert.throws(() => compareOfferToList({ ...REVERB_DEFAULTS, price: '' }));
  assert.throws(() => compareOfferToList({ ...REVERB_DEFAULTS, offerPrice: '-5' }));
  assert.throws(() => compareOfferToList({
    ...REVERB_DEFAULTS,
    marketplaceRate: 60,
    paymentRate: 40,
    givesRate: 5,
  }));
});

test('the page has a dedicated error banner, hidden until an input fails to price', () => {
  assert.match(html, /id="inputError"[^>]*hidden/, 'error banner missing or not hidden by default');
  // Inside the same aria-live="polite" result panel as the hero number, so a
  // screen reader announces it the same way it announces a normal update --
  // no separate live region to keep in sync with the one that already exists.
  const resultSection = html.match(/<section class="result"[^>]*aria-live="polite"[\s\S]*?<\/section>/);
  assert.ok(resultSection, 'result panel with aria-live="polite" not found');
  assert.match(resultSection[0], /id="inputError"/, 'error banner must sit inside the live result panel');
});

test('paint() wraps its arithmetic in try/catch and shows the caught message', () => {
  assert.match(html, /function paint\(\)/);
  assert.match(html, /try\s*\{\s*paintResults\(inputs\)/, 'paint() must try the rendering call');
  assert.match(html, /catch \(error\)\s*\{\s*showInputError\(/, 'a thrown error must reach showInputError');
  assert.match(html, /function showInputError\(message\)/);
  assert.match(html, /function clearInputError\(\)/);
});

test('an invalid draft is still saved locally, so a mid-edit value survives a reload', () => {
  // localStorage.setItem must happen before the try/catch, not inside
  // paintResults -- otherwise a throw skips saving the very input the seller
  // is in the middle of typing.
  const paintBody = html.match(/function paint\(\)\s*\{([\s\S]*?)\n    \}/);
  assert.ok(paintBody, 'paint() body not found');
  assert.match(paintBody[1], /localStorage\.setItem\(INPUTS_KEY/);
  assert.match(paintBody[1], /try\s*\{/);
});

test('the Preferred Seller button sets only the processing percentage to 2.99', () => {
  assert.match(html, /id="preferredSeller"/);
  const handler = html.match(/field\('preferredSeller'\)\.addEventListener\('click', \(\) => \{([\s\S]*?)\n    \}\);/);
  assert.ok(handler, 'no click handler for preferredSeller');
  assert.match(handler[1], /field\('paymentRate'\)\.value = '2\.99'/);
  assert.doesNotMatch(handler[1], /paymentFixed/);
});
