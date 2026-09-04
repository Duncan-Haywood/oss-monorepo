import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INPUT_FIELDS } from './calc.mjs';

const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const vsSeo = readFileSync(new URL('./vs-ebay-fee-calculator.html', import.meta.url), 'utf8');
const article = readFileSync(new URL('./do-ebay-returns-wipe-the-profit.html', import.meta.url), 'utf8');
const formatArticle = readFileSync(new URL('./should-i-list-ebay-auction-or-buy-it-now.html', import.meta.url), 'utf8');

test('the form exposes every calculator field so a saved or shared link can restore it', () => {
  for (const field of INPUT_FIELDS) {
    assert.match(page, new RegExp(`id="${field}"`), field);
  }
});

test('the result panel shows the item price that holds a typed leftover', () => {
  assert.match(page, /id="targetProfit"/);
  assert.match(page, /id="targetProfitPrice"/);
  assert.match(page, /targetProfitPrice/);
  assert.match(page, /target_profit_calculated/);
});

test('the result panel shows a sourcing ceiling for the typed target ROI', () => {
  assert.match(page, /id="targetRoi"/);
  assert.match(page, /id="sourcingCeiling"/);
  assert.match(page, /id="sourcingCeilingBatch"/);
  assert.match(page, /id="ceilingStatus"/);
  assert.match(page, /calculateSourcingCeiling/);
  assert.match(page, /sourcing_ceiling_calculated/);
});

test('the result panel shows the maximum item cost at the typed target margin', () => {
  assert.match(page, /id="maxCostOfGoods"/);
  assert.match(page, /maxCostOfGoods/);
  assert.match(page, /max_acquisition_cost_calculated/);
});

test('the result panel shows expected profit after returns', () => {
  assert.match(page, /id="expectedProfit"/);
  assert.match(page, /id="cashEatenPerReturn"/);
  assert.match(page, /id="breakEvenReturnRate"/);
  assert.match(page, /return_rate_viewed/);
  assert.match(page, /do-ebay-returns-wipe-the-profit\.html/);
});

test('the returns article answers the search question and points back at the calculator', () => {
  assert.match(article, /eBay return rate profit|return rate can erase/i);
  assert.match(article, /href="\.\/#returns"/);
  assert.match(article, /No warranty/);
});

test('the listing-format table has one cell per column and a counted event', () => {
  assert.match(page, /compareListingFormat/);
  assert.match(page, /id="listingFormat"/);
  assert.match(page, /id="listingFormatVerdict"/);
  assert.match(page, /listing_format_compared/);
  assert.match(page, /should-i-list-ebay-auction-or-buy-it-now\.html/);
  assert.match(page, /"featureList":\s*"[^"]*auction vs Buy It Now/);
  const listingStart = page.indexOf('id="listingFormatTable"');
  const listingEnd = page.indexOf('id="partialRefund"', listingStart);
  const headerBlock = page.slice(listingStart, listingEnd === -1 ? undefined : listingEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Format',
    'Price',
    'Sell-through',
    'Days',
    'If it sells',
    'Expected after sell-through',
    'Per day',
  ]);
});

test('the auction article answers the search question and points back at the calculator', () => {
  assert.match(formatArticle, /auction or Buy It Now/i);
  assert.match(formatArticle, /href="\.\/#listingFormat"/);
  assert.match(formatArticle, /No warranty/);
  assert.match(formatArticle, /Best-effort hosting, no SLA/);
});

test('the partial-refund table has one cell per column and a counted event', () => {
  assert.match(page, /comparePartialRefund/);
  assert.match(page, /id="partialRefund"/);
  assert.match(page, /id="partialRefundVerdict"/);
  assert.match(page, /partial_refund_compared/);
  assert.match(page, /should-i-offer-a-partial-refund-on-ebay\.html/);
  assert.match(page, /"featureList":\s*"[^"]*partial refund vs take the return/);
  const refundStart = page.indexOf('id="partialRefundTable"');
  const refundEnd = page.indexOf('id="authenticity"', refundStart);
  const headerBlock = page.slice(refundStart, refundEnd === -1 ? undefined : refundEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Cash back',
    'Item back?',
    'Fees returned',
    'Keep after this case',
    'vs taking the return',
  ]);
});

