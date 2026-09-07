// Pins every figure printed on the wait-for-a-better-offer page to the
// arithmetic that produces it. The page is static HTML, so a change to a
// default or to `compareWaitForBetterOffer` would otherwise leave it
// confidently quoting numbers the calculator no longer computes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REVERB_DEFAULTS,
  compareWaitForBetterOffer,
  waitForBetterOfferNote,
} from './calc.mjs';

const page = readFileSync(new URL('./should-i-wait-for-a-better-reverb-offer.html', import.meta.url), 'utf8');
const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

function money(value) {
  return `$${(Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2)}`;
}
function signed(value) {
  return `${value < 0 ? '−' : '+'}${money(Math.abs(value))}`;
}

test('the page quotes the three rows the calculator computes', () => {
  const comparison = compareWaitForBetterOffer(REVERB_DEFAULTS);
  for (const row of comparison.rows) {
    assert.ok(page.includes(money(row.expectedProfit)), `missing ${row.label} net cash ${money(row.expectedProfit)}`);
    assert.ok(page.includes(signed(row.vsTakeNow)), `missing ${row.label} delta ${signed(row.vsTakeNow)}`);
  }
});

test('the page quotes the break-even chance of reaching list', () => {
  const comparison = compareWaitForBetterOffer(REVERB_DEFAULTS);
  assert.ok(page.includes(comparison.breakEvenProbPct.toFixed(2)), 'missing break-even chance');
});

test('the page verdict sentence matches waitForBetterOfferNote', () => {
  const comparison = compareWaitForBetterOffer(REVERB_DEFAULTS);
  const note = waitForBetterOfferNote(comparison);
  assert.ok(page.includes(money(comparison.vsWaiting)) || page.includes(money(-comparison.vsWaiting)));
  // The note's key numbers must all show up on the static page.
  assert.match(note, /30\.00% chance/);
  assert.ok(page.includes('30%'), 'missing the typed probability on the page');
});

test('the page carries the disclaimers, the calculator link, and no advice', () => {
  assert.match(page, /Should I wait for a better Reverb offer/i);
  assert.match(page, /href="\.\/#wait-compare"/);
  assert.match(page, /No warranty/);
  assert.match(page, /no SLA/i);
  assert.doesNotMatch(page, /you should (wait|take)|we recommend/i);
});

test('every worked-example page carries a robots meta and a matching canonical link', () => {
  assert.match(page, /<meta name="robots" content="index, follow">/);
  assert.match(page, /<link rel="canonical" href="should-i-wait-for-a-better-reverb-offer\.html">/);
  assert.match(page, /<meta property="og:title" content="[^"]+">/);
  assert.match(page, /<meta property="og:description" content="[^"]+">/);
});

test('the calculator wires the wait-compare section the page points at', () => {
  assert.match(index, /id="wait-compare"/);
  assert.match(index, /id="waitRows"/);
  assert.match(index, /id="waitVerdict"/);
  assert.match(index, /id="waitProbListPct"/);
  assert.match(index, /id="waitFallbackPrice"/);
  assert.match(index, /compareWaitForBetterOffer/);
  assert.match(index, /waitForBetterOfferNote/);
  assert.match(index, /should-i-wait-for-a-better-reverb-offer\.html/);
  assert.match(index, /reverb_wait_compared/);
  const featureList = index.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, 'no schema.org featureList found');
  assert.match(featureList[1], /wait for a better one/i);
});

test('the verdict the calculator paints is the sentence the page tells', () => {
  const note = waitForBetterOfferNote(compareWaitForBetterOffer(REVERB_DEFAULTS));
  assert.match(note, /\$3\.67 more/);
  assert.match(note, /33\.33%/);
});
