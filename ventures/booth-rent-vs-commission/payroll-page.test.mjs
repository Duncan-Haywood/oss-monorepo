// The payroll-tax section is only worth anything if it reaches the page. These
// tests pin the wiring rather than the arithmetic (`calc.test.mjs` owns that):
// every field the calculator reads exists in the markup, every output it
// writes has somewhere to land, and the tax inputs travel in the share link
// like the rest of the book.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareCompensation } from './calc.mjs';
import { DEFAULT_SOCIAL_SECURITY_WAGE_BASE } from './payroll.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

const defaults = {
  averageTicket: 85,
  clientsPerWeek: 14,
  retailPerWeek: 80,
  weeksWorkedPerYear: 50,
  averageServiceMinutes: 75,
  commissionPercent: 50,
  retailCommissionPercent: 10,
  unpaidHoursCommission: 2,
  boothRentAmount: 275,
  boothRentCadence: 'weekly',
  cardFeePercent: 2.9,
  backbarPercent: 10,
  retailCostPercent: 50,
  otherWeeklyCost: 20,
  unpaidHoursBooth: 7,
};

test('the tax inputs exist, default to the documented values, and are shared', () => {
  assert.match(index, /id="marginalIncomeTaxPercent"/);
  assert.match(index, /id="socialSecurityWageBase"/);

  // The wage-base default in the markup must be the one calc.mjs falls back
  // to, or a user who never touches the field gets a different answer from
  // one who retypes the number already shown to them.
  const shown = index.match(/id="socialSecurityWageBase"[^>]*value="(\d+)"/);
  assert.ok(shown, 'the wage base input carries a default value');
  assert.equal(Number(shown[1]), DEFAULT_SOCIAL_SECURITY_WAGE_BASE);

  // Both ride the share link with everything else, so a stylist sending the
  // comparison to a friend sends the assumptions behind it too.
  const fieldBlock = index.match(/const FIELD_IDS = \[([\s\S]*?)\];/);
  assert.ok(fieldBlock);
  assert.match(fieldBlock[1], /'marginalIncomeTaxPercent'/);
  assert.match(fieldBlock[1], /'socialSecurityWageBase'/);
});

test('every after-tax output the script writes has an element to write into', () => {
  const ids = [
    'taxCommMonthly', 'taxBoothMonthly', 'taxMonthlyDiff', 'taxBoothSe',
    'taxCommFica', 'taxWedge', 'taxBreakEven', 'taxMaxRent', 'taxFlip',
  ];
  for (const id of ids) {
    assert.ok(index.includes(`id="${id}"`), `${id} is missing from the markup`);
    assert.ok(index.includes(`el('${id}')`), `${id} is never written to`);
  }

  // And a bad input has to blank them: a stale after-tax figure sitting under
  // an error message reads as a current answer.
  const clear = index.match(/function clearOutputs\([\s\S]*?\n    \}/);
  assert.ok(clear);
  for (const id of ids.filter((i) => i !== 'taxFlip')) {
    assert.ok(clear[0].includes(`'${id}'`), `${id} survives an input error`);
  }
  assert.ok(clear[0].includes("el('taxFlip')"));
});

test('the page explains what is and is not in the tax figure', () => {
  // The two claims a user has to be able to check: which tax this models, and
  // which one it deliberately does not. Getting the second wrong would make
  // the after-tax number look like a take-home estimate.
  assert.match(index, /self-employed/i);
  assert.match(index, /Income tax(?: itself)? is not (?:modelled|included)/i);
  assert.match(index, /wage base/i);
});

test('the copied summary carries the after-tax comparison, not just the pre-tax one', () => {
  const summary = index.match(/function summaryText\(result\) \{[\s\S]*?\n    \}/);
  assert.ok(summary);
  assert.match(summary[0], /AFTER PAYROLL TAX/);
  assert.match(summary[0], /afterTax\.commission\.monthlyTakeHome/);
  assert.match(summary[0], /afterTax\.booth\.monthlyTakeHome/);
  assert.match(summary[0], /afterTax\.boothDetail\.total/);
});

test('the defaults shown on the page still produce a booth win after tax', () => {
  // Guards the copy in the FAQ and the docs page: if a future default change
  // made the shipped example flip, the page would be arguing against its own
  // numbers.
  const result = compareCompensation({ ...defaults });
  assert.equal(result.dollarWinner, 'booth');
  assert.equal(result.afterTax.winner, 'booth');
  assert.ok(result.afterTax.wedgeWeekly > 0);
});

// Closest sibling: same "price the gig, not just the sticker" shape for an
// independent operator, but a one-off event booking rather than an ongoing
// chair. Without a crawlable link here, a crawler entering on the booth rent
// comparison never reaches the photo booth quote calculator in one hop.
test('index links one hop to the photo-booth-event-quote sibling', () => {
  assert.match(
    index,
    /href="\.\.\/photo-booth-event-quote\/"/,
    'index must link ../photo-booth-event-quote/ so crawlers reach the photo booth quote calculator in one hop',
  );
});
