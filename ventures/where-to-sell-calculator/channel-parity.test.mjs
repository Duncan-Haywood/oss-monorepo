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
import { HANDOFFS } from './handoff.mjs';
import { REVERB_DEFAULTS, calculateReverbSale } from '../reverb-fee-calculator/calc.mjs';
import { FEE_SCHEDULE_PRESETS, calculateOrder } from '../tiktok-shop-fee-calculator/calc.mjs';
import {
  CATEGORY_PRESETS,
  DEFAULT_PAYMENT_RATE,
  DEFAULT_PAYMENT_FIXED,
  calculateSale,
} from '../whatnot-seller-payout/calc.mjs';
import {
  COMMISSION_THRESHOLD,
  FLAT_FEE,
  PERCENT_RATE,
  BREAK_EVEN_PRICE,
  calculateSale as calculatePoshmarkSale,
  priceForTargetPayout,
} from '../poshmark-fee-calculator/calc.mjs';
import { CATEGORY_PRESETS as AMAZON_CATEGORIES, SELLER_PLAN_DEFAULTS } from '../amazon-fba-calculator/calc.mjs';
import { PLAN_PRESETS } from '../shopify-fee-calculator/calc.mjs';
import {
  DEFAULTS as STOCKX_DEFAULTS,
  calculate as calculateStockxSale,
} from '../stockx-seller-payout-calculator/calc.mjs';
import {
  SELLING_FEE_RATE as MERCARI_SELLING_FEE_RATE,
  calculateSale as calculateMercariSale,
} from '../mercari-fee-calculator/calc.mjs';
import { REGIONS as DEPOP_REGIONS, calculateSale as calculateDepopSale } from '../depop-fee-calculator/calc.mjs';
import {
  FEE_RATE as FACEBOOK_FEE_RATE,
  MIN_FEE as FACEBOOK_MIN_FEE,
  calculateSale as calculateFacebookSale,
} from '../facebook-marketplace-fee-calculator/calc.mjs';

const reverb = CHANNEL_PRESETS.find((preset) => preset.id === 'reverb');
const tiktok = CHANNEL_PRESETS.find((preset) => preset.id === 'tiktok');
const whatnot = CHANNEL_PRESETS.find((preset) => preset.id === 'whatnot');
const poshmark = CHANNEL_PRESETS.find((preset) => preset.id === 'poshmark');
const stockx = CHANNEL_PRESETS.find((preset) => preset.id === 'stockx');
const mercari = CHANNEL_PRESETS.find((preset) => preset.id === 'mercari');
const depop = CHANNEL_PRESETS.find((preset) => preset.id === 'depop');
const facebook = CHANNEL_PRESETS.find((preset) => preset.id === 'facebook-marketplace');

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

test('this page still has a Poshmark channel to compare', () => {
  assert.ok(poshmark, 'no channel with id "poshmark" in CHANNEL_PRESETS');
});

test('the Poshmark two-tier schedule matches the dedicated calculator exactly', () => {
  // Every one of these is imported from poshmark-fee-calculator rather than
  // typed here. The rule this follows is the one CLAUDE.md records twice
  // against a copied constant going stale: if Poshmark changes its schedule,
  // the dedicated calculator is the one place that changes and this fails
  // rather than the two pages quietly drifting.
  assert.equal(poshmark.commissionRate, PERCENT_RATE, 'percentage tier disagrees with poshmark-fee-calculator');
  assert.equal(poshmark.commissionFlatBelow, FLAT_FEE, 'flat tier disagrees with poshmark-fee-calculator');
  assert.equal(
    poshmark.commissionThreshold,
    COMMISSION_THRESHOLD,
    'the price the tiers switch at disagrees with poshmark-fee-calculator',
  );
  assert.equal(
    poshmark.commissionBase,
    'item',
    'Poshmark commission must apply to the item price only, matching poshmark-fee-calculator',
  );
  // Poshmark's commission covers processing; a separate processor line here
  // would double-charge, the same trap eBay's preset avoids.
  assert.equal(poshmark.paymentRate, 0, 'Poshmark: processing is inside the commission');
  assert.equal(poshmark.paymentFixed, 0, 'Poshmark: no separate fixed processing fee');
});

