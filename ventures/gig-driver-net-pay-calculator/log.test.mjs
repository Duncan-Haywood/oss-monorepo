import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSession } from './calc.mjs';
import { toLogEntry, weekStart, rollup, byWeek, parseLog, toCsv } from './log.mjs';

const base = { mpg: 28, gasPrice: 3.49, maintenancePerMile: 0.07, insuranceMonthly: 150, otherFixedMonthly: 25, monthlyMiles: 1200 };
const entry = (date, input) => toLogEntry(calculateSession({ ...base, ...input }), { date });

test('rates are total over total, not an average of per-session rates', () => {
  const short = { date: '2026-10-05', grossPay: 100, milesDriven: 10, hoursActive: 1, vehicleCost: 0, netProfit: 100, taxReserve: 0 };
  const long = { date: '2026-10-06', grossPay: 100, milesDriven: 90, hoursActive: 9, vehicleCost: 0, netProfit: 100, taxReserve: 0 };
  const r = rollup([short, long]);
  assert.equal(r.netPerHour, 20); // average of 100 and 11.11 would be 55.6
  assert.equal(r.netPerMile, 2);
});

test('rollup matches calculateSession for a single entry', () => {
  const input = { grossPay: 180, milesDriven: 90, hoursActive: 6, taxReservePercent: 25 };
  const single = calculateSession({ ...base, ...input });
  const r = rollup([entry('2026-10-05', input)]);
  assert.ok(Math.abs(r.netPerHour - single.netPerHour) < 1e-9);
  assert.ok(Math.abs(r.takeHome - single.takeHome) < 1e-9);
});

test('zero hours or miles gives null rates, not NaN', () => {
  const r = rollup([]);
  assert.equal(r.netPerHour, null);
  assert.equal(r.vehicleShareOfGross, null);
});

test('weekStart is the Monday, including across a month boundary and for Sunday', () => {
  assert.equal(weekStart('2026-10-05'), '2026-10-05'); // Monday
  assert.equal(weekStart('2026-10-11'), '2026-10-05'); // Sunday
  assert.equal(weekStart('2026-11-01'), '2026-10-26');
});

test('byWeek groups and sorts newest first', () => {
  const weeks = byWeek([entry('2026-10-05', { grossPay: 50, milesDriven: 5, hoursActive: 1 }), entry('2026-10-13', { grossPay: 60, milesDriven: 5, hoursActive: 1 }), entry('2026-10-07', { grossPay: 70, milesDriven: 5, hoursActive: 1 })]);
  assert.deepEqual(weeks.map(w => [w.week, w.sessions]), [['2026-10-12', 1], ['2026-10-05', 2]]);
});

test('toLogEntry rejects a bad date; parseLog survives junk', () => {
  assert.throws(() => toLogEntry({}, { date: 'tomorrow' }));
  assert.deepEqual(parseLog('{not json'), []);
  assert.deepEqual(parseLog('{"a":1}'), []);
  assert.equal(parseLog('[{"date":"2026-10-05"},{"date":"x"},null]').length, 1);
});

test('CSV quotes commas and neutralises formula cells', () => {
  const csv = toCsv([{ ...entry('2026-10-05', { grossPay: 10, milesDriven: 1, hoursActive: 1 }), label: '=HYPERLINK("x"),dash' }]);
  const row = csv.split('\n')[1];
  assert.ok(row.includes(`"'=HYPERLINK(""x""),dash"`));
});

import { byWeekday, extremes } from './log.mjs';

test('byWeekday groups total-over-total and sorts best first', () => {
  const e = (date, netProfit, hoursActive) => ({ date, netProfit, hoursActive, grossPay: netProfit, milesDriven: 1, vehicleCost: 0, taxReserve: 0 });
  // 2026-10-12 and 2026-10-19 are Mondays; 2026-10-13 is a Tuesday.
  const days = byWeekday([e('2026-10-12', 30, 2), e('2026-10-19', 10, 2), e('2026-10-13', 40, 2)]);
  assert.deepEqual(days.map((d) => d.day), ['Tue', 'Mon']);
  assert.equal(days[1].sessions, 2);
  assert.equal(days[1].netPerHour, 10);
});

test('extremes picks best and worst by rate and skips zero-hour sessions', () => {
  const e = (date, netProfit, hoursActive) => ({ date, netProfit, hoursActive });
  const { best, worst } = extremes([e('2026-10-12', 30, 2), e('2026-10-13', 5, 1), e('2026-10-14', 99, 0)]);
  assert.equal(best.entry.date, '2026-10-12');
  assert.equal(worst.entry.date, '2026-10-13');
  assert.deepEqual(extremes([]), { best: null, worst: null });
});
