import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSale,
  compareOffer,
  commissionFor,
  priceForTargetPayout,
  BREAK_EVEN_PRICE,
  COMMISSION_THRESHOLD,
  FLAT_FEE,
  PERCENT_RATE,
} from './calc.mjs';

test('the break-even price is where 20% equals the flat fee', () => {
  assert.equal(BREAK_EVEN_PRICE, 14.75);
  assert.ok(Math.abs(BREAK_EVEN_PRICE * (PERCENT_RATE / 100) - FLAT_FEE) < 1e-9);
});

test('a sale under $15 pays the flat fee', () => {
  const { tier, commission } = commissionFor(10);
  assert.equal(tier, 'flat');
  assert.equal(commission, FLAT_FEE);
});

test('a sale at exactly $15 pays 20%, not the flat fee', () => {
  const { tier, commission } = commissionFor(15);
  assert.equal(tier, 'percent');
  assert.equal(commission, 3);
});

test('a sale at $14.99 still pays the flat fee', () => {
  const { tier, commission } = commissionFor(14.99);
  assert.equal(tier, 'flat');
  assert.equal(commission, FLAT_FEE);
});

test('Poshmark\'s own worked example: a $50 item pays 20% = $10, seller keeps $40', () => {
  const result = calculateSale({ salePrice: 50, itemCost: 0, otherCost: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.tier, 'percent');
  assert.equal(result.commission, 10);
  assert.equal(result.payout, 40);
});

test('a $10 item pays a 29.5% effective rate under the flat fee', () => {
  const result = calculateSale({ salePrice: 10, itemCost: 0, otherCost: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.commission, 2.95);
  assert.ok(Math.abs(result.effectiveRate - 29.5) < 0.01);
  assert.ok(result.extraVersusPercent > 0, 'flat fee should cost more than 20% would at $10');
  assert.ok(Math.abs(result.extraVersusPercent - (2.95 - 2)) < 1e-9);
});

test('a $5 item is crushed: effectively a 59% fee', () => {
  const result = calculateSale({ salePrice: 5, itemCost: 0, otherCost: 0 });
  assert.ok(Math.abs(result.effectiveRate - 59) < 0.01);
});

test('between $14.75 and $15 the flat fee is a bargain against 20%', () => {
  const result = calculateSale({ salePrice: 14.9, itemCost: 0, otherCost: 0 });
  assert.equal(result.tier, 'flat');
  assert.ok(result.extraVersusPercent < 0, 'flat fee should be cheaper than 20% here');
});

test('exactly at the break-even price the flat fee equals 20%', () => {
  const result = calculateSale({ salePrice: BREAK_EVEN_PRICE, itemCost: 0, otherCost: 0 });
  assert.ok(Math.abs(result.extraVersusPercent) < 1e-9);
});

test('profit subtracts item cost and packaging from payout', () => {
  const result = calculateSale({ salePrice: 50, itemCost: 12, otherCost: 1.5 });
  assert.equal(result.payout, 40);
  assert.ok(Math.abs(result.profit - 26.5) < 1e-9);
});

test('a sale below cost is flagged as a loss', () => {
  const result = calculateSale({ salePrice: 8, itemCost: 20, otherCost: 1 });
  assert.ok(result.profit < 0);
  assert.ok(result.notes.some(n => /loses money/.test(n)));
});

test('sale price is required', () => {
  const result = calculateSale({ salePrice: '' });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].id, 'salePrice');
});

test('a negative sale price is rejected', () => {
  const result = calculateSale({ salePrice: -5 });
  assert.equal(result.ok, false);
});

test('itemCost and otherCost default to zero when blank', () => {
  const result = calculateSale({ salePrice: 20, itemCost: '', otherCost: '' });
  assert.equal(result.ok, true);
  assert.equal(result.itemCost, 0);
  assert.equal(result.otherCost, 0);
});

// --- priceForTargetPayout ---

test('target payout in the flat tier solves to price = target + 2.95', () => {
  const price = priceForTargetPayout(7.05);
  assert.ok(Math.abs(price - 10) < 1e-9);
  const { commission } = commissionFor(price);
  assert.ok(Math.abs((price - commission) - 7.05) < 1e-9);
});

test('target payout in the percent tier solves to price = target / 0.8', () => {
  const price = priceForTargetPayout(40);
  assert.ok(Math.abs(price - 50) < 1e-9);
  const { commission } = commissionFor(price);
  assert.ok(Math.abs((price - commission) - 40) < 1e-9);
});

test('target payout right at the tier seam resolves in the flat tier', () => {
  const price = priceForTargetPayout(12.02);
  assert.ok(price < COMMISSION_THRESHOLD, `expected a sub-$15 price, got ${price}`);
  const { commission } = commissionFor(price);
  assert.ok(Math.abs((price - commission) - 12.02) < 1e-9);
});

test('an unreachably negative target payout returns null', () => {
  assert.equal(priceForTargetPayout(-10), null);
});

test('calculateSale surfaces the target price for a stated profit', () => {
  const result = calculateSale({ salePrice: 50, itemCost: 10, otherCost: 0, targetProfit: 30 });
  assert.ok(result.priceForTarget !== null);
  const { commission } = commissionFor(result.priceForTarget);
  const payout = result.priceForTarget - commission;
  assert.ok(Math.abs((payout - 10) - 30) < 1e-6, 'the solved price should net a $30 profit after the $10 cost');
});

