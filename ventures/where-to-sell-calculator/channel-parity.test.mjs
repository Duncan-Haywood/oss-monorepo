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

import { CHANNEL_PRESETS } from './calc.mjs';
import { REVERB_DEFAULTS } from '../reverb-fee-calculator/calc.mjs';

const reverb = CHANNEL_PRESETS.find((preset) => preset.id === 'reverb');

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
