import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateQuote, priceAt, compareServiceCallVsReplace, serviceCallVsReplaceNote } from './calc.mjs';

const input = { diagnosticHours: 0.5, repairHours: 1.5, travelHours: 0.5, laborRate: 80, tripCost: 35, partsCost: 120, partsMarkup: 25, callbackReserve: 5, overheadRate: 10, targetMargin: 30 };
const replaceDefault = {
  replacementPrice: 799,
  remainingRepairYears: 3,
  remainingReplaceYears: 10,
  diagnosticCollected: 75,
  yourReplaceProfit: 0,
};

function close(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} != ${expected}`);
}

test('separates loaded labor, marked-up parts, reserve, and target margin', () => {
  const result = calculateQuote(input);
  assert.equal(result.laborHours, 2.5);
  assert.equal(result.labor, 200);
  assert.equal(result.parts, 150);
  assert.equal(result.cost, 444.675);
  assert.equal(result.target, 635.25);
});

test('price sensitivity reports loss below walk-away floor', () => {
  const result = priceAt(input, 400);
  assert.ok(Math.abs(result.profit + 44.675) < 1e-9);
  assert.ok(result.margin < 0);
});

test('rejects negative assumptions', () => {
  assert.throws(() => calculateQuote({ ...input, partsCost: -1 }), /partsCost/);
});

test('default dryer repair costs the customer more per year than a $799 replacement', () => {
  const comparison = compareServiceCallVsReplace(input, replaceDefault);
  close(comparison.quote.target, 635.25, 'target');
  close(comparison.customerRepairPerYear, 635.25 / 3, 'repair $/year');
  close(comparison.customerReplacePerYear, 79.9, 'replace $/year');
  assert.equal(comparison.customerBetter, 'replace');
  close(comparison.yourProfitIfRepair, 635.25 - 444.675, 'repair profit');
  close(comparison.yourProfitIfReplace, 75, 'walk profit');
  assert.equal(comparison.youKeepMore, 'repair');
  assert.equal(comparison.agree, false);
  close(comparison.repairYearsToMatchReplace, 635.25 / 79.9, 'years to match');
});

test('eight remaining years on the repaired unit flips the customer back to repair', () => {
  const comparison = compareServiceCallVsReplace(input, { ...replaceDefault, remainingRepairYears: 8 });
  assert.ok(comparison.customerRepairPerYear < comparison.customerReplacePerYear);
  assert.equal(comparison.customerBetter, 'repair');
  assert.equal(comparison.youKeepMore, 'repair');
  assert.equal(comparison.agree, true);
  assert.match(serviceCallVsReplaceNote(comparison), /repair still beats replace for both/i);
});

test('selling the replacement for $150 flips your book to replace', () => {
  const comparison = compareServiceCallVsReplace(input, { ...replaceDefault, yourReplaceProfit: 150 });
  close(comparison.yourProfitIfReplace, 225, 'diagnostic plus replace profit');
  assert.equal(comparison.youKeepMore, 'replace');
  assert.equal(comparison.customerBetter, 'replace');
  assert.equal(comparison.agree, true);
  assert.match(serviceCallVsReplaceNote(comparison), /Recommend replace/i);
});

test('tension note names the customer-vs-book split', () => {
  const comparison = compareServiceCallVsReplace(input, replaceDefault);
  const note = serviceCallVsReplaceNote(comparison);
  assert.match(note, /Replace is \$131\.85 \/ year cheaper/);
  assert.match(note, /Finishing the repair still leaves you \$115\.57 more/);
  assert.match(note, /honest tension/i);
});

test('rejects zero remaining years and a missing comparison', () => {
  assert.throws(
    () => compareServiceCallVsReplace(input, { ...replaceDefault, remainingRepairYears: 0 }),
    /remainingRepairYears/,
  );
  assert.throws(() => serviceCallVsReplaceNote({}), /missing rows/);
});
