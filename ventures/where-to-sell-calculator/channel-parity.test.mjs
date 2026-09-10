// Two tools in this portfolio must not quote the same marketplace differently.
//
// WHY THIS EXISTS
//
// This page prices Reverb as one flat channel so it can be ranked against
// eBay, Etsy and the rest. `ventures/reverb-fee-calculator` prices the same
// marketplace in depth — offers, bumps, Safe Shipping, consignment, returns.
// A seller who follows the "continue with these numbers" handoff sees both,
// one after the other, on the same item.
//
// If the two disagree about what Reverb charges, that seller watches their
// profit change for no reason they can see, on two pages from the same
// portfolio, and has no way to tell which one to believe. That is a
// credibility failure rather than a rounding difference, and it is the kind
// that gets found by a user rather than by a diff.
//
// The obvious fix — "just keep them in sync" — is the one this repository has
// already paid for twice (CLAUDE.md, "168 became 169": a rule copied out of
// `build.mjs` instead of imported went stale and cost live product). So this
// asserts the equality mechanically, by importing the other calculator's own
// defaults. If `reverb-fee-calculator` changes its fee assumptions, this test
// fails here rather than the two pages quietly drifting apart.
//
// It deliberately checks only the fields that describe *what Reverb charges*.
// Everything else in the preset — sell-through, days to sell, return rate — is
// this page's own illustrative assumption about shelf time, a question the
// dedicated calculator does not model at all, so there is nothing to agree
// with.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CHANNEL_PRESETS, calculateChannel } from './calc.mjs';
import { REVERB_DEFAULTS, calculateReverbSale } from '../reverb-fee-calculator/calc.mjs';
import { FEE_SCHEDULE_PRESETS, calculateOrder } from '../tiktok-shop-fee-calculator/calc.mjs';
import {
  CATEGORY_PRESETS,
  DEFAULT_PAYMENT_RATE,
  DEFAULT_PAYMENT_FIXED,
  calculateSale,
} from '../whatnot-seller-payout/calc.mjs';

const reverb = CHANNEL_PRESETS.find((preset) => preset.id === 'reverb');
const tiktok = CHANNEL_PRESETS.find((preset) => preset.id === 'tiktok');
const whatnot = CHANNEL_PRESETS.find((preset) => preset.id === 'whatnot');

test('this page still has a Reverb channel to compare', () => {
  // Guard the guard: if the preset is renamed or removed, every assertion
  // below would pass vacuously on `undefined?.x === undefined`.
  assert.ok(reverb, 'no channel with id "reverb" in CHANNEL_PRESETS');
});

test('the Reverb fee assumptions match the dedicated calculator exactly', () => {
  assert.equal(
    reverb.commissionRate,
    REVERB_DEFAULTS.marketplaceRate,
    'selling fee disagrees with reverb-fee-calculator',
  );
  assert.equal(
    reverb.commissionBase,
    'item',
    'Reverb selling fee must apply to the item price only, matching reverb-fee-calculator',
  );
  assert.equal(
    reverb.paymentRate,
    REVERB_DEFAULTS.paymentRate,
    'payment processing rate disagrees with reverb-fee-calculator',
  );
  assert.equal(
    reverb.paymentFixed,
    REVERB_DEFAULTS.paymentFixed,
    'fixed payment fee disagrees with reverb-fee-calculator',
  );
});

test('Reverb net profit matches the dedicated calculator on the shared worked example', () => {
  // Rate equality alone is not enough: before this assertion existed, both
  // tools quoted 5% and still disagreed by shippingCharged × 5% because this
  // page charged the selling fee on the order total. A seller who follows the
  // handoff watches profit change with no input change — the credibility
  // failure this file exists to prevent.
  const shared = {
    price: REVERB_DEFAULTS.price,
    shippingCharged: REVERB_DEFAULTS.shippingCharged,
    shippingCost: REVERB_DEFAULTS.shippingCost,
    itemCost: REVERB_DEFAULTS.itemCost,
    packagingCost: 0,
    otherCost: REVERB_DEFAULTS.otherCost,
    monthlyOrders: 1,
  };
  const here = calculateChannel({ ...reverb, enabled: true }, shared);
  const there = calculateReverbSale(REVERB_DEFAULTS);
  assert.equal(here.fees.commission, there.fees.marketplace, 'selling fee on the same item');
  assert.equal(here.fees.payment, there.fees.payment, 'processing fee on the same order');
  assert.equal(here.profit, there.profit, 'net profit must not jump across the handoff');
});

test('Reverb bills processing separately, unlike eBay', () => {
  // Not a style point. eBay's final value fee absorbs payment processing, so
  // its preset carries paymentRate 0 and folding a processor rate in there
  // would double-charge. Reverb bills the two separately. A future edit that
  // "tidies" these to look alike would silently change one of the answers, so
  // the difference is asserted rather than left to a comment.
  const ebay = CHANNEL_PRESETS.find((preset) => preset.id === 'ebay');
  assert.equal(ebay.paymentRate, 0, 'eBay: processing is inside the final value fee');
  assert.ok(reverb.paymentRate > 0, 'Reverb: processing is billed on top of the selling fee');
});

test('Reverb is off until the seller turns it on', () => {
  // It only applies to instruments and audio gear. On by default it would add
  // a channel most sellers cannot list on to every comparison, and a channel
  // that does not apply is noise in a ranking rather than information.
  assert.equal(reverb.enabled, false);
});

