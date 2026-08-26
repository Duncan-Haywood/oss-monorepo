import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INPUT_FIELDS } from './calc.mjs';

const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const article = readFileSync(new URL('./do-ebay-returns-wipe-the-profit.html', import.meta.url), 'utf8');
const formatArticle = readFileSync(new URL('./should-i-list-ebay-auction-or-buy-it-now.html', import.meta.url), 'utf8');

test('the form exposes every calculator field so a saved or shared link can restore it', () => {
  for (const field of INPUT_FIELDS) {
    assert.match(page, new RegExp(`id="${field}"`), field);
  }
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
  const headerBlock = page.slice(page.indexOf('id="lotVsSinglesTable"'));
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
