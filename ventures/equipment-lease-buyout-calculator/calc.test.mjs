import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareBuyout,
  verdictMessage,
  verdictNotes,
  formatMoney,
  formatPercent,
} from './calc.mjs';

// The worked example on index.html: a used forklift, buyout cheaper than replacing.
const EXAMPLE = {
  buyoutPrice: 8000,
  fairMarketValue: 6000,
  usefulLifeMonths: 24,
  replacementCost: 22000,
  replacementLifeMonths: 60,
  removalCost: 500,
  downtimeDays: 2,
  dailyDowntimeCost: 300,
};

const near = (actual, expected, tolerance = 0.01) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );

test('per-month cost is the price spread over the useful-life estimate, on both sides', () => {
  const result = compareBuyout(EXAMPLE);
  near(result.costPerMonthBuyout, 8000 / 24);
  near(result.downtimeCost, 600);
  near(result.totalReplacementCost, 23100);
  near(result.costPerMonthReplace, 23100 / 60);
});

test('buyout wins when its per-month cost is at or below replacement per-month cost', () => {
  const result = compareBuyout(EXAMPLE);
  assert.equal(result.buyoutWins, true);
  near(result.monthlySavings, 23100 / 60 - 8000 / 24);
  near(result.totalSavingsOverUsefulLife, (23100 / 60 - 8000 / 24) * 24);
});

test('the break-even buyout price is the replacement per-month cost spread back over the useful life', () => {
  const result = compareBuyout(EXAMPLE);
  near(result.breakEvenBuyoutPrice, (23100 / 60) * 24);
  // The example buyout is below break-even, which is exactly why it wins.
  assert.ok(result.buyoutPrice < result.breakEvenBuyoutPrice);
});

test('premium over fair market value is signed: positive means the buyout is priced above FMV', () => {
  const result = compareBuyout(EXAMPLE);
  near(result.premiumOverFairMarketValue, 2000);
  near(result.premiumOverFairMarketValuePercent, (2000 / 6000) * 100);

  const belowFmv = compareBuyout({ ...EXAMPLE, buyoutPrice: 5000 });
  near(belowFmv.premiumOverFairMarketValue, -1000);
  assert.ok(belowFmv.premiumOverFairMarketValue < 0);
});

test('a fair market value of zero reports no percent rather than dividing by zero', () => {
  const result = compareBuyout({ ...EXAMPLE, fairMarketValue: 0 });
  assert.equal(result.premiumOverFairMarketValuePercent, null);
});

test('flipping the example so replacing is cheaper flips the verdict', () => {
  const result = compareBuyout({ ...EXAMPLE, buyoutPrice: 20000, usefulLifeMonths: 12 });
  assert.equal(result.buyoutWins, false);
  assert.ok(result.monthlySavings < 0);
  assert.ok(result.totalSavingsOverUsefulLife < 0);
});

test('downtime cost is days times daily cost, and folds into the replacement side only', () => {
  const withDowntime = compareBuyout(EXAMPLE);
  const withoutDowntime = compareBuyout({ ...EXAMPLE, downtimeDays: 0, dailyDowntimeCost: 0 });
  near(withDowntime.downtimeCost, 600);
  near(withoutDowntime.downtimeCost, 0);
  near(withDowntime.costPerMonthBuyout, withoutDowntime.costPerMonthBuyout);
  assert.ok(withDowntime.costPerMonthReplace > withoutDowntime.costPerMonthReplace);
});

test('every numeric input is validated and rejects blank, non-numeric, and out-of-range values', () => {
  assert.throws(() => compareBuyout({ ...EXAMPLE, buyoutPrice: '' }), /buyout price/);
  assert.throws(() => compareBuyout({ ...EXAMPLE, buyoutPrice: 'abc' }), /must be a number/);
  assert.throws(() => compareBuyout({ ...EXAMPLE, usefulLifeMonths: 0 }), /cannot be below/);
  assert.throws(() => compareBuyout({ ...EXAMPLE, replacementLifeMonths: -1 }), /cannot be below/);
});

test('removalCost, downtimeDays, and dailyDowntimeCost default to zero when omitted', () => {
  const { removalCost, downtimeDays, dailyDowntimeCost, downtimeCost, ...rest } = EXAMPLE;
  const result = compareBuyout(rest);
  assert.equal(result.removalCost, 0);
  assert.equal(result.downtimeDays, 0);
  assert.equal(result.dailyDowntimeCost, 0);
  assert.equal(result.downtimeCost, 0);
});

test('verdictMessage names the cheaper path and the per-month figures on both sides', () => {
  const win = verdictMessage(compareBuyout(EXAMPLE));
  assert.match(win, /Buying out is the cheaper path/);
  assert.match(win, /\$333\.33/);

  const lose = verdictMessage(compareBuyout({ ...EXAMPLE, buyoutPrice: 20000, usefulLifeMonths: 12 }));
  assert.match(lose, /Returning it is the cheaper path/);
});

test('verdictNotes always states the break-even buyout price', () => {
  const notes = verdictNotes(compareBuyout(EXAMPLE));
  assert.ok(notes.some(note => note.includes('break-even') || note.includes(formatMoney(9240))));
});

test('verdictNotes flags a buyout priced above fair market value', () => {
  const notes = verdictNotes(compareBuyout(EXAMPLE));
  assert.ok(notes.some(note => note.includes('above the fair market value')));
});

test('verdictNotes flags an unentered removal cost as a likely gap, not a true zero', () => {
  const notes = verdictNotes(compareBuyout({ ...EXAMPLE, removalCost: 0 }));
  assert.ok(notes.some(note => note.includes('No removal or return cost was entered')));
});

test('formatMoney and formatPercent handle non-finite input without throwing', () => {
  assert.equal(formatMoney(NaN), '—');
  assert.equal(formatPercent(undefined), '—');
  assert.equal(formatMoney(1234.5), '$1,234.50');
  assert.equal(formatPercent(33.333, 1), '33.3%');
});