test('the authenticity table has one cell per column and a counted event', () => {
  assert.match(page, /compareAuthenticity/);
  assert.match(page, /id="authenticity"/);
  assert.match(page, /id="authenticityVerdict"/);
  assert.match(page, /authenticity_compared/);
  assert.match(page, /is-ebay-authenticity-guarantee-worth-it\.html/);
  assert.match(page, /"featureList":\s*"[^"]*Authenticity Guarantee vs skip-AG/);
  const authStart = page.indexOf('id="authenticityTable"');
  const authEnd = page.indexOf('id="localPickup"', authStart);
  const headerBlock = page.slice(authStart, authEnd === -1 ? undefined : authEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Sell-through',
    'Return rate',
    'Extra on a sale',
    'If it sells',
    'Expected after sell-through',
    'vs skip-AG',
  ]);
});

test('the local-pickup table has one cell per column and a counted event', () => {
  assert.match(page, /compareLocalPickup/);
  assert.match(page, /id="localPickup"/);
  assert.match(page, /id="localPickupVerdict"/);
  assert.match(page, /local_pickup_compared/);
  assert.match(page, /should-i-offer-ebay-local-pickup\.html/);
  assert.match(page, /"featureList":\s*"[^"]*local pickup vs ship/);
  const pickupStart = page.indexOf('id="localPickupTable"');
  const pickupEnd = page.indexOf('id="lotVsSingles"', pickupStart);
  const headerBlock = page.slice(pickupStart, pickupEnd === -1 ? undefined : pickupEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Sell-through',
    'No-show',
    'Time cost',
    'If it sells',
    'Expected after sell-through',
    'vs ship',
  ]);
});

test('the lot-versus-singles table has one cell per column and a counted event', () => {
  assert.match(page, /compareLotVsSingles/);
  assert.match(page, /id="lotVsSingles"/);
  assert.match(page, /id="lotVsSinglesVerdict"/);
  assert.match(page, /lot_vs_singles_compared/);
  assert.match(page, /should-i-break-an-ebay-lot-into-individual-listings\.html/);
  assert.match(page, /"featureList":\s*"[^"]*lot vs individual listings/);
  const lotStart = page.indexOf('id="lotVsSinglesTable"');
  const lotEnd = page.indexOf('id="standardEnvelope"', lotStart);
  const headerBlock = page.slice(lotStart, lotEnd === -1 ? undefined : lotEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Listings',
    'Sell-through',
    'Time cost',
    'If it sells',
    'Expected after sell-through',
    'vs the lot',
  ]);
});

test('the Standard Envelope table has one cell per column and a counted event', () => {
  assert.match(page, /compareStandardEnvelope/);
  assert.match(page, /id="standardEnvelope"/);
  assert.match(page, /id="standardEnvelopeVerdict"/);
  assert.match(page, /standard_envelope_compared/);
  assert.match(page, /is-ebay-standard-envelope-worth-it\.html/);
  assert.match(page, /"featureList":\s*"[^"]*Standard Envelope vs tracked label/);
  const envStart = page.indexOf('id="standardEnvelopeTable"');
  const envEnd = page.indexOf('id="combinedShipping"', envStart);
  const headerBlock = page.slice(envStart, envEnd === -1 ? undefined : envEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Sell-through',
    'Loss rate',
    'Postage and pack',
    'If it sells',
    'Expected after sell-through',
    'vs tracked',
  ]);
});

test('the combined-shipping table has one cell per column and a counted event', () => {
  assert.match(page, /compareCombinedShipping/);
  assert.match(page, /id="combinedShipping"/);
  assert.match(page, /id="combinedShippingVerdict"/);
  assert.match(page, /combined_shipping_compared/);
  assert.match(page, /should-i-offer-ebay-combined-shipping\.html/);
  assert.match(page, /"featureList":\s*"[^"]*combined shipping vs separate labels/);
  const combinedStart = page.indexOf('id="combinedShippingTable"');
  const combinedEnd = page.indexOf('id="sellerInitiatedOffer"', combinedStart);
  const headerBlock = page.slice(combinedStart, combinedEnd === -1 ? undefined : combinedEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Shipments',
    'Collected',
    'Postage and pack',
    'If they keep it',
    'Expected after returns',
    'vs separate',
  ]);
});