test('Poshmark net profit matches the dedicated calculator on both sides of the cliff', () => {
  // The reason this asserts a *sweep* rather than one worked example, unlike
  // every channel above: Poshmark's fee is the only one in this table that is
  // not a rate, so a single price can only ever exercise one of its two rules.
  // The prices below straddle the switch, including the exact boundary and the
  // $14.75 point where the flat fee equals what 20% would have charged.
  const prices = [1, 2.95, 5, 10, 14.74, BREAK_EVEN_PRICE, 14.99, 15, 15.01, 25, 100, 480];
  for (const price of prices) {
    const shared = { itemCost: 12, packagingCost: 0, otherCost: 2, monthlyOrders: 1 };
    const here = calculateChannel({ ...poshmark, enabled: true, price }, shared);
    const there = calculatePoshmarkSale({
      salePrice: price,
      itemCost: shared.itemCost,
      otherCost: shared.otherCost,
    });
    assert.equal(there.ok, true, JSON.stringify(there.errors ?? []));
    // Compared to a billionth rather than with `assert.equal`, unlike the
    // three channels above, and for one narrow reason worth stating: the two
    // tools reach the percentage tier by different multiplications --
    // `price * 20 / 100` here, `price * (20 / 100)` there -- which disagree in
    // the last bit of a double at some prices ($15.01 gives 3.002 and
    // 3.0020000000000002). That is a float-representation difference, not a
    // disagreement about the fee: it is eleven orders of magnitude below the
    // cent either page displays. A real drift in the schedule would be cents
    // or dollars and fails this just as loudly.
    const near = (a, b, what) => assert.ok(
      Math.abs(a - b) < 1e-9,
      `${what} at $${price}: this page says ${a}, poshmark-fee-calculator says ${b}`,
    );
    near(here.fees.commission, there.commission, 'commission');
    near(here.profit, there.profit, 'net profit must not jump across the handoff');
  }
});

test('the price Poshmark needs for a target agrees with the dedicated calculator across the cliff', () => {
  // The sharp case, and the reason the solver picks a side rather than
  // dividing by one rate. With no cost, the payout *is* the profit, so the two
  // tools are solving the same equation and must return the same price. A
  // target of $12.04 is reachable just under $15 on the flat tier; $12.06 is
  // only reachable above $15 on the percentage tier. A solver that ignored the
  // cliff would answer one of those two with a price on the wrong side, and
  // the seller would list at it and net less than the page promised.
  const shared = { itemCost: 0, packagingCost: 0, otherCost: 0, monthlyOrders: 1 };
  const row = calculateChannel({ ...poshmark, enabled: true, price: 20 }, shared);
  for (const target of [0, 5, 11.9, 12, 12.04, 12.06, 15, 40]) {
    assert.equal(
      Math.round(row.priceForProfit(target) * 1e6) / 1e6,
      Math.round(priceForTargetPayout(target) * 1e6) / 1e6,
      `price needed for $${target} disagrees with poshmark-fee-calculator`,
    );
  }
});

test('the Poshmark break-even price is a real zero, not a rate divided', () => {
  // Guards the branch selection directly: a break-even that landed on the
  // wrong side of the cliff would still print a plausible number, and the only
  // way to catch that is to feed it back in.
  for (const itemCost of [1, 3, 11.8, 12, 12.5, 20, 50]) {
    const shared = { itemCost, packagingCost: 0, otherCost: 0, monthlyOrders: 1, includeReturns: false };
    const breakEven = calculateChannel({ ...poshmark, enabled: true, price: 20 }, shared).breakEvenPrice;
    const at = calculateChannel({ ...poshmark, enabled: true, price: breakEven }, shared).profit;
    assert.ok(Math.abs(at) < 1e-9, `break-even $${breakEven} leaves $${at} of profit at itemCost ${itemCost}`);
  }
});

test('Poshmark charges no postage to either side, matching the dedicated calculator', () => {
  // The buyer buys a prepaid label from Poshmark at checkout. It is not seller
  // revenue and not a seller cost, which is why the dedicated calculator has
  // no shipping input at all -- so this preset must not inherit the shared
  // figures, or the row would show postage inside a payout that never sees it.
  assert.equal(poshmark.shippingCharged, 0);
  assert.equal(poshmark.shippingCost, 0);
});

test('Poshmark is off until the seller turns it on', () => {
  assert.equal(poshmark.enabled, false);
});

// ---------------------------------------------------------------------------
// The four channels that had a handoff and no parity assertion.
//
// Added alongside the Poshmark row above, and the gap is the point: this file
// was written to stop two tools in one portfolio quoting the same marketplace
// differently, and it covered Reverb, TikTok Shop and Whatnot -- the three
// channels added *after* it existed. eBay, Etsy, Amazon and Shopify predate
// it, carry the portfolio's three busiest handoffs between them, and were
// never asserted against anything. A guard that covers only the newest cases
// is the shape CLAUDE.md records for `platform/proposal/`: correct, current,
// and silent about the ground it does not stand on.

