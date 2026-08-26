import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const article = readFileSync(new URL('./should-i-take-partial-retainage-now.html', import.meta.url), 'utf8');

test('the worksheet exposes the partial-offer compare and counts it once', () => {
  assert.match(page, /comparePartialReleaseOffer/);
  assert.match(page, /id="partialReleaseCompare"/);
  assert.match(page, /id="partialOffer"/);
  assert.match(page, /id="waitDays"/);
  assert.match(page, /id="partialReleaseVerdict"|id="partialReleaseNote"/);
  assert.match(page, /retainage-cashflow:partial-release-compared/);
  assert.match(page, /should-i-take-partial-retainage-now\.html/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /releaseSchedule/);
  assert.match(page, /id="releaseSection"/);
  assert.match(page, /id="share"/);
  assert.match(page, /retainage-cashflow:link-copies/);
  assert.match(page, /compareRetainageRates/);
  assert.match(page, /id="rateSection"/);
  assert.match(page, /id="typicalHoldDays"/);
  assert.match(page, /What bid keeps the same cash coming in\?/);
  assert.match(page, /retainage-cashflow:rate-compared/);
  const headerBlock = page.slice(page.indexOf('id="partialReleaseTable"'));
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Cash from retainage',
    'Added carrying',
    'Net after carrying',
    'Vs waiting',
  ]);
});

test('the partial-retainage article answers the search question and points back', () => {
  assert.match(article, /partial retainage check now/i);
  assert.match(article, /href="\.\/#partialReleaseCompare"/);
  assert.match(article, /\$9,802\.74/);
  assert.match(article, /No warranty/);
  assert.match(article, /Best-effort hosting, no SLA/);
});