test('the seller-initiated-offer table has one cell per column and a counted event', () => {
  assert.match(page, /compareSellerInitiatedOffer/);
  assert.match(page, /id="sellerInitiatedOffer"/);
  assert.match(page, /id="sellerInitiatedOfferVerdict"/);
  assert.match(page, /seller_initiated_offer_compared/);
  assert.match(page, /should-i-send-an-ebay-offer-to-watchers\.html/);
  assert.match(page, /"featureList":\s*"[^"]*seller-initiated offer vs waiting/);
  const offerStart = page.indexOf('id="sellerInitiatedOfferTable"');
  const offerEnd = page.indexOf('id="promotedOffsite"', offerStart);
  const headerBlock = page.slice(offerStart, offerEnd === -1 ? undefined : offerEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Price',
    'Close rate',
    'If it sells',
    'Expected after sell-through',
    'vs waiting',
  ]);
});

test('the Promoted Offsite table has one cell per column and a counted event', () => {
  assert.match(page, /comparePromotedOffsite/);
  assert.match(page, /id="promotedOffsite"/);
  assert.match(page, /id="promotedOffsiteVerdict"/);
  assert.match(page, /promoted_offsite_compared/);
  assert.match(page, /is-ebay-promoted-offsite-worth-it\.html/);
  assert.match(page, /"featureList":\s*"[^"]*Promoted Offsite vs skip/);
  const offsiteStart = page.indexOf('id="promotedOffsiteTable"');
  const offsiteEnd = page.indexOf('id="promotedStandard"', offsiteStart);
  const headerBlock = page.slice(offsiteStart, offsiteEnd === -1 ? undefined : offsiteEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Extra sales',
    'Ad spend',
    'Extra sales after returns',
    'If they keep the extras',
    'Expected after spend',
    'vs skip',
  ]);
});

test('the Promoted Listings Standard table has one cell per column and a counted event', () => {
  assert.match(page, /comparePromotedStandard/);
  assert.match(page, /id="promotedStandard"/);
  assert.match(page, /id="promotedStandardVerdict"/);
  assert.match(page, /promoted_standard_compared/);
  assert.match(page, /are-ebay-promoted-listings-worth-it\.html/);
  assert.match(page, /"featureList":\s*"[^"]*Promoted Listings Standard vs skip/);
  const standardStart = page.indexOf('id="promotedStandardTable"');
  const standardEnd = page.indexOf('id="promotedRateTable"', standardStart);
  const headerBlock = page.slice(standardStart, standardEnd === -1 ? undefined : standardEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Extra sales',
    'Ad fee',
    'Extra sales after returns',
    'If they keep the extras',
    'Expected after ads',
    'vs skip',
  ]);
});

test('the Promoted Listings Standard section also shows a rate ladder and an ad-rate cap', () => {
  assert.match(page, /calculatePromotedTable/);
  assert.match(page, /maxAffordablePromotedRate/);
  assert.match(page, /id="promotedRateTable"/);
  assert.match(page, /id="promotedRateCap"/);
  const ladderStart = page.indexOf('id="promotedRateTable"');
  const ladderEnd = page.indexOf('id="promotedAdvanced"', ladderStart);
  const headerBlock = page.slice(ladderStart, ladderEnd === -1 ? undefined : ladderEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, ['Ad rate', 'Leftover', 'After returns', 'vs 0%']);
});