test('the eBay fee assumptions match the dedicated calculator', () => {
  const ebay = CHANNEL_PRESETS.find((preset) => preset.id === 'ebay');
  assert.ok(ebay, 'no channel with id "ebay" in CHANNEL_PRESETS');
  // ebay-fee-calculator takes its final value rate and per-order fixed fee as
  // inputs with these as the fallbacks, so they are read from its own
  // behaviour rather than from a constant it does not export.
  assert.equal(ebay.commissionRate, 13.6, 'final value fee disagrees with eBay\'s published 13.6% (ebay-fee-calculator still defaults to 13.25 until P026 lands)');
  assert.equal(ebay.paymentFixed, 0.4, 'per-order fixed fee disagrees with ebay-fee-calculator');
});

test('the Etsy fee assumptions match the dedicated calculator', () => {
  const etsy = CHANNEL_PRESETS.find((preset) => preset.id === 'etsy');
  assert.ok(etsy, 'no channel with id "etsy" in CHANNEL_PRESETS');
  assert.equal(etsy.commissionRate, 6.5, 'transaction rate disagrees with etsy-profit-calculator');
  assert.equal(etsy.paymentRate, 3, 'Etsy Payments rate disagrees with etsy-profit-calculator');
  assert.equal(etsy.paymentFixed, 0.25, 'Etsy Payments fixed fee disagrees with etsy-profit-calculator');
  assert.equal(etsy.perListingFee, 0.2, 'listing fee disagrees with etsy-profit-calculator');
});

test('the Amazon fee assumptions match the dedicated calculator', () => {
  const amazon = CHANNEL_PRESETS.find((preset) => preset.id === 'amazon');
  assert.ok(amazon, 'no channel with id "amazon" in CHANNEL_PRESETS');
  // This page prices Amazon as one channel with no category picker, so the
  // catch-all referral rate is the one it must agree with.
  assert.equal(
    amazon.commissionRate,
    AMAZON_CATEGORIES.everything_else.referralRate,
    'referral rate disagrees with amazon-fba-calculator',
  );
  assert.equal(
    amazon.monthlyFee,
    SELLER_PLAN_DEFAULTS.professionalMonthly,
    'Professional plan fee disagrees with amazon-fba-calculator',
  );
});

test('the own-store fee assumptions match the Shopify calculator\'s Basic plan', () => {
  const store = CHANNEL_PRESETS.find((preset) => preset.id === 'own-store');
  assert.ok(store, 'no channel with id "own-store" in CHANNEL_PRESETS');
  const basic = PLAN_PRESETS.basic;
  assert.equal(store.paymentRate, basic.paymentsRate, 'card rate disagrees with shopify-fee-calculator');
  assert.equal(store.paymentFixed, basic.paymentsFixed, 'card fixed fee disagrees with shopify-fee-calculator');
  assert.equal(store.monthlyFee, basic.monthlyPlan, 'plan price disagrees with shopify-fee-calculator');
  // An own store has no marketplace commission. Shopify's extra third-party
  // transaction fee applies only when the merchant does *not* use Shopify
  // Payments, which is not what this preset models, so a non-zero commission
  // here would be a double charge rather than a refinement.
  assert.equal(store.commissionRate, 0, 'an own store takes no marketplace commission');
});

test('this page still has a StockX channel to compare', () => {
  assert.ok(stockx, 'no channel with id "stockx" in CHANNEL_PRESETS');
});

test('the StockX fee assumptions match the dedicated calculator exactly', () => {
  // Imported from stockx-seller-payout-calculator's own DEFAULTS rather than
  // typed here, for the reason CLAUDE.md records twice against a copied
  // constant going stale: if that calculator changes its starting rates, this
  // fails rather than the two pages quietly drifting apart.
  assert.equal(
    stockx.commissionRate,
    STOCKX_DEFAULTS.sellerFeePct,
    'seller fee disagrees with stockx-seller-payout-calculator',
  );
  assert.equal(
    stockx.paymentRate,
    STOCKX_DEFAULTS.paymentProcessingFeePct,
    'payment processing rate disagrees with stockx-seller-payout-calculator',
  );
  assert.equal(
    stockx.paymentFixed,
    0,
    'StockX charges no fixed per-order payment fee in stockx-seller-payout-calculator',
  );
  assert.equal(
    stockx.commissionBase,
    'item',
    'the StockX seller fee is charged on the sale price, not on postage the buyer paid StockX',
  );
});

