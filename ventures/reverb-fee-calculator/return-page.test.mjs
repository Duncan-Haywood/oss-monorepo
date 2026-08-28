// Pins every figure printed on the return-resolution page to the arithmetic
// that produces it. The page is static HTML, so a change to a default or to
// `compareReturnResolution` would otherwise leave a page confidently quoting
// numbers the calculator no longer computes — the failure mode a reader cannot
// see and the unit suite does not look for.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REVERB_DEFAULTS,
  compareReturnResolution,
  returnResolutionNote,
} from './calc.mjs';

const page = readFileSync(new URL('./should-i-take-the-return-or-refund-on-reverb.html', import.meta.url), 'utf8');
const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

function money(value) {
  return `$${(Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2)}`;
}

test('the page quotes the four positions the calculator computes', () => {
  const comparison = compareReturnResolution(REVERB_DEFAULTS);
  for (const row of comparison.rows) {
    const text = row.position < 0 ? `−${money(Math.abs(row.position))}` : money(row.position);
    assert.ok(page.includes(text), `missing ${row.label} position ${text}`);
    assert.ok(page.includes(money(row.cashBack)), `missing ${row.label} cash back`);
  }
});

test('the page quotes the break-even concession and its share of the sale', () => {
  const comparison = compareReturnResolution(REVERB_DEFAULTS);
  assert.ok(page.includes(money(comparison.breakEvenPartialRefund)), 'missing break-even refund');
  const share = `${(comparison.breakEvenPartialRefund / comparison.sold.salePrice * 100).toFixed(1)}%`;
  assert.ok(page.includes(share), `missing break-even share ${share}`);
});

test('the page breaks the cost of the return into the three parts that make it up', () => {
  const comparison = compareReturnResolution(REVERB_DEFAULTS);
  assert.ok(page.includes(money(comparison.costOfTakingTheReturn)), 'missing cost of the return');
  assert.ok(page.includes(money(comparison.freightOnReturnPath)), 'missing freight total');
  assert.ok(page.includes(money(comparison.unrefundedFees)), 'missing unrefunded fees');
  assert.ok(page.includes(money(comparison.relistHaircut)), 'missing relist haircut');
  assert.ok(page.includes(money(comparison.relistNet)), 'missing relist net');
  // The three parts must actually sum to the headline, or the page is telling
  // a story the arithmetic does not support.
  const parts = comparison.freightOnReturnPath - REVERB_DEFAULTS.shippingCost
    + comparison.unrefundedFees + comparison.relistHaircut + REVERB_DEFAULTS.otherCost;
  assert.ok(Math.abs(parts - comparison.costOfTakingTheReturn) < 1e-9);
});

test('the page quotes the concession advantage and the full-refund penalty from the rows', () => {
  const comparison = compareReturnResolution(REVERB_DEFAULTS);
  assert.ok(page.includes(money(comparison.rows[1].vsReturn)), 'missing partial-refund advantage');
  assert.ok(page.includes(money(Math.abs(comparison.rows[3].vsReturn))), 'missing full-refund penalty');
});

test('the unsellable-relist figure the page names is the one the calculator gives', () => {
  const unsellable = compareReturnResolution({ ...REVERB_DEFAULTS, relistPrice: 0 });
  assert.ok(page.includes(money(unsellable.costOfTakingTheReturn)), 'missing unsellable return cost');
  assert.match(page, /set it to \$0 for a piece that comes back unsellable/);
});

test('the page carries the disclaimers, the calculator link, and no advice', () => {
  assert.match(page, /Should I take the return or refund part of it on Reverb/i);
  assert.match(page, /href="\.\/#return-compare"/);
  assert.match(page, /No warranty/);
  assert.match(page, /no SLA/i);
  assert.match(page, /not legal, tax, financial, or business advice/i);
  // The one claim this page must never make: that an expensive return is
  // therefore a refusable one.
  assert.match(page, /a return you are obliged to accept is not made optional by being expensive/i);
  assert.doesNotMatch(page, /you should refuse|we recommend|deny the (return|claim)/i);
});

test('the calculator wires the return section the page points at', () => {
  assert.match(index, /id="return-compare"/);
  assert.match(index, /id="returnRows"/);
  assert.match(index, /id="returnVerdict"/);
  assert.match(index, /id="returnMatch"/);
  assert.match(index, /id="returnShippingCost"/);
  assert.match(index, /id="feeRefundOnReturnPct"/);
  assert.match(index, /id="relistPrice"/);
  assert.match(index, /id="partialRefund"/);
  assert.match(index, /compareReturnResolution/);
  assert.match(index, /returnResolutionNote/);
  assert.match(index, /should-i-take-the-return-or-refund-on-reverb\.html/);
  assert.match(index, /reverb_return_resolution_compared/);
  const featureList = index.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, 'no schema.org featureList found');
  assert.match(featureList[1], /take the return versus a partial refund/i);
});

test('the verdict the calculator paints is the sentence the page tells', () => {
  const note = returnResolutionNote(compareReturnResolution(REVERB_DEFAULTS));
  const comparison = compareReturnResolution(REVERB_DEFAULTS);
  assert.ok(note.includes(money(comparison.costOfTakingTheReturn)));
  assert.ok(note.includes(money(comparison.breakEvenPartialRefund)));
  assert.ok(page.includes(money(comparison.costOfTakingTheReturn)));
  assert.ok(page.includes(money(comparison.breakEvenPartialRefund)));
});