test('this page still has a TikTok Shop channel to compare', () => {
  assert.ok(tiktok, 'no channel with id "tiktok" in CHANNEL_PRESETS');
});

test('the TikTok Shop fee assumptions match the dedicated calculator\'s current US standard rate', () => {
  const standard = FEE_SCHEDULE_PRESETS.us_standard;
  assert.equal(
    tiktok.commissionRate,
    standard.referralRate,
    'referral rate disagrees with tiktok-shop-fee-calculator',
  );
  assert.equal(
    tiktok.paymentRate,
    standard.paymentRate,
    'payment processing rate disagrees with tiktok-shop-fee-calculator',
  );
  assert.equal(
    tiktok.paymentFixed,
    standard.paymentFixed,
    'fixed payment fee disagrees with tiktok-shop-fee-calculator',
  );
});

test('TikTok Shop net profit matches the dedicated calculator on the shared worked example', () => {
  // Same discipline as the Reverb check above: rate equality alone would not
  // have caught a base mismatch (order total vs. item price), so this asserts
  // the actual number, not just the rate.
  const shared = {
    price: 50,
    shippingCharged: 5,
    shippingCost: 4,
    itemCost: 15,
    packagingCost: 0,
    otherCost: 2,
    monthlyOrders: 1,
  };
  const here = calculateChannel({ ...tiktok, enabled: true }, shared);
  const there = calculateOrder({
    itemPrice: shared.price,
    shippingCharged: shared.shippingCharged,
    fulfillmentCost: shared.shippingCost,
    cogs: shared.itemCost,
    otherPerOrder: shared.otherCost,
    referralRate: tiktok.commissionRate,
    paymentRate: tiktok.paymentRate,
    paymentFixed: tiktok.paymentFixed,
  });
  assert.equal(here.fees.commission, there.referralFee, 'referral fee on the same order total');
  assert.equal(here.profit, there.keptProfit, 'net profit must not jump across the handoff');
});

test('TikTok Shop is off until the seller turns it on', () => {
  assert.equal(tiktok.enabled, false);
});

test('this page still has a Whatnot channel to compare', () => {
  assert.ok(whatnot, 'no channel with id "whatnot" in CHANNEL_PRESETS');
});

test('the Whatnot fee assumptions match the dedicated calculator\'s standard, uncapped category', () => {
  const standard = CATEGORY_PRESETS.standard;
  assert.equal(
    whatnot.commissionRate,
    standard.commissionRate,
    'commission rate disagrees with whatnot-seller-payout',
  );
  assert.equal(
    whatnot.commissionBase,
    'item',
    'Whatnot commission must apply to the hammer price only, matching whatnot-seller-payout',
  );
  assert.equal(
    whatnot.paymentRate,
    DEFAULT_PAYMENT_RATE,
    'payment processing rate disagrees with whatnot-seller-payout',
  );
  assert.equal(
    whatnot.paymentFixed,
    DEFAULT_PAYMENT_FIXED,
    'fixed payment fee disagrees with whatnot-seller-payout',
  );
});

test('Whatnot net profit matches the dedicated calculator on the shared worked example', () => {
  const shared = {
    price: 60,
    shippingCharged: 8,
    shippingCost: 5,
    itemCost: 20,
    packagingCost: 0,
    otherCost: 3,
    monthlyOrders: 1,
  };
  const here = calculateChannel({ ...whatnot, enabled: true }, shared);
  const there = calculateSale({
    salePrice: shared.price,
    shippingCharged: shared.shippingCharged,
    taxCharged: 0,
    shippingCost: shared.shippingCost,
    itemCost: shared.itemCost,
    otherCost: shared.otherCost,
    commissionRate: whatnot.commissionRate,
    commissionCap: '',
    paymentRate: whatnot.paymentRate,
    paymentFixed: whatnot.paymentFixed,
  });
  assert.equal(there.ok, true, JSON.stringify(there.errors ?? []));
  assert.equal(here.fees.commission, there.commission, 'commission on the same hammer price');
  assert.equal(here.profit, there.leftover, 'net profit must not jump across the handoff');
});

test('Whatnot bills processing on the full checkout total, unlike TikTok Shop', () => {
  // Not a style point. TikTok Shop's referral fee already bundles processing
  // (paymentRate 0, matching eBay's shape). Whatnot bills the two separately,
  // the same shape as Reverb. A future edit that "tidies" these to look alike
  // would silently change one of the answers, so the difference is asserted.
  assert.equal(tiktok.paymentRate, 0, 'TikTok Shop: processing is inside the referral fee');
  assert.ok(whatnot.paymentRate > 0, 'Whatnot: processing is billed on top of the commission');
});

test('Whatnot is off until the seller turns it on', () => {
  assert.equal(whatnot.enabled, false);
});

test('a channel that is off by default says so in its note', () => {
  // The checkbox is inside a collapsed <details>, so a reader who does not
  // expand the row would otherwise have no way to know the channel exists but
  // is not in the ranking they are looking at.
  for (const preset of CHANNEL_PRESETS) {
    if (preset.enabled === false) {
      assert.match(
        preset.note,
        /off by default|switched off by default/i,
        `${preset.id} is off by default but its note does not say so`,
      );
    }
  }
});
