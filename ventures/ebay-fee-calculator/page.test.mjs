import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INPUT_FIELDS } from './calc.mjs';

const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const article = readFileSync(new URL('./do-ebay-returns-wipe-the-profit.html', import.meta.url), 'utf8');

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
