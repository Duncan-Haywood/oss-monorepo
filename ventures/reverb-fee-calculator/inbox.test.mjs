import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REVERB_DEFAULTS, calculateReverbSale } from './calc.mjs';
import { parseInbox, triageOffers, INBOX_EXAMPLE } from './inbox.mjs';

test('parseInbox reads lines, skips blanks and comments, and reports bad lines', () => {
  const { offers, errors } = parseInbox('# header\nTele, $1,000, 800, 450\n\nTele, 1000, 800, 450\nbad line\nX, 10, abc');
  assert.equal(offers.length, 1);
  assert.equal(offers[0].name, 'Tele');
  assert.deepEqual(errors.map(e => e.line), [2, 5, 6]);
});

test('an optional fourth column overrides what you paid', () => {
  const { offers } = parseInbox('A, 100, 90\nB, 100, 90, 40');
  assert.equal(offers[0].itemCost, null);
  assert.equal(offers[1].itemCost, 40);
});

test('decline below break-even, counter below eBay, accept at or above it', () => {
  const { offers } = parseInbox(INBOX_EXAMPLE);
  const { rows } = triageOffers(REVERB_DEFAULTS, offers);
  const byName = Object.fromEntries(rows.map(r => [r.name, r]));
  assert.equal(byName['Strat neck'].decision, 'decline');
  assert.ok(byName['Strat neck'].profit < 0);
  for (const row of rows) {
    if (row.decision === 'counter') {
      assert.ok(row.profit >= 0 && row.profit < row.ebayAtList);
      assert.ok(row.counterPrice > row.offerPrice && row.counterPrice <= row.price);
    }
    if (row.decision === 'accept') assert.ok(row.profit >= row.ebayAtList);
  }
});

test('profit per row matches calculateReverbSale and only accepted offers are summed', () => {
  const { offers } = parseInbox('A, 800, 790, 450');
  const { rows, acceptedProfit } = triageOffers(REVERB_DEFAULTS, offers);
  const expected = calculateReverbSale({ ...REVERB_DEFAULTS, price: 800, itemCost: 450 }, 790).profit;
  assert.equal(rows[0].profit, expected);
  assert.equal(acceptedProfit, rows[0].decision === 'accept' ? expected : 0);
});

test('an offer at or above list is never countered above list', () => {
  const { offers } = parseInbox('A, 800, 800, 450');
  const { rows } = triageOffers({ ...REVERB_DEFAULTS, ebayFinalValueRate: 0, ebayFixedFee: 0 }, offers);
  assert.ok(rows[0].counterPrice === null || rows[0].counterPrice <= 800);
});