// --- compareOffer ---

test('within the percent tier, Poshmark absorbs 20% of any discount', () => {
  const result = compareOffer({ listedPrice: 40, offerPrice: 35, itemCost: 0, otherCost: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.crossesThreshold, false);
  assert.ok(Math.abs(result.priceDrop - 5) < 1e-9);
  assert.ok(Math.abs(result.commissionDrop - 1) < 1e-9, 'commission should drop by 20% of the discount');
  assert.ok(Math.abs(result.payoutDrop - 4) < 1e-9, 'seller absorbs the other 80%');
});

test('within the flat tier, every cent of a discount comes from the seller', () => {
  const result = compareOffer({ listedPrice: 12, offerPrice: 8, itemCost: 0, otherCost: 0 });
  assert.equal(result.crossesThreshold, false);
  assert.ok(Math.abs(result.commissionDrop) < 1e-9, 'the flat fee does not move');
  assert.ok(Math.abs(result.payoutDrop - result.priceDrop) < 1e-9);
});

test('crossing the $15 threshold is a one-time commission break, not a penalty', () => {
  // Listed at $20 (20% => payout $16). Offered $14 (flat fee => payout $11.05).
  // Commission drops by $1.05 -- the fee never increases here, so the seller
  // absorbs $4.95 of the $6 sticker discount, not more than the discount.
  const result = compareOffer({ listedPrice: 20, offerPrice: 14, itemCost: 0, otherCost: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.crossesThreshold, true);
  assert.ok(Math.abs(result.listed.payout - 16) < 1e-9);
  assert.ok(Math.abs(result.offer.payout - 11.05) < 1e-9);
  assert.ok(Math.abs(result.priceDrop - 6) < 1e-9);
  assert.ok(Math.abs(result.commissionDrop - 1.05) < 1e-9);
  assert.ok(Math.abs(result.payoutDrop - 4.95) < 1e-9);
  assert.ok(result.payoutDrop < result.priceDrop, 'the discount is never fully absorbed by the seller when crossing down');
});

test('a one-cent price cut across the boundary can raise the seller\'s payout', () => {
  // Listed at exactly $15.00 (20% => commission $3.00, payout $12.00).
  // Offered $14.99 (flat fee => commission $2.95, payout $12.04).
  // The seller's take-home goes UP by four cents on a lower sale price.
  const result = compareOffer({ listedPrice: 15, offerPrice: 14.99, itemCost: 0, otherCost: 0 });
  assert.equal(result.crossesThreshold, true);
  assert.ok(result.payoutDrop < 0, `expected payout to rise, got a drop of ${result.payoutDrop}`);
  assert.ok(result.notes.some(n => /keep .* more at the lower price/.test(n)));
});

test('a near-boundary offer shows most of a small discount absorbed by the fee break', () => {
  // Listed at $15.05 (20% => payout $12.04). Offered $14.90 (flat => payout $11.95).
  const result = compareOffer({ listedPrice: 15.05, offerPrice: 14.9, itemCost: 0, otherCost: 0 });
  assert.equal(result.crossesThreshold, true);
  assert.ok(Math.abs(result.priceDrop - 0.15) < 1e-9);
  assert.ok(result.payoutDrop > 0 && result.payoutDrop < result.priceDrop + 1e-9);
});

test('compareOffer requires both prices', () => {
  const result = compareOffer({ listedPrice: '', offerPrice: 10 });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].id, 'listedPrice');
});

// --- red-team guards (escaped mutants and a real defect) ---

test('compareOffer does not call an offer above the listed price a discount', () => {
  const result = compareOffer({ listedPrice: 10, offerPrice: 20, itemCost: 0, otherCost: 0 });
  assert.equal(result.notes.length, 1);
  assert.match(result.notes[0], /above the listed price/);
  assert.ok(!result.notes.some(n => /\$-/.test(n)), 'no negative dollar amounts in prose');
});

test('compareOffer: an offer exactly at $15.00 does not cross the threshold', () => {
  const result = compareOffer({ listedPrice: 20, offerPrice: 15, itemCost: 0, otherCost: 0 });
  assert.equal(result.crossesThreshold, false);
});

test('null and undefined sale price are rejected as missing, not read as zero', () => {
  for (const value of [null, undefined, '   ']) {
    const result = calculateSale({ salePrice: value });
    assert.equal(result.ok, false, `salePrice ${String(value)} should be rejected`);
    assert.equal(result.errors[0].id, 'salePrice');
  }
});

test('at the break-even price the flat fee is neither a bargain nor a penalty note', () => {
  const result = calculateSale({ salePrice: BREAK_EVEN_PRICE });
  assert.equal(result.tier, 'flat');
  assert.ok(!result.notes.some(n => /more than 20%|bargain/.test(n)), result.notes.join(' | '));
});

test('a flat-tier sale under $16 gets no "just over the line" note', () => {
  const result = calculateSale({ salePrice: 10 });
  assert.equal(result.tier, 'flat');
  assert.ok(!result.notes.some(n => /just over/.test(n)));
});