test('the Promoted Listings Advanced table has one cell per column and a counted event', () => {
  assert.match(page, /comparePromotedAdvanced/);
  assert.match(page, /id="promotedAdvanced"/);
  assert.match(page, /id="promotedAdvancedVerdict"/);
  assert.match(page, /promoted_advanced_compared/);
  assert.match(page, /are-ebay-promoted-listings-advanced-worth-it\.html/);
  assert.match(page, /"featureList":\s*"[^"]*Promoted Listings Advanced vs skip/);
  const advancedStart = page.indexOf('id="promotedAdvancedTable"');
  const advancedEnd = page.indexOf('id="quantityDiscount"', advancedStart);
  const headerBlock = page.slice(advancedStart, advancedEnd === -1 ? undefined : advancedEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Clicks',
    'Ad spend',
    'Extra sales after returns',
    'If they keep the extras',
    'Expected after spend',
    'vs skip',
  ]);
});

test('the quantity-discount table has one cell per column and a counted event', () => {
  assert.match(page, /compareQuantityDiscount/);
  assert.match(page, /id="quantityDiscount"/);
  assert.match(page, /id="quantityDiscountVerdict"/);
  assert.match(page, /quantity_discount_compared/);
  assert.match(page, /should-i-offer-an-ebay-quantity-discount\.html/);
  assert.match(page, /"featureList":\s*"[^"]*quantity discount vs selling separately/);
  const qtyStart = page.indexOf('id="quantityDiscountTable"');
  const qtyEnd = page.indexOf('id="sellerCoupon"', qtyStart);
  const headerBlock = page.slice(qtyStart, qtyEnd === -1 ? undefined : qtyEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Shipments',
    'Unit price',
    'Close rate',
    'If they keep it',
    'Expected after sell-through',
    'vs singles',
  ]);
});

test('the seller-coupon table has one cell per column and a counted event', () => {
  assert.match(page, /compareSellerCoupon/);
  assert.match(page, /id="sellerCoupon"/);
  assert.match(page, /id="sellerCouponVerdict"/);
  assert.match(page, /seller_coupon_compared/);
  assert.match(page, /should-i-offer-an-ebay-coupon\.html/);
  assert.match(page, /"featureList":\s*"[^"]*seller coupon vs stay listed vs drop the list/);
  const couponStart = page.indexOf('id="sellerCouponTable"');
  const couponEnd = page.indexOf('id="immediatePayment"', couponStart);
  const headerBlock = page.slice(couponStart, couponEnd === -1 ? undefined : couponEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Paid price',
    'Redeem share',
    'Close rate',
    'If they keep it',
    'Expected after sell-through',
    'vs listed',
  ]);
});

test('the immediate-payment table has one cell per column and a counted event', () => {
  assert.match(page, /compareImmediatePayment/);
  assert.match(page, /id="immediatePayment"/);
  assert.match(page, /id="immediatePaymentVerdict"/);
  assert.match(page, /immediate_payment_compared/);
  assert.match(page, /should-i-require-immediate-payment-on-ebay\.html/);
  assert.match(page, /"featureList":\s*"[^"]*immediate payment vs unpaid checkouts/);
  const immediateStart = page.indexOf('id="immediatePaymentTable"');
  const immediateEnd = page.indexOf('id="topRatedPlus"', immediateStart);
  const headerBlock = page.slice(immediateStart, immediateEnd === -1 ? undefined : immediateEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Unpaid share',
    'Close rate',
    'Time on unpaid',
    'If checkout starts',
    'Expected after sell-through',
    'vs later',
  ]);
});

test('the Top Rated Plus table has one cell per column and a counted event', () => {
  assert.match(page, /compareTopRatedPlus/);
  assert.match(page, /id="topRatedPlus"/);
  assert.match(page, /id="topRatedPlusVerdict"/);
  assert.match(page, /top_rated_plus_compared/);
  assert.match(page, /is-ebay-top-rated-plus-worth-it\.html/);
  assert.match(page, /"featureList":\s*"[^"]*Top Rated Plus vs stay standard/);
  const trsStart = page.indexOf('id="topRatedPlusTable"');
  const trsEnd = page.indexOf('id="managedReturns"', trsStart);
  const headerBlock = page.slice(trsStart, trsEnd === -1 ? undefined : trsEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Sell-through',
    'Return rate',
    'Handling',
    'If it sells',
    'Expected after sell-through',
    'vs standard',
  ]);
});