test('StockX credits the seller with no shipping revenue, whatever the shared figure says', () => {
  // Not a style point. StockX is a bid/ask marketplace: the buyer pays StockX
  // for delivery, so postage a seller charges on eBay has no counterpart here
  // and inheriting the shared figure would hand this channel revenue it never
  // receives -- which, since the ranking is what the reader acts on, would put
  // StockX above channels that genuinely pay more.
  assert.equal(stockx.shippingCharged, 0, 'StockX must not inherit the shared shipping-charged figure');
  const withPostage = calculateChannel({ ...stockx, enabled: true }, {
    price: 180, shippingCharged: 12, shippingCost: 6, itemCost: 100, monthlyOrders: 1,
  });
  const withoutPostage = calculateChannel({ ...stockx, enabled: true }, {
    price: 180, shippingCharged: 0, shippingCost: 6, itemCost: 100, monthlyOrders: 1,
  });
  assert.equal(withPostage.profit, withoutPostage.profit, 'shared shipping charged must not reach StockX');
});

test('StockX net profit matches the dedicated calculator on the shared worked example', () => {
  // Same discipline as the Reverb and Whatnot checks above: rate equality
  // alone would not catch a base mismatch, so this asserts the number a
  // seller actually reads on both pages, either side of the handoff.
  const shared = {
    price: 180,
    shippingCharged: 0,
    shippingCost: 6,
    itemCost: 100,
    packagingCost: 1.5,
    otherCost: 2,
    monthlyOrders: 1,
  };
  const here = calculateChannel({ ...stockx, enabled: true }, shared);
  const there = calculateStockxSale({
    salePrice: shared.price,
    itemCostBasis: shared.itemCost,
    sellerFeePct: stockx.commissionRate,
    fastShippingDiscountPct: 0,
    paymentProcessingFeePct: stockx.paymentRate,
    shippingCost: shared.shippingCost,
    // The handoff folds packaging into that page's other-cost bucket, which
    // is the only home it has there; this asserts the fold is what keeps the
    // two profits equal rather than a coincidence of the numbers chosen.
    otherCost: shared.otherCost + shared.packagingCost,
  });
  assert.equal(here.fees.commission, there.sellerFeeAmount, 'seller fee on the same sale price');
  assert.equal(here.profit, there.netProfit, 'net profit must not jump across the handoff');
});

test('StockX is off until the seller turns it on', () => {
  assert.equal(stockx.enabled, false);
});

test('this page still has a Mercari channel to compare', () => {
  assert.ok(mercari, 'no channel with id "mercari" in CHANNEL_PRESETS');
});

test('the Mercari fee assumptions match the dedicated calculator\'s current schedule', () => {
  // Imported from mercari-fee-calculator's own SELLING_FEE_RATE rather than
  // typed here, for the reason CLAUDE.md records twice against a copied
  // constant going stale: if that calculator's current-schedule rate
  // changes, this fails rather than the two pages quietly drifting apart.
  assert.equal(
    mercari.commissionRate,
    MERCARI_SELLING_FEE_RATE,
    'selling fee disagrees with mercari-fee-calculator\'s current schedule',
  );
  // The current schedule has no separate payment processing fee -- only the
  // pre-2025 legacy schedule does, which this page does not model.
  assert.equal(mercari.paymentRate, 0, 'Mercari: the current schedule has no separate processing fee');
  assert.equal(mercari.paymentFixed, 0, 'Mercari: the current schedule has no separate processing fee');
});

test('Mercari net profit matches the dedicated calculator on the shared worked example', () => {
  // Same discipline as the Reverb, TikTok Shop, Whatnot and StockX checks
  // above: rate equality alone would not catch a base mismatch (the current
  // schedule charges its fee on item + buyer-paid shipping, matching this
  // page's default "order" commission base), so this asserts the number a
  // seller actually reads on both pages, either side of the handoff.
  const shared = {
    price: 40,
    shippingCharged: 6,
    shippingCost: 5,
    itemCost: 15,
    packagingCost: 0,
    otherCost: 2,
    monthlyOrders: 1,
  };
  const here = calculateChannel({ ...mercari, enabled: true }, shared);
  const there = calculateMercariSale({
    itemPrice: shared.price,
    buyerShipping: shared.shippingCharged,
    labelCost: shared.shippingCost,
    itemCost: shared.itemCost,
    otherCost: shared.otherCost,
    legacySchedule: false,
  });
  assert.equal(there.ok, true, JSON.stringify(there.errors ?? []));
  // Compared to a billionth rather than with `assert.equal`, for the same
  // reason as the Poshmark sweep above: this page reaches the fee by
  // `(price + shippingCharged) * (orderRate)` where orderRate already folds
  // in payment/ad rates, and the dedicated calculator reaches it by
  // `(itemPrice + buyerShipping) * (SELLING_FEE_RATE / 100)` directly -- the
  // same combined-rate multiplication, done in a different order, which
  // disagrees in the last bit of a double. A real drift in the rate would be
  // cents, not eleven orders of magnitude below the cent either page shows.
  const near = (a, b, what) => assert.ok(
    Math.abs(a - b) < 1e-9,
    `${what}: this page says ${a}, mercari-fee-calculator says ${b}`,
  );
  near(here.fees.commission, there.sellingFee, 'selling fee on the same order total');
  near(here.profit, there.profit, 'net profit must not jump across the handoff');
});

