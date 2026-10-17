import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realization, sampleRows, summaryText, resultCsv } from './calc.mjs';

const one = (over = {}) => ({
  rows: [{ name: 'A', hoursWorked: 100, standardRate: 400, billed: 36000, collected: 30000, ...over }],
});

test('realization, collection and yield are the three ratios and multiply', () => {
  const r = realization(one());
  assert.equal(r.ok, true);
  assert.equal(r.firm.standardValue, 40000);
  assert.equal(r.firm.realization, 0.9);
  assert.equal(r.firm.collection, 0.8333);
  assert.equal(r.firm.yield, 0.75);
  assert.equal(r.firm.preBillWriteDown, 4000);
  assert.equal(r.firm.postBillLoss, 6000);
  assert.equal(r.firm.leakage, 10000);
  assert.equal(r.firm.effectiveRate, 300);
  assert.equal(r.firm.standardRate, 400);
});

test('leakage is ranked in dollars, not by rate, and the page says when they disagree', () => {
  const r = realization({
    rows: [
      { name: 'Big', hoursWorked: 2000, standardRate: 400, billed: 640000, collected: 600000 },
      { name: 'Small', hoursWorked: 100, standardRate: 400, billed: 24000, collected: 20000 },
    ],
  });
  assert.equal(r.timekeepers[0].name, 'Big');
  assert.ok(r.timekeepers[1].yield < r.timekeepers[0].yield || r.timekeepers[1].name === 'Small');
  assert.ok(r.findings.some((f) => /wrong person first/.test(f)));
});

test('billing above standard is allowed and reported as realization over 100%', () => {
  const r = realization(one({ billed: 44000, collected: 44000 }));
  assert.equal(r.ok, true);
  assert.equal(r.firm.realization, 1.1);
  assert.equal(r.firm.leakage, -4000);
  assert.match(r.findings[0], /same period/);
});

test('collected above billed is an error pointing at the column', () => {
  const r = realization(one({ collected: 40000 }));
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].id, 'row-0-collected');
});

test('blank rows are skipped, partial rows are rejected by field', () => {
  const r = realization({ rows: [{ name: 'A', hoursWorked: 10, standardRate: 100, billed: 900, collected: 800 }, {}, { name: 'B' }] });
  assert.equal(r.ok, false);
  assert.deepEqual(
    r.errors.map((e) => e.id).sort(),
    ['row-2-billed', 'row-2-collected', 'row-2-hoursWorked', 'row-2-standardRate'],
  );
  assert.equal(realization({ rows: [{}] }).errors[0].id, 'row-0-name');
});

test('inputs accept $ and commas', () => {
  const r = realization({ rows: [{ name: 'A', hoursWorked: '1,000', standardRate: '$400', billed: '$360,000', collected: '300,000' }] });
  assert.equal(r.firm.yield, 0.75);
});

test('annualisation scales a partial period', () => {
  const r = realization({ ...one(), periodMonths: 6 });
  assert.equal(r.annual.collected, 60000);
  assert.equal(r.annual.leakage, 20000);
  assert.equal(r.annual.hours, 200);
  assert.equal(r.pointValue, round(40000 * 0.01 * 0.8333 * 2));
});
const round = (n) => Math.round(n * 100) / 100;

test('a point of realization is worth standard value times collection rate', () => {
  const r = realization(one());
  assert.equal(r.pointValue, round(40000 * 0.01 * 0.8333));
  assert.deepEqual(r.sensitivity.map((s) => s.points), [1, 3, 5]);
  assert.equal(r.sensitivity[2].annualValue, round(r.pointValue * 5));
});

test('lockup days come from WIP over standard value per day and receivables over billing per day', () => {
  const r = realization({ ...one(), periodMonths: 12, wipBalance: 4000, receivables: 9000 });
  assert.equal(r.lockup.wipDays, 36.5);
  assert.equal(r.lockup.receivableDays, 91.25);
  assert.equal(r.lockup.total, 127.75);
  assert.equal(realization(one()).lockup.total, null);
});

test('target is answered as hours needed and as yield needed', () => {
  const r = realization({ ...one(), targetCollected: 60000 });
  assert.equal(r.targetPlan.gap, 30000);
  assert.equal(r.targetPlan.hoursNeededAtCurrentYield, 200);
  assert.equal(r.targetPlan.yieldNeededAtCurrentHours, 1.5);
});

test('utilization needs available hours on every row, and hours cannot exceed them', () => {
  assert.equal(realization(one({ hoursAvailable: 200 })).firm.utilization, 0.5);
  assert.equal(realization(one()).firm.utilization, null);
  assert.equal(realization(one({ hoursAvailable: 50 })).ok, false);
});

test('period and optional firm fields are validated', () => {
  assert.equal(realization({ ...one(), periodMonths: 0 }).errors[0].id, 'periodMonths');
  assert.equal(realization({ ...one(), wipBalance: -1 }).errors[0].id, 'wipBalance');
  assert.equal(realization({ ...one(), targetCollected: 0 }).errors[0].id, 'targetCollected');
});

test('sample data computes and summary and CSV render', () => {
  const r = realization({ rows: sampleRows(), wipBalance: 210000, receivables: 380000, targetCollected: 2000000 });
  assert.equal(r.ok, true);
  assert.equal(r.timekeepers.length, 5);
  assert.match(summaryText(r), /Yield 76\.0%/);
  const csv = resultCsv(r).trim().split('\n');
  assert.equal(csv.length, 7);
  assert.match(csv[0], /^timekeeper,/);
  assert.match(csv.at(-1), /^Firm,/);
});

test('csv quotes names containing commas', () => {
  const r = realization(one({ name: 'Smith, J' }));
  assert.match(resultCsv(r), /"Smith, J"/);
});