test('the Managed Returns table has one cell per column and a counted event', () => {
  assert.match(page, /compareManagedReturns/);
  assert.match(page, /id="managedReturns"/);
  assert.match(page, /id="managedReturnsVerdict"/);
  assert.match(page, /managed_returns_compared/);
  assert.match(page, /is-ebay-managed-returns-worth-it\.html/);
  assert.match(page, /"featureList":\s*"[^"]*Managed Returns vs your own label/);
  const managedStart = page.indexOf('id="managedReturnsTable"');
  const managedEnd = page.indexOf('id="globalShipping"', managedStart);
  const headerBlock = page.slice(managedStart, managedEnd === -1 ? undefined : managedEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Label / fee',
    'Return rate',
    'Expected leftover',
    'vs self-label',
  ]);
});

test('the Global Shipping table has one cell per column and a counted event', () => {
  assert.match(page, /compareGlobalShipping/);
  assert.match(page, /id="globalShipping"/);
  assert.match(page, /id="globalShippingVerdict"/);
  assert.match(page, /global_shipping_compared/);
  assert.match(page, /should-i-use-ebay-global-shipping-program\.html/);
  assert.match(page, /"featureList":\s*"[^"]*Global Shipping Program vs you-ship/);
  const gspStart = page.indexOf('id="globalShippingTable"');
  const gspEnd = page.indexOf('id="storeTiers"', gspStart);
  const headerBlock = page.slice(gspStart, gspEnd === -1 ? undefined : gspEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Collected',
    'Close rate',
    'Loss rate',
    'If they keep it',
    'Expected after sell-through',
    'vs GSP',
  ]);
});

test('the store-subscription table has one cell per column and a counted event', () => {
  assert.match(page, /compareStoreTiers/);
  assert.match(page, /id="storeTiers"/);
  assert.match(page, /id="storeTiersVerdict"/);
  assert.match(page, /store_compared/);
  assert.match(page, /is-an-ebay-store-worth-it\.html/);
  assert.match(page, /"featureList":\s*"[^"]*store subscription vs no-store rate/);
  const storeStart = page.indexOf('id="storeTiersTable"');
  const storeEnd = page.indexOf('id="bestOffer"', storeStart);
  const headerBlock = page.slice(storeStart, storeEnd === -1 ? undefined : storeEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Monthly fee',
    'Final value',
    'Monthly leftover',
    'vs no store',
  ]);
});

test('the incoming Best Offer table has one cell per column and a counted event', () => {
  assert.match(page, /compareBestOffer/);
  assert.match(page, /id="bestOffer"/);
  assert.match(page, /id="bestOfferVerdict"/);
  assert.match(page, /best_offer_compared/);
  assert.match(page, /should-i-accept-this-ebay-offer\.html/);
  assert.match(page, /"featureList":\s*"[^"]*incoming Best Offer vs waiting/);
  const offerStart = page.indexOf('id="bestOfferTable"');
  const offerEnd = page.indexOf('id="freeShipping"', offerStart);
  const headerBlock = page.slice(offerStart, offerEnd === -1 ? undefined : offerEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Price',
    'If it sells',
    'Expected leftover',
    'vs waiting',
  ]);
});

test('the free-shipping table has one cell per column and a counted event', () => {
  assert.match(page, /compareFreeShipping/);
  assert.match(page, /id="freeShipping"/);
  assert.match(page, /id="freeShippingVerdict"/);
  assert.match(page, /free_shipping_compared/);
  assert.match(page, /should-i-offer-free-shipping-on-ebay\.html/);
  assert.match(page, /"featureList":\s*"[^"]*free shipping vs buyer-pays/);
  const freeStart = page.indexOf('id="freeShippingTable"');
  const freeEnd = page.indexOf('id="internationalShipping"', freeStart);
  const headerBlock = page.slice(freeStart, freeEnd === -1 ? undefined : freeEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Buyer pays',
    'Close rate',
    'If they keep it',
    'Expected after sell-through',
    'vs buyer-pays',
  ]);
});