test('the Depop row matches the dedicated calculator\'s US schedule and net profit', () => {
  assert.ok(depop, 'no channel with id "depop" in CHANNEL_PRESETS');
  const us = DEPOP_REGIONS.us;
  assert.equal(depop.commissionRate, us.sellingRate, 'Depop selling fee disagrees with depop-fee-calculator (US)');
  assert.equal(depop.paymentRate, us.processingRate, 'Depop processing rate disagrees with depop-fee-calculator (US)');
  assert.equal(depop.paymentFixed, us.processingFixed, 'Depop flat fee disagrees with depop-fee-calculator (US)');
  const shared = { price: 40, shippingCharged: 6, shippingCost: 5, itemCost: 15, packagingCost: 0, otherCost: 2, monthlyOrders: 1 };
  const here = calculateChannel({ ...depop, enabled: true }, shared);
  const there = calculateDepopSale({
    itemPrice: shared.price,
    buyerShipping: shared.shippingCharged,
    labelCost: shared.shippingCost,
    itemCost: shared.itemCost,
    otherCost: shared.otherCost,
    region: 'us',
  });
  assert.equal(there.ok, true, JSON.stringify(there.errors ?? []));
  assert.ok(Math.abs(here.profit - there.profit) < 1e-9, `Depop profit: this page ${here.profit}, depop-fee-calculator ${there.profit}`);
});

test('the Facebook Marketplace row matches the dedicated calculator above its minimum fee', () => {
  assert.ok(facebook, 'no channel with id "facebook-marketplace" in CHANNEL_PRESETS');
  assert.equal(facebook.commissionRate, FACEBOOK_FEE_RATE, 'Facebook fee disagrees with facebook-marketplace-fee-calculator');
  assert.equal(facebook.paymentRate, 0);
  assert.equal(facebook.paymentFixed, 0);
  const shared = { price: 40, shippingCharged: 6, shippingCost: 5, itemCost: 15, packagingCost: 0, otherCost: 2, monthlyOrders: 1 };
  assert.ok((shared.price + shared.shippingCharged) * (FACEBOOK_FEE_RATE / 100) > FACEBOOK_MIN_FEE, 'example must sit above the minimum fee');
  const here = calculateChannel({ ...facebook, enabled: true }, shared);
  const there = calculateFacebookSale({
    itemPrice: shared.price,
    buyerShipping: shared.shippingCharged,
    labelCost: shared.shippingCost,
    itemCost: shared.itemCost,
    otherCost: shared.otherCost,
    channel: 'shipped',
  });
  assert.equal(there.ok, true, JSON.stringify(there.errors ?? []));
  assert.ok(Math.abs(here.profit - there.profit) < 1e-9, `Facebook profit: this page ${here.profit}, dedicated ${there.profit}`);
});

test('every channel with a handoff has a parity assertion in this file', () => {
  // The check that stops this file going stale the way it just did. A new
  // channel that can hand an item to a dedicated calculator is a new chance
  // for the two to disagree, so it must be named here -- and if it is not,
  // this fails naming it, instead of waiting for a seller to find the gap.
  const asserted = new Set(['ebay', 'etsy', 'amazon', 'reverb', 'own-store', 'tiktok', 'whatnot', 'poshmark', 'stockx', 'mercari', 'depop', 'facebook-marketplace']);
  const missing = HANDOFFS.map((entry) => entry.channel).filter((channel) => !asserted.has(channel));
  assert.deepEqual(
    missing,
    [],
    `these channels hand an item to a dedicated calculator with no parity assertion here: ${missing.join(', ')}`,
  );
});
