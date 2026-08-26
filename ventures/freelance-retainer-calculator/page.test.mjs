import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateCashFloat, comparePaymentTerms, compareRetainerUsage } from './app.js';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const termsPage = readFileSync(new URL('./retainer-payment-terms.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

assert.match(index, /id="paymentTerms"/);
assert.match(index, /id="cashFloat"/);
assert.match(index, /id="termsLabel"/);
assert.match(index, /id="usageRows"/);
assert.match(index, /retainer-payment-terms\.html/);
assert.match(index, /retainer-vs-hourly\.html/);
assert.match(index, /Should I accept Net 30/);

assert.match(termsPage, /id="floatForm"/);
assert.match(termsPage, /id="floatTarget"/);
assert.match(termsPage, /id="floatRows"/);
assert.match(termsPage, /\$15,600/);
assert.match(termsPage, /Invoice at month-end, Net 30/);
assert.match(termsPage, /No warranty/);
assert.match(termsPage, /GitHub Sponsors/);
assert.match(termsPage, /don't count my usage/);

assert.match(sitemap, /retainer-payment-terms\.html/);
assert.match(sitemap, /retainer-vs-hourly\.html/);

const plan = { rate: 75, retainer: 1725, retainerHours: 20 };
const usage = compareRetainerUsage(plan);
assert.equal(usage.breakEvenHours, 23);
const float = calculateCashFloat(7800, 'arrears30');
assert.equal(float.cashToFloat, 15600);
assert.equal(comparePaymentTerms(7800)[2].cashToFloat, 7800);

console.log('freelance retainer page tests passed');