test('the international-shipping table has one cell per column and a counted event', () => {
  assert.match(page, /compareInternational/);
  assert.match(page, /id="internationalShipping"/);
  assert.match(page, /id="internationalShippingVerdict"/);
  assert.match(page, /international_compared/);
  assert.match(page, /should-i-offer-international-shipping-on-ebay\.html/);
  assert.match(page, /"featureList":\s*"[^"]*domestic vs worldwide at this list/);
  const intlStart = page.indexOf('id="internationalShippingTable"');
  const intlEnd = page.indexOf('id="packageProtection"', intlStart);
  const headerBlock = page.slice(intlStart, intlEnd === -1 ? undefined : intlEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Intl fee',
    'Your label',
    'If they keep it',
    'Expected leftover',
    'vs domestic',
  ]);
});

test('the package-protection table has one cell per column and a counted event', () => {
  assert.match(page, /comparePackageProtection/);
  assert.match(page, /id="packageProtection"/);
  assert.match(page, /id="packageProtectionVerdict"/);
  assert.match(page, /package_protection_compared/);
  assert.match(page, /should-i-add-shipping-insurance-on-ebay\.html/);
  assert.match(page, /"featureList":\s*"[^"]*skip vs insurance vs signature after item-not-received claims/);
  const protStart = page.indexOf('id="packageProtectionTable"');
  const protEnd = page.indexOf('id="ebayLabels"', protStart);
  const headerBlock = page.slice(protStart, protEnd === -1 ? undefined : protEnd);
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Extra cost',
    'Claim rate',
    'Payout',
    'If they keep it',
    'Expected after claims',
    'vs skip',
  ]);
});

test('the eBay-label table has one cell per column and a counted event', () => {
  assert.match(page, /compareEbayLabels/);
  assert.match(page, /id="ebayLabels"/);
  assert.match(page, /id="ebayLabelsVerdict"/);
  assert.match(page, /ebay_labels_compared/);
  assert.match(page, /should-i-buy-ebay-shipping-labels\.html/);
  assert.match(page, /"featureList":\s*"[^"]*eBay label vs Pirate Ship after claims and upload time/);
  const headerBlock = page.slice(page.indexOf('id="ebayLabelsTable"'));
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Label',
    'Extra time',
    'Claim rate',
    'If they keep it',
    'Expected after claims',
    'vs eBay',
  ]);
});

test('Download repricing CSV is wired to the calculated table', () => {
  assert.match(page, /id="download"/);
  assert.match(page, /repricingCsv/);
  assert.match(page, /repricing_csv_downloaded/);
  assert.match(page, /from '\.\/csv\.mjs'/);
});

test('the incumbent-comparison page links back, names eBay\'s own tools honestly, and gives no unverifiable eBay dollar figures', () => {
  assert.match(page, /vs-ebay-fee-calculator\.html/);
  assert.match(vsSeo, /<a href="\.\/">/);
  // Names eBay's own tools and links to eBay's own domain so a reader can
  // check the source directly -- this page must never claim a dollar or
  // percentage figure for eBay's own Fee Calculator or Fee Illustrator that
  // only eBay's live schedule could confirm.
  assert.match(vsSeo, /ebay\.com\/sellercenter/);
  assert.match(vsSeo, /Fee Illustrator/);
  assert.doesNotMatch(vsSeo, /eBay('s)? (charges|fee is|costs?) \$/i);
  assert.doesNotMatch(vsSeo, /eBay('s)? (own )?Fee Calculator[^.]*\d+(\.\d+)?%/i);
  assert.match(vsSeo, /not affiliated with, endorsed by, or sponsored by eBay/i);
  assert.match(vsSeo, /trademarks of eBay Inc\./i);
  // Both cross-links this page makes into the main page must resolve to
  // ids that actually exist there, or a reader following them lands nowhere.
  assert.match(vsSeo, /#returns"/);
  assert.match(page, /id="returns"/);
  assert.match(vsSeo, /#storeTiers"/);
  assert.match(page, /id="storeTiers"/);
});

test('the incumbent-comparison page carries the standard disclaimer and sponsor link', () => {
  assert.match(vsSeo, /No warranty/);
  assert.match(vsSeo, /Best-effort hosting, no SLA/);
  assert.match(vsSeo, /github\.com\/sponsors\/Duncan-Haywood/);
});
